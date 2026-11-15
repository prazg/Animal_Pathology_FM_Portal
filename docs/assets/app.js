import { probeClientHardware, evaluateHardwareFit } from "./hardware.js";
import { generateDemoJob, generateSampleShowcaseJobs } from "./demo.js";
import { renderJobViewer } from "./viewers.js";

const state = {
  registry: null,
  section: "models",
  mode: localStorage.getItem("apfm_mode") || "demo",
  backendUrl: localStorage.getItem("apfm_backend") || "http://127.0.0.1:8000",
  portalKey: sessionStorage.getItem("apfm_key") || "",
  hfToken: sessionStorage.getItem("apfm_hf_token") || "",
  serverConnected: false,
  serverHealth: null,
  serverWeights: {},
  clientHw: { gpuName: "Detecting…", estimatedVramGb: 24, cores: 8, ramGb: 16 },
  selectedVramGb: 24,
  filters: {
    search: "",
    species: "all",
    family: "all",
    openOnly: true,
    ungated: false,
    commercial: false,
    fitsHw: false,
    cachedServer: false
  },
  run: {
    modelId: "tissuedecision-9b",
    task: "tox_vqa",
    files: []
  },
  jobs: [],
  activeJobId: null
};

async function init() {
  initTheme();
  bindNavigation();
  bindCopyButtons();

  const res = await fetch("./models.json");
  state.registry = await res.json();

  state.clientHw = await probeClientHardware();
  updateHwBar();

  populateHeroCounts();
  buildFamilyFilters();
  bindFilterControls();
  renderSlideRack();
  initRunForm();
  renderDatasetsAndPapers();
  initConnectSection();

  // Pre-seed showcase jobs so Results has rich rodent examples ready immediately
  state.jobs = generateSampleShowcaseJobs(state.registry.models);
  state.activeJobId = state.jobs[0]?.id || null;
  renderJobsList();

  // Route initial hash if present
  const hash = (location.hash || "#models").replace("#", "");
  if (["models", "run", "results", "datasets", "connect"].includes(hash)) {
    switchSection(hash);
  }

  if (state.mode === "server") {
    pingServer(true);
  }
}

function initTheme() {
  const saved = localStorage.getItem("apfm_theme") || "brightfield";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "brightfield" ? "darkfield" : "brightfield";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("apfm_theme", next);
  });
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.goto));
  });
  document.getElementById("connPill").addEventListener("click", () => switchSection("connect"));
}

function switchSection(sec) {
  state.section = sec;
  history.replaceState(null, "", `#${sec}`);
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.section === sec);
  });
  document.querySelectorAll(".portal-section").forEach((el) => {
    el.classList.toggle("active", el.id === `sec-${sec}`);
  });
  if (sec === "results") {
    renderJobsList();
  }
}

function bindCopyButtons(root = document) {
  root.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      navigator.clipboard.writeText(target.textContent.trim());
      const orig = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = orig), 1400);
    };
  });
}

function populateHeroCounts() {
  const models = state.registry.models;
  const openCount = models.filter((m) => m.open_weights).length;
  const refCount = models.length - openCount;
  document.getElementById("navModelCount").textContent = String(models.length);
  document.getElementById("statOpenCount").textContent = String(openCount);
  document.getElementById("statRefCount").textContent = String(refCount);
  document.getElementById("statTaskCount").textContent = String(Object.keys(state.registry.tasks).length);
  document.getElementById("statDatasetCount").textContent = String(state.registry.datasets.length);
}

function updateHwBar() {
  const sel = document.getElementById("vramSelect");
  const vram = sel.value === "auto" ? state.clientHw.estimatedVramGb : Number(sel.value);
  state.selectedVramGb = vram;

  const txt = document.getElementById("hwSummaryText");
  if (state.serverConnected && state.serverHealth) {
    const h = state.serverHealth;
    txt.textContent = `Connected Server: ${h.gpu_name || h.device} · ${h.vram_gb ? h.vram_gb + " GB VRAM" : "CPU"} · ${h.cpu_cores} cores · ${h.ram_gb} GB RAM`;
  } else {
    txt.textContent = `Client GPU: ${state.clientHw.gpuName} · Compatibility badges evaluated at ${vram} GB VRAM`;
  }
}

function buildFamilyFilters() {
  const wrap = document.getElementById("familyFilterList");
  wrap.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "fam-btn active";
  allBtn.dataset.family = "all";
  allBtn.innerHTML = `<span>All Families</span><span>${state.registry.models.length}</span>`;
  allBtn.onclick = () => setFamilyFilter("all");
  wrap.appendChild(allBtn);

  state.registry.families.forEach((fam) => {
    const count = state.registry.models.filter((m) => m.family === fam.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fam-btn";
    btn.dataset.family = fam.id;
    btn.innerHTML = `<span><span class="fam-dot" style="background:${fam.color}"></span>${esc(fam.label)}</span><span>${count}</span>`;
    btn.onclick = () => setFamilyFilter(fam.id);
    wrap.appendChild(btn);
  });
}

function setFamilyFilter(famId) {
  state.filters.family = famId;
  document.querySelectorAll(".fam-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.family === famId);
  });
  renderSlideRack();
}

function bindFilterControls() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.filters.search = e.target.value.trim().toLowerCase();
    renderSlideRack();
  });

  document.querySelectorAll("#speciesFilterList .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filters.species = btn.dataset.species;
      document.querySelectorAll("#speciesFilterList .pill-btn").forEach((b) =>
        b.classList.toggle("active", b.dataset.species === state.filters.species)
      );
      renderSlideRack();
    });
  });

  const mapChecks = [
    ["chkOpenOnly", "openOnly"],
    ["chkUngated", "ungated"],
    ["chkCommercial", "commercial"],
    ["chkFitsHw", "fitsHw"],
    ["chkCachedServer", "cachedServer"]
  ];
  mapChecks.forEach(([id, key]) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state.filters[key] = e.target.checked;
      renderSlideRack();
    });
  });

  document.getElementById("vramSelect").addEventListener("change", () => {
    updateHwBar();
    renderSlideRack();
  });

  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    state.filters = {
      search: "",
      species: "all",
      family: "all",
      openOnly: false,
      ungated: false,
      commercial: false,
      fitsHw: false,
      cachedServer: false
    };
    document.getElementById("searchInput").value = "";
    document.getElementById("chkOpenOnly").checked = false;
    document.getElementById("chkUngated").checked = false;
    document.getElementById("chkCommercial").checked = false;
    document.getElementById("chkFitsHw").checked = false;
    document.getElementById("chkCachedServer").checked = false;
    document.querySelectorAll("#speciesFilterList .pill-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.species === "all")
    );
    setFamilyFilter("all");
  });

  document.getElementById("closeDrawerBtn").addEventListener("click", () => {
    document.getElementById("modelDrawer").close();
  });
  document.getElementById("modelDrawer").addEventListener("click", (e) => {
    if (e.target.id === "modelDrawer") e.target.close();
  });
}

function filterModels() {
  const f = state.filters;
  return state.registry.models.filter((m) => {
    if (f.openOnly && !m.open_weights) return false;
    if (f.ungated && (m.gated || !m.open_weights)) return false;
    if (f.commercial && !m.commercial_ok) return false;
    if (f.species !== "all" && m.species_tier !== f.species) return false;
    if (f.family !== "all" && m.family !== f.family) return false;
    if (f.fitsHw) {
      const fit = evaluateHardwareFit(m, state.selectedVramGb);
      if (fit.status !== "ok" && fit.status !== "tight") return false;
    }
    if (f.cachedServer && !state.serverWeights[m.id]?.cached) return false;
    if (f.search) {
      const hay = [
        m.name,
        m.org,
        m.license,
        m.architecture,
        m.highlights,
        m.training_data,
        ...(m.species_tags || [])
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    return true;
  });
}

function renderSlideRack() {
  const rack = document.getElementById("slideRack");
  const filtered = filterModels();
  const total = state.registry.models.length;
  document.getElementById("showingCountLabel").textContent =
    `Showing ${filtered.length} of ${total} models (${state.filters.openOnly ? "open-weights filter active — uncheck to include proprietary tox papers" : "including literature references"})`;

  rack.innerHTML = "";
  if (!filtered.length) {
    rack.innerHTML = `<div class="empty-box">No models match current filters. Try unchecking filters or clicking <strong>Reset Filters</strong>.</div>`;
    return;
  }

  const famColor = Object.fromEntries(state.registry.families.map((f) => [f.id, f.color]));

  filtered.forEach((m) => {
    const hw = evaluateHardwareFit(m, state.selectedVramGb);
    const tierBadge =
      m.species_tier === "rodent_native"
        ? `<span class="badge badge-rodent">Rodent-Native</span>`
        : m.species_tier === "multi_species"
        ? `<span class="badge badge-vet">Multi-Species / Vet</span>`
        : `<span class="badge badge-gated">Cross-Species</span>`;

    const openBadge = m.open_weights
      ? `<span class="badge badge-open">${m.gated ? "Open (Gated HF)" : "Open (Ungated)"}</span>`
      : `<span class="badge badge-ref">Paper Reference</span>`;

    const cachedBadge = state.serverWeights[m.id]?.cached
      ? `<span class="badge badge-open">Cached Ready</span>`
      : "";

    const card = document.createElement("article");
    card.className = "slide-card";
    card.style.setProperty("--slide-stain", famColor[m.family] || "var(--haem)");
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="slide-label">
        <div>
          <div class="slide-title">${esc(m.name)}</div>
          <div class="slide-org">${esc(m.org)} (${m.year})</div>
        </div>
        <div class="badge-row">
          ${tierBadge}
          ${openBadge}
          <span class="badge ${hw.css}">${esc(hw.label)}</span>
          ${cachedBadge}
        </div>
      </div>
      <div class="slide-specimen">
        <div class="slide-highlights">${esc(m.highlights)}</div>
        <dl class="spec-dl">
          <div><dt>Params</dt><dd>${esc(m.params || "—")}</dd></div>
          <div><dt>Embed / Out</dt><dd>${m.embed_dim ? m.embed_dim + "-D" : "VLM"}</dd></div>
          <div><dt>Patch / Mag</dt><dd>${m.patch_px}px · ${esc(m.magnification)}</dd></div>
        </dl>
        <div class="slide-foot">
          <div class="species-mini-tags">
            ${(m.species_tags || []).slice(0, 3).map((t) => `<span class="species-mini">${esc(t)}</span>`).join("")}
          </div>
          <span class="link-btn">Inspect &amp; Code →</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => openModelDrawer(m));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openModelDrawer(m);
    });
    rack.appendChild(card);
  });
}

function openModelDrawer(m) {
  const dlg = document.getElementById("modelDrawer");
  document.getElementById("drawerTitle").textContent = m.name;
  document.getElementById("drawerOrg").textContent = `${m.org} · ${m.architecture} · License: ${m.license}`;

  const badges = document.getElementById("drawerBadges");
  badges.innerHTML = `
    <span class="badge ${m.open_weights ? "badge-open" : "badge-ref"}">${m.open_weights ? "Open Weights" : "Proprietary / Reference"}</span>
    ${(m.species_tags || []).map((t) => `<span class="badge badge-rodent">${esc(t)}</span>`).join("")}
  `;

  const body = document.getElementById("drawerBody");
  const papersHtml = (m.papers || [])
    .map(
      (p) => `
      <div style="margin-bottom:0.55rem">
        <a href="${esc(p.url)}" target="_blank" rel="noopener"><strong>${esc(p.label)} ↗</strong></a>
        <div class="muted-note" style="margin-top:0.12rem">${esc(p.citation)}</div>
      </div>`
    )
    .join("");

  const hubLinks = [];
  if (m.hf_repo) {
    hubLinks.push(`<a class="ext-pill" href="https://huggingface.co/${esc(m.hf_repo)}" target="_blank" rel="noopener">🤗 Hugging Face (${esc(m.hf_repo)}) ↗</a>`);
  }
  if (m.github_url) {
    hubLinks.push(`<a class="ext-pill" href="${esc(m.github_url)}" target="_blank" rel="noopener">💻 Code / Repo ↗</a>`);
  }

  body.innerHTML = `
    <div class="drawer-block">
      <h4>Preclinical &amp; Animal Pathology Relevance</h4>
      <p style="margin:0 0 0.55rem">${esc(m.highlights)}</p>
      <div class="muted-note"><strong>Pretraining Corpus:</strong> ${esc(m.training_data)}</div>
      <div class="link-pills mt-sm">${hubLinks.join("")}</div>
    </div>

    <div class="drawer-block">
      <h4>Papers, Preprints &amp; Citations</h4>
      ${papersHtml}
      <details class="mt-sm">
        <summary style="cursor:pointer;font-weight:700;font-size:0.82rem">BibTeX Citation</summary>
        <div class="code-row mt-xs">
          <code id="drawerBibtex" style="white-space:pre">${esc(m.bibtex || "")}</code>
          <button type="button" class="copy-mini" data-copy-target="drawerBibtex">Copy BibTeX</button>
        </div>
      </details>
    </div>

    <div class="drawer-block">
      <h4>1. Download Weights Locally (CLI)</h4>
      <div class="code-row">
        <code id="drawerCliCmd">${esc(m.cli_download || "")}</code>
        <button type="button" class="copy-mini" data-copy-target="drawerCliCmd">Copy CLI</button>
      </div>
      ${
        m.vram_min_gb
          ? `<div class="muted-note">Weights size: ~${m.weights_gb} GB · Minimum VRAM: ${m.vram_min_gb} GB (Recommended: ${m.vram_rec_gb} GB)</div>`
          : ""
      }
    </div>

    <div class="drawer-block">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 style="margin:0">2. Local Python Inference Quickstart</h4>
        <button type="button" class="secondary-btn" id="copyPySnippetBtn" style="padding:0.22rem 0.6rem;font-size:0.75rem">Copy Python</button>
      </div>
      <pre class="pre-code" id="drawerPyCode">${esc(m.python_snippet || "")}</pre>
    </div>

    <div style="display:flex;gap:0.65rem;flex-wrap:wrap">
      ${
        m.runnable
          ? `<button type="button" class="primary-btn" id="drawerRunBtn">Open in Run Workbench →</button>`
          : ""
      }
      ${
        m.open_weights && m.hf_repo
          ? `<button type="button" class="secondary-btn" id="drawerCacheBtn">Download to Connected Local Server</button>`
          : ""
      }
    </div>
  `;

  bindCopyButtons(body);

  body.querySelector("#copyPySnippetBtn").onclick = (e) => {
    navigator.clipboard.writeText(m.python_snippet || "");
    e.target.textContent = "Copied ✓";
    setTimeout(() => (e.target.textContent = "Copy Python"), 1400);
  };

  const runBtn = body.querySelector("#drawerRunBtn");
  if (runBtn) {
    runBtn.onclick = () => {
      dlg.close();
      selectModelForRun(m.id);
      switchSection("run");
    };
  }

  const cacheBtn = body.querySelector("#drawerCacheBtn");
  if (cacheBtn) {
    cacheBtn.onclick = () => {
      dlg.close();
      switchSection("connect");
      triggerServerWeightDownload(m.id);
    };
  }

  dlg.showModal();
}

/* RUN WORKBENCH */
function initRunForm() {
  const select = document.getElementById("runModelSelect");
  const runnable = state.registry.models.filter((m) => m.runnable);
  select.innerHTML = runnable
    .map((m) => `<option value="${esc(m.id)}">${esc(m.name)} — ${esc(m.species_tags[0])} (${esc(m.params)})</option>`)
    .join("");

  select.addEventListener("change", () => selectModelForRun(select.value));
  selectModelForRun(runnable[0].id);

  // Tile upload / dropzone
  const dz = document.getElementById("tileDropzone");
  const fileIn = document.getElementById("tileFileInput");
  document.getElementById("browseTilesBtn").onclick = () => fileIn.click();
  fileIn.onchange = () => handleFiles(fileIn.files);
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("dragover");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  document.getElementById("runForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await executeRun();
  });

  document.getElementById("loadSampleJobsBtn").addEventListener("click", () => {
    state.jobs = generateSampleShowcaseJobs(state.registry.models);
    state.activeJobId = state.jobs[0]?.id || null;
    renderJobsList();
  });
}

function handleFiles(fileList) {
  state.run.files = Array.from(fileList || []);
  const strip = document.getElementById("tilePreviewStrip");
  strip.innerHTML = "";
  state.run.files.slice(0, 12).forEach((file) => {
    const div = document.createElement("div");
    div.className = "thumb-item";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.title = file.name;
    div.appendChild(img);
    strip.appendChild(div);
  });
}

function selectModelForRun(modelId) {
  const m = state.registry.models.find((x) => x.id === modelId);
  if (!m) return;
  state.run.modelId = m.id;
  document.getElementById("runModelSelect").value = m.id;
  document.getElementById("runModelMeta").innerHTML = `
    <strong>${esc(m.architecture)}</strong> · License: <code>${esc(m.license)}</code> · Min VRAM: <strong>${m.vram_min_gb} GB</strong>
    <div style="margin-top:0.25rem;color:var(--ink-muted)">${esc(m.highlights)}</div>
  `;

  const taskWrap = document.getElementById("runTaskControl");
  taskWrap.innerHTML = "";
  m.tasks.forEach((tid, idx) => {
    const tInfo = state.registry.tasks[tid];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `task-chip ${idx === 0 ? "active" : ""}`;
    btn.textContent = tInfo?.label || tid;
    btn.onclick = () => selectTaskForRun(tid, btn);
    taskWrap.appendChild(btn);
  });
  selectTaskForRun(m.tasks[0], taskWrap.firstElementChild);
}

function selectTaskForRun(taskId, clickedBtn) {
  state.run.task = taskId;
  document.querySelectorAll("#runTaskControl .task-chip").forEach((b) => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");

  const tInfo = state.registry.tasks[taskId] || {};
  document.getElementById("runTaskDesc").textContent = tInfo.description || "";

  const isWsi = tInfo.input === "wsi";
  document.getElementById("tileInputBox").classList.toggle("hidden", isWsi);
  document.getElementById("wsiInputBox").classList.toggle("hidden", !isWsi && tInfo.input !== "wsi_or_tiles");

  const pBox = document.getElementById("dynamicParamsBox");
  if (taskId === "tox_vqa" || taskId === "zeroshot_classify") {
    pBox.innerHTML = `
      <div>
        <label class="field-label" for="paramOrgan">Species &amp; Organ Context</label>
        <input type="text" id="paramOrgan" class="text-input" value="Sprague-Dawley Rat Liver (H&E, 20x)" />
      </div>
      <div>
        <label class="field-label" for="paramPrompts">Candidate Toxicologic / Histologic Findings (one per line)</label>
        <textarea id="paramPrompts" class="text-input mono" rows="5">Normal hepatic parenchyma
Centrilobular hepatocellular necrosis
Periportal bile duct hyperplasia
Microvesicular steatosis
Mononuclear inflammatory cell infiltrate</textarea>
      </div>
    `;
  } else if (taskId === "predict_omics") {
    pBox.innerHTML = `
      <div>
        <label class="field-label" for="paramGenes">Target Mus musculus Marker Panel</label>
        <input type="text" id="paramGenes" class="text-input mono" value="Alb, Cyp2e1, Glul, Havcr1, Col1a1, Ptprc" />
      </div>
    `;
  } else {
    pBox.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        <div>
          <label class="field-label" for="paramK">Morphological Clusters (k-means)</label>
          <input type="number" id="paramK" class="text-input" min="2" max="8" value="3" />
        </div>
        <div>
          <label class="field-label" for="paramMag">Target Magnification</label>
          <select id="paramMag" class="text-input">
            <option value="20x" selected>20x (0.5 µm/px)</option>
            <option value="40x">40x (0.25 µm/px)</option>
            <option value="10x">10x (1.0 µm/px)</option>
          </select>
        </div>
      </div>
    `;
  }
}

async function executeRun() {
  const m = state.registry.models.find((x) => x.id === state.run.modelId);
  const statusEl = document.getElementById("runStatusMsg");
  const params = {
    organ: document.getElementById("paramOrgan")?.value,
    prompts: document.getElementById("paramPrompts")?.value,
    genes: document.getElementById("paramGenes")?.value,
    k_clusters: document.getElementById("paramK")?.value || 3,
    magnification: document.getElementById("paramMag")?.value || "20x"
  };

  if (state.mode === "server" && state.serverConnected) {
    statusEl.textContent = "Submitting job to local FastAPI runner…";
    try {
      const fd = new FormData();
      fd.append("model_id", m.id);
      fd.append("task", state.run.task);
      fd.append("params", JSON.stringify(params));
      const wsiPath = document.getElementById("wsiPathInput")?.value?.trim();
      if (wsiPath) fd.append("wsi_path", wsiPath);
      state.run.files.forEach((f) => fd.append("files", f));

      const r = await apiFetch("/api/jobs", { method: "POST", body: fd });
      const created = await r.json();
      const job = await pollServerJob(created.id, statusEl);
      state.jobs.unshift(job);
      state.activeJobId = job.id;
      statusEl.textContent = "";
      switchSection("results");
      return;
    } catch (err) {
      statusEl.textContent = `Server error (${err.message}); falling back to Demo simulation…`;
    }
  }

  const job = generateDemoJob(
    m,
    state.run.task,
    params,
    state.run.files.map((f) => f.name)
  );
  state.jobs.unshift(job);
  state.activeJobId = job.id;
  statusEl.textContent = "";
  switchSection("results");
}

async function pollServerJob(jobId, statusEl) {
  for (let i = 0; i < 120; i++) {
    const r = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const data = await r.json();
    statusEl.textContent = `${data.status} (${Math.round((data.progress || 0) * 100)}%) — ${data.message || ""}`;
    if (data.status === "completed" || data.status === "failed") {
      if (data.status === "failed") throw new Error(data.error || "Job failed");
      return data;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  throw new Error("Timed out waiting for job");
}

function renderJobsList() {
  document.getElementById("navJobCount").textContent = String(state.jobs.length);
  const side = document.getElementById("jobsList");
  const stage = document.getElementById("viewerStage");

  if (!state.jobs.length) {
    side.innerHTML = `<div class="empty-box">No runs yet.</div>`;
    return;
  }

  side.innerHTML = "";
  state.jobs.forEach((j) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `job-item ${j.id === state.activeJobId ? "active" : ""}`;
    btn.innerHTML = `
      <div class="job-item-title">${esc(j.model_name)}</div>
      <div class="job-item-sub">${esc(j.task)} · ${j.mode === "demo" ? "Demo" : "Server"} · ${esc(j.created_at || "")}</div>
    `;
    btn.onclick = () => {
      state.activeJobId = j.id;
      renderJobsList();
    };
    side.appendChild(btn);
  });

  const active = state.jobs.find((j) => j.id === state.activeJobId) || state.jobs[0];
  if (active) {
    renderJobViewer(stage, active, state.backendUrl, state.portalKey);
  }
}

/* DATASETS & PAPERS */
function renderDatasetsAndPapers() {
  const dsGrid = document.getElementById("datasetGrid");
  dsGrid.innerHTML = state.registry.datasets
    .map((d) => {
      const links = [];
      if (d.paper_url) links.push(`<a class="ext-pill" href="${esc(d.paper_url)}" target="_blank" rel="noopener">📄 Paper / DOI ↗</a>`);
      if (d.hf_url) links.push(`<a class="ext-pill" href="${esc(d.hf_url)}" target="_blank" rel="noopener">🤗 Hugging Face ↗</a>`);
      if (d.github_url) links.push(`<a class="ext-pill" href="${esc(d.github_url)}" target="_blank" rel="noopener">💻 Repo / Tiles ↗</a>`);

      const cid = `ds-cli-${d.id}`;
      return `
        <div class="dataset-card">
          <div>
            <h3>${esc(d.name)}</h3>
            <div class="dataset-meta mt-xs"><strong>Species:</strong> ${esc(d.species)}</div>
            <div class="dataset-meta"><strong>Scale:</strong> ${esc(d.scale)} · <strong>License:</strong> ${esc(d.license)}</div>
          </div>
          <div class="link-pills">${links.join("")}</div>
          <div class="code-row">
            <code id="${cid}">${esc(d.cli)}</code>
            <button type="button" class="copy-mini" data-copy-target="${cid}">Copy</button>
          </div>
        </div>
      `;
    })
    .join("");
  bindCopyButtons(dsGrid);

  const tbody = document.getElementById("papersTableBody");
  tbody.innerHTML = state.registry.models
    .map((m) => {
      const p = m.papers?.[0];
      const hub = [];
      if (m.hf_repo) hub.push(`<a href="https://huggingface.co/${esc(m.hf_repo)}" target="_blank" rel="noopener">HF Hub ↗</a>`);
      if (m.github_url) hub.push(`<a href="${esc(m.github_url)}" target="_blank" rel="noopener">GitHub / UI ↗</a>`);
      return `
        <tr>
          <td><strong>${esc(m.name)}</strong><div class="muted-note">${esc(m.org)}</div></td>
          <td>${(m.species_tags || []).map((s) => `<span class="species-mini">${esc(s)}</span>`).join(" ")}</td>
          <td>
            <span class="badge ${m.open_weights ? "badge-open" : "badge-ref"}">${m.open_weights ? "Open Weights" : "Proprietary"}</span>
            <div class="muted-note">${esc(m.license)}</div>
          </td>
          <td>${p ? `<a href="${esc(p.url)}" target="_blank" rel="noopener"><strong>${esc(p.label)} ↗</strong></a><div class="muted-note">${esc(p.citation)}</div>` : "—"}</td>
          <td>${hub.join(" · ") || "—"}</td>
        </tr>
      `;
    })
    .join("");
}

/* CONNECT & WEIGHTS MANAGER */
function initConnectSection() {
  const urlIn = document.getElementById("backendUrlInput");
  const keyIn = document.getElementById("portalKeyInput");
  const hfIn = document.getElementById("hfTokenInput");

  urlIn.value = state.backendUrl;
  keyIn.value = state.portalKey;
  hfIn.value = state.hfToken;

  const syncModeUi = () => {
    document.getElementById("modeDemoBtn").classList.toggle("active", state.mode === "demo");
    document.getElementById("modeServerBtn").classList.toggle("active", state.mode === "server");
    const pill = document.getElementById("connPill");
    const lbl = document.getElementById("connLabel");
    if (state.mode === "server" && state.serverConnected) {
      pill.classList.add("connected");
      lbl.textContent = `Connected (${state.serverHealth?.mock ? "Mock API" : "Local GPU"})`;
    } else {
      pill.classList.remove("connected");
      lbl.textContent = state.mode === "demo" ? "Demo Mode (No GPU)" : "Server Disconnected";
    }
  };

  document.getElementById("modeDemoBtn").onclick = () => {
    state.mode = "demo";
    state.serverConnected = false;
    localStorage.setItem("apfm_mode", "demo");
    document.getElementById("serverHealthBox").innerHTML = "Running in client-side <strong>Demo Mode</strong>. Switch to <em>My Local / HPC Server</em> to connect to <code>backend/server.py</code>.";
    syncModeUi();
    updateHwBar();
  };

  document.getElementById("modeServerBtn").onclick = () => {
    state.mode = "server";
    localStorage.setItem("apfm_mode", "server");
    syncModeUi();
    pingServer(false);
  };

  document.getElementById("pingServerBtn").onclick = () => {
    state.backendUrl = urlIn.value.trim() || "http://127.0.0.1:8000";
    state.portalKey = keyIn.value.trim();
    state.hfToken = hfIn.value.trim();
    localStorage.setItem("apfm_backend", state.backendUrl);
    sessionStorage.setItem("apfm_key", state.portalKey);
    sessionStorage.setItem("apfm_hf_token", state.hfToken);
    state.mode = "server";
    localStorage.setItem("apfm_mode", "server");
    pingServer(false).then(syncModeUi);
  };

  document.getElementById("checkHfAccessBtn").onclick = async () => {
    state.hfToken = hfIn.value.trim();
    sessionStorage.setItem("apfm_hf_token", state.hfToken);
    if (!state.serverConnected) {
      alert("Connect to your local FastAPI backend first, or run `hf auth login` in your terminal.");
      return;
    }
    const r = await apiFetch("/api/weights/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hf_token: state.hfToken })
    });
    const data = await r.json();
    document.getElementById("serverHealthBox").innerHTML =
      `<strong>HF Access Check:</strong> Checked ${Object.keys(data.access || {}).length} repositories.`;
    await refreshWeightsTable();
  };

  syncModeUi();
  renderWeightsTable();
}

async function pingServer(silent = false) {
  const box = document.getElementById("serverHealthBox");
  try {
    const r = await apiFetch("/api/health");
    const h = await r.json();
    state.serverConnected = true;
    state.serverHealth = h;
    box.innerHTML = `
      <strong>Connected ✓</strong> · Device: <code>${esc(h.gpu_name || h.device)}</code> ·
      Mode: <strong>${h.mock ? "Mock Test Mode" : "Live Inference"}</strong> ·
      PyTorch: <code>${esc(h.torch_version || "not installed")}</code> ·
      HF Cache: <code>${esc(h.hf_home || "")}</code>
    `;
    await refreshWeightsTable();
    updateHwBar();
    renderSlideRack();
  } catch (err) {
    state.serverConnected = false;
    if (!silent) {
      box.innerHTML = `<strong>Could not reach ${esc(state.backendUrl)}</strong> (${esc(err.message)}). Start the backend with <code>python -m uvicorn backend.server:app --port 8000</code> or stay in Demo Mode.`;
    }
  }
}

async function refreshWeightsTable() {
  if (state.serverConnected) {
    try {
      const r = await apiFetch("/api/weights");
      const data = await r.json();
      state.serverWeights = data.models || {};
    } catch (_) {
      // ignore
    }
  }
  renderWeightsTable();
}

function renderWeightsTable() {
  const tbody = document.getElementById("weightsTableBody");
  const openModels = state.registry.models.filter((m) => m.open_weights && m.hf_repo);
  tbody.innerHTML = openModels
    .map((m) => {
      const st = state.serverWeights[m.id];
      const statusBadge = st?.cached
        ? `<span class="badge badge-open">Cached Ready</span>`
        : state.serverConnected
        ? `<span class="badge badge-gated">Not Cached</span>`
        : `<span class="badge badge-gated">Offline (Use CLI)</span>`;

      const actionHtml = state.serverConnected
        ? `<button type="button" class="secondary-btn dl-weight-btn" data-mid="${esc(m.id)}" style="padding:0.25rem 0.6rem;font-size:0.76rem">${st?.cached ? "Re-verify" : "Download on Server"}</button>`
        : `<code style="font-size:0.74rem">${esc(m.cli_download)}</code>`;

      return `
        <tr>
          <td><strong>${esc(m.name)}</strong></td>
          <td><a href="https://huggingface.co/${esc(m.hf_repo)}" target="_blank" rel="noopener"><code>${esc(m.hf_repo)}</code> ↗</a></td>
          <td class="mono">${m.weights_gb ? m.weights_gb + " GB" : "—"}</td>
          <td>${m.gated ? "Gated (Accept License)" : "Ungated"}</td>
          <td>${statusBadge}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".dl-weight-btn").forEach((btn) => {
    btn.onclick = () => triggerServerWeightDownload(btn.dataset.mid);
  });
}

async function triggerServerWeightDownload(modelId) {
  if (!state.serverConnected) {
    alert("Connect to your local FastAPI server first in the Connect tab, or copy the `hf download` CLI snippet.");
    return;
  }
  const r = await apiFetch(`/api/weights/${encodeURIComponent(modelId)}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hf_token: state.hfToken || null })
  });
  const res = await r.json();
  document.getElementById("serverHealthBox").innerHTML = `<strong>Weight Download (${esc(modelId)}):</strong> ${esc(res.status)} — ${esc(res.detail || "")}`;
  await refreshWeightsTable();
  renderSlideRack();
}

async function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (state.portalKey) headers.set("X-Portal-Key", state.portalKey);
  const url = `${state.backendUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
  }
  return res;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

init();
