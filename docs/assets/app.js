import { probeClientHardware, evaluateHardwareFit } from "./hardware.js";
import { generateDemoJob, generateSampleShowcaseJobs } from "./demo.js";
import { renderJobViewer } from "./viewers.js";

const MAX_COMPARE = 4;

const APP_LABELS = {
  tox_qa: "Rodent Toxicologic QA",
  gemm_oncology: "GEMM Mouse Oncology",
  multi_organ_seg: "Multi-Organ Segmentation",
  spatial_omics: "Spatial Transcriptomics"
};

const VALID_SECTIONS = ["models", "run", "results", "datasets", "connect"];

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
    app: "all",
    species: "all",
    family: "all",
    openOnly: true,
    ungated: false,
    commercial: false,
    fitsHw: false,
    cachedServer: false
  },
  pinnedIds: [],
  run: {
    modelId: "tissuedecision-9b",
    task: "tox_vqa",
    files: [],
    previewUrls: []
  },
  jobs: [],
  activeJobId: null,
  dockNoticeTimer: null
};

async function init() {
  initTheme();
  bindNavigation();
  bindCopyButtons();
  bindKeyboardShortcuts();

  const res = await fetch("./models.json");
  state.registry = await res.json();

  loadSavedPins();

  state.clientHw = await probeClientHardware();
  updateHwBar();

  populateHeroCounts();
  buildFamilyFilters();
  bindFilterControls();
  bindComparatorControls();
  renderSlideRack();
  renderCompareDock();
  initRunForm();
  renderDatasetsAndPapers();
  initConnectSection();

  // Pre-seed showcase jobs so Results has rich rodent examples ready immediately
  state.jobs = generateSampleShowcaseJobs(state.registry.models);
  state.activeJobId = state.jobs[0]?.id || null;
  renderJobsList();

  // Route initial hash if present
  const hash = (location.hash || "#models").replace("#", "");
  if (VALID_SECTIONS.includes(hash)) {
    switchSection(hash);
  }

  if (state.mode === "server") {
    pingServer(true);
  }
}

function initTheme() {
  const saved = localStorage.getItem("apfm_theme") === "darkfield" ? "darkfield" : "brightfield";
  applyTheme(saved);

  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "brightfield" ? "darkfield" : "brightfield";
    applyTheme(next);
    localStorage.setItem("apfm_theme", next);
    if (state.section === "results" && state.jobs.length > 0) {
      renderJobsList();
    }
  });
}

function applyTheme(theme) {
  const isDark = theme === "darkfield";
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.textContent = isDark ? "✦" : "☀";
  }
  if (btn) {
    btn.setAttribute("aria-pressed", String(isDark));
    btn.title = isDark
      ? "Darkfield Fluorescence active — click for Brightfield H&E theme"
      : "Brightfield H&E active — click for Darkfield Fluorescence theme";
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.goto));
  });
  document.getElementById("connPill").addEventListener("click", () => switchSection("connect"));

  const brandLink = document.getElementById("brandLink");
  if (brandLink) {
    brandLink.addEventListener("click", (e) => {
      e.preventDefault();
      switchSection("models");
    });
  }

  window.addEventListener("hashchange", () => {
    const hash = (location.hash || "#models").replace("#", "");
    if (VALID_SECTIONS.includes(hash) && hash !== state.section) {
      switchSection(hash);
    }
  });
}

function switchSection(sec) {
  if (!VALID_SECTIONS.includes(sec)) return;
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

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const compareModal = document.getElementById("compareModal");
    const modelDrawer = document.getElementById("modelDrawer");

    if (e.key === "Escape") {
      if (compareModal?.open) {
        e.preventDefault();
        compareModal.close();
        return;
      }
      if (modelDrawer?.open) {
        e.preventDefault();
        modelDrawer.close();
        return;
      }
      const searchEl = document.getElementById("searchInput");
      if (document.activeElement === searchEl) {
        searchEl.blur();
      }
      return;
    }

    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (compareModal?.open || modelDrawer?.open) return;
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || active?.isContentEditable) {
        return;
      }
      e.preventDefault();
      if (state.section !== "models") {
        switchSection("models");
      }
      const searchEl = document.getElementById("searchInput");
      if (searchEl) {
        searchEl.focus();
        searchEl.select();
      }
    }
  });
}

async function copyTextWithFeedback(text, btn) {
  if (!btn) return;
  if (!btn.dataset.origLabel) {
    btn.dataset.origLabel = btn.textContent;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopyText(text);
    }
  } catch (_) {
    fallbackCopyText(text);
  }
  btn.textContent = "Copied ✓";
  if (btn._copyTimer) clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => {
    btn.textContent = btn.dataset.origLabel || "Copy";
    btn._copyTimer = null;
  }, 1400);
}

function fallbackCopyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch (_) {
    // ignore
  }
  document.body.removeChild(ta);
}

function bindCopyButtons(root = document) {
  root.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      copyTextWithFeedback(target.textContent.trim(), btn);
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
  const autoVram =
    state.serverConnected && state.serverHealth?.vram_gb
      ? Number(state.serverHealth.vram_gb)
      : state.clientHw.estimatedVramGb;

  const autoOpt = sel.querySelector('option[value="auto"]');
  if (autoOpt) {
    autoOpt.textContent = `Auto-detect (${autoVram} GB)`;
  }

  const vram = sel.value === "auto" ? autoVram : Number(sel.value);
  state.selectedVramGb = vram;

  const txt = document.getElementById("hwSummaryText");
  if (state.serverConnected && state.serverHealth) {
    const h = state.serverHealth;
    txt.textContent = `Connected Server: ${h.gpu_name || h.device} · ${h.vram_gb ? h.vram_gb + " GB VRAM" : "CPU"} · ${h.cpu_cores} cores · ${h.ram_gb} GB RAM · Badges @ ${vram} GB`;
  } else {
    txt.textContent = `Client GPU: ${state.clientHw.gpuName} · Compatibility badges evaluated at ${vram} GB VRAM`;
  }
}

function safeFamVar(famId) {
  const clean = String(famId ?? "").replace(/[^a-z0-9_]/gi, "");
  return clean ? `var(--c-${clean}, var(--haem))` : "var(--haem)";
}

function buildFamilyFilters() {
  const wrap = document.getElementById("familyFilterList");
  wrap.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "fam-btn active";
  allBtn.dataset.family = "all";
  allBtn.innerHTML = `<span>All Families</span><span>${esc(state.registry.models.length)}</span>`;
  allBtn.onclick = () => setFamilyFilter("all");
  wrap.appendChild(allBtn);

  state.registry.families.forEach((fam) => {
    const count = state.registry.models.filter((m) => m.family === fam.id).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fam-btn";
    btn.dataset.family = fam.id;
    btn.innerHTML = `<span><span class="fam-dot" style="background:${safeFamVar(fam.id)}"></span>${esc(fam.label)}</span><span>${esc(count)}</span>`;
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

function setAppFilter(appId) {
  state.filters.app = appId;
  document.querySelectorAll("#appQuickFilterList .app-chip").forEach((chip) => {
    const isActive = chip.dataset.app === appId;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
  renderSlideRack();
}

function matchesAppFilter(model, appId) {
  if (!appId || appId === "all") return true;
  if (appId === "ungated_open") {
    return Boolean(model.open_weights && !model.gated);
  }
  return Array.isArray(model.applications) && model.applications.includes(appId);
}

function matchesNonAppFilters(m) {
  const f = state.filters;
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
      ...(m.species_tags || []),
      ...(m.organs || []),
      ...(m.applications || []).map((a) => APP_LABELS[a] || a)
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(f.search)) return false;
  }
  return true;
}

function updateAppChipCounts() {
  const baseMatched = state.registry.models.filter((m) => matchesNonAppFilters(m));
  document.querySelectorAll("#appQuickFilterList [data-app-count]").forEach((badge) => {
    const appId = badge.dataset.appCount;
    const count = baseMatched.filter((m) => matchesAppFilter(m, appId)).length;
    badge.textContent = String(count);
  });
}

function bindFilterControls() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.filters.search = e.target.value.trim().toLowerCase();
    renderSlideRack();
  });

  document.querySelectorAll("#appQuickFilterList .app-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      setAppFilter(chip.dataset.app);
    });
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
    if (document.getElementById("compareModal")?.open) {
      renderCompareModal();
    }
  });

  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    state.filters = {
      search: "",
      app: "all",
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
    document.querySelectorAll("#appQuickFilterList .app-chip").forEach((chip) => {
      const isAll = chip.dataset.app === "all";
      chip.classList.toggle("active", isAll);
      chip.setAttribute("aria-pressed", String(isAll));
    });
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
  return state.registry.models.filter(
    (m) => matchesNonAppFilters(m) && matchesAppFilter(m, state.filters.app)
  );
}

function renderSlideRack() {
  updateAppChipCounts();
  const rack = document.getElementById("slideRack");
  const filtered = filterModels();
  const total = state.registry.models.length;
  const activeAppLabel =
    state.filters.app === "all"
      ? ""
      : state.filters.app === "ungated_open"
      ? " · Ungated Open-Weights"
      : ` · ${APP_LABELS[state.filters.app] || state.filters.app}`;

  document.getElementById("showingCountLabel").textContent =
    `Showing ${filtered.length} of ${total} models${activeAppLabel} (${state.filters.openOnly ? "open-weights filter active — uncheck to include proprietary tox papers" : "including literature references"})`;

  rack.innerHTML = "";
  if (!filtered.length) {
    rack.innerHTML = `<div class="empty-box">No models match current filters. Try switching Preclinical Application to <strong>All</strong>, unchecking filters, or clicking <strong>Reset Filters</strong>.</div>`;
    return;
  }

  filtered.forEach((m) => {
    const hw = evaluateHardwareFit(m, state.selectedVramGb);
    const isPinned = state.pinnedIds.includes(m.id);

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

    const organSummary = (m.organs || []).slice(0, 2).join(" · ");

    const card = document.createElement("article");
    card.className = `slide-card ${isPinned ? "is-pinned" : ""}`;
    card.dataset.modelId = m.id;
    card.style.setProperty("--slide-stain", safeFamVar(m.family));
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${m.name} (${m.org}, ${m.year}) — inspect details`);

    card.innerHTML = `
      <div class="slide-label">
        <div>
          <div class="slide-title-row">
            <div class="slide-title">${esc(m.name)}</div>
          </div>
          <div class="slide-org">${esc(m.org)} (${esc(m.year)})</div>
          ${organSummary ? `<div class="slide-organs" title="${esc((m.organs || []).join(", "))}">${esc(organSummary)}</div>` : ""}
        </div>
        <div class="badge-row">
          ${tierBadge}
          ${openBadge}
          <span class="badge ${esc(hw.css)}">${esc(hw.label)}</span>
          ${cachedBadge}
        </div>
      </div>
      <div class="slide-specimen">
        <div class="slide-highlights">${esc(m.highlights)}</div>
        <dl class="spec-dl">
          <div><dt>Params</dt><dd>${esc(m.params || "—")}</dd></div>
          <div><dt>Embed / Out</dt><dd>${m.embed_dim ? esc(m.embed_dim) + "-D" : "VLM"}</dd></div>
          <div><dt>Patch / Mag</dt><dd>${esc(m.patch_px)}px · ${esc(m.magnification)}</dd></div>
        </dl>
        <div class="slide-foot">
          <div class="species-mini-tags">
            ${(m.species_tags || []).slice(0, 2).map((t) => `<span class="species-mini">${esc(t)}</span>`).join("")}
          </div>
          <div class="slide-card-actions">
            <button
              type="button"
              class="pin-btn ${isPinned ? "active" : ""}"
              data-pin-id="${esc(m.id)}"
              aria-pressed="${isPinned ? "true" : "false"}"
              title="${isPinned ? "Unpin from side-by-side comparison" : "Pin model to compare side-by-side (up to 4)"}"
            >${isPinned ? "✓ Pinned" : "+ Compare"}</button>
            <span class="link-btn">Inspect →</span>
          </div>
        </div>
      </div>
    `;

    const pinBtn = card.querySelector(".pin-btn");
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinModel(m.id);
    });
    pinBtn.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    card.addEventListener("click", () => openModelDrawer(m));
    card.addEventListener("keydown", (e) => {
      if (e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModelDrawer(m);
      }
    });
    rack.appendChild(card);
  });
}

function getDeduplicatedHubLinks(m) {
  const hfFull = m.hf_repo ? `https://huggingface.co/${m.hf_repo}` : "";
  const links = [];
  if (m.hf_repo) {
    links.push({
      label: `🤗 Hugging Face (${m.hf_repo}) ↗`,
      shortLabel: "HF Hub ↗",
      url: hfFull
    });
  }
  if (m.github_url && m.github_url !== hfFull) {
    const isDemoUi = m.github_url.includes("github.io");
    links.push({
      label: isDemoUi ? "🔬 Interactive UI ↗" : "💻 Code / Repo ↗",
      shortLabel: isDemoUi ? "Web UI ↗" : "GitHub ↗",
      url: m.github_url
    });
  }
  return links;
}

function openModelDrawer(m) {
  const dlg = document.getElementById("modelDrawer");
  document.getElementById("drawerTitle").textContent = m.name;
  document.getElementById("drawerOrg").textContent = `${m.org} · ${m.architecture} · License: ${m.license}`;

  const badges = document.getElementById("drawerBadges");
  badges.innerHTML = `
    <span class="badge ${m.open_weights ? "badge-open" : "badge-ref"}">${m.open_weights ? (m.gated ? "Open Weights (Gated HF)" : "Open Weights (Ungated)") : "Proprietary / Reference"}</span>
    ${(m.species_tags || []).map((t) => `<span class="badge badge-rodent">${esc(t)}</span>`).join("")}
  `;

  const body = document.getElementById("drawerBody");
  const papersHtml = (m.papers || [])
    .map(
      (p) => `
      <div style="margin-bottom:0.55rem">
        <a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(p.label)} ↗</strong></a>
        <div class="muted-note" style="margin-top:0.12rem">${esc(p.citation)}</div>
      </div>`
    )
    .join("");

  const hubLinks = getDeduplicatedHubLinks(m).map(
    (lnk) => `<a class="ext-pill" href="${esc(safeUrl(lnk.url))}" target="_blank" rel="noopener noreferrer">${esc(lnk.label)}</a>`
  );

  const organsHtml = (m.organs || []).length
    ? `<div class="muted-note mt-xs"><strong>Organs &amp; Tissues:</strong> ${esc(m.organs.join(", "))}</div>`
    : "";

  const isPinned = state.pinnedIds.includes(m.id);

  body.innerHTML = `
    <div class="drawer-block">
      <h4>Preclinical &amp; Animal Pathology Relevance</h4>
      <p style="margin:0 0 0.55rem">${esc(m.highlights)}</p>
      <div class="muted-note"><strong>Pretraining Corpus:</strong> ${esc(m.training_data)}</div>
      ${organsHtml}
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
          ? `<div class="muted-note">Weights size: ~${esc(m.weights_gb)} GB · Minimum VRAM: ${esc(m.vram_min_gb)} GB (Recommended: ${esc(m.vram_rec_gb)} GB)</div>`
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
      <button type="button" class="secondary-btn ${isPinned ? "pin-active" : ""}" id="drawerPinBtn" aria-pressed="${isPinned ? "true" : "false"}">
        ${isPinned ? "✓ Pinned in Comparator" : "+ Pin to Compare"}
      </button>
      ${
        m.open_weights && m.hf_repo
          ? `<button type="button" class="secondary-btn" id="drawerCacheBtn">Download to Connected Local Server</button>`
          : ""
      }
    </div>
  `;

  bindCopyButtons(body);

  const copyPyBtn = body.querySelector("#copyPySnippetBtn");
  copyPyBtn.onclick = () => copyTextWithFeedback(m.python_snippet || "", copyPyBtn);

  const drawerPinBtn = body.querySelector("#drawerPinBtn");
  if (drawerPinBtn) {
    drawerPinBtn.onclick = () => {
      togglePinModel(m.id);
      const nowPinned = state.pinnedIds.includes(m.id);
      drawerPinBtn.classList.toggle("pin-active", nowPinned);
      drawerPinBtn.setAttribute("aria-pressed", String(nowPinned));
      drawerPinBtn.textContent = nowPinned ? "✓ Pinned in Comparator" : "+ Pin to Compare";
    };
  }

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

  if (!dlg.open) {
    dlg.showModal();
  }
}

/* SIDE-BY-SIDE MODEL COMPARATOR (PIN UP TO 4 MODELS) */
function loadSavedPins() {
  try {
    const raw = JSON.parse(sessionStorage.getItem("apfm_pinned") || "[]");
    if (Array.isArray(raw)) {
      const validIds = new Set(state.registry.models.map((m) => m.id));
      state.pinnedIds = raw.filter((id) => validIds.has(id)).slice(0, MAX_COMPARE);
    }
  } catch (_) {
    state.pinnedIds = [];
  }
}

function savePins() {
  try {
    sessionStorage.setItem("apfm_pinned", JSON.stringify(state.pinnedIds));
  } catch (_) {
    // ignore storage quota errors
  }
}

function getPinnedModels() {
  const byId = Object.fromEntries(state.registry.models.map((m) => [m.id, m]));
  return state.pinnedIds.map((id) => byId[id]).filter(Boolean);
}

function showDockNotice(msg) {
  const msgEl = document.getElementById("compareDockMsg");
  if (!msgEl) return;
  msgEl.textContent = msg;
  if (state.dockNoticeTimer) clearTimeout(state.dockNoticeTimer);
  state.dockNoticeTimer = setTimeout(() => {
    msgEl.textContent = "";
    state.dockNoticeTimer = null;
  }, 3200);
}

function togglePinModel(modelId) {
  const idx = state.pinnedIds.indexOf(modelId);
  if (idx >= 0) {
    state.pinnedIds.splice(idx, 1);
  } else {
    if (state.pinnedIds.length >= MAX_COMPARE) {
      showDockNotice(`Max ${MAX_COMPARE} models pinned — remove one to pin another.`);
      return;
    }
    state.pinnedIds.push(modelId);
  }
  savePins();
  syncPinButtonsInDom();
  renderCompareDock();
  if (document.getElementById("compareModal")?.open) {
    if (state.pinnedIds.length === 0) {
      document.getElementById("compareModal").close();
    } else {
      renderCompareModal();
    }
  }
}

function clearAllPins() {
  state.pinnedIds = [];
  savePins();
  syncPinButtonsInDom();
  renderCompareDock();
  const modal = document.getElementById("compareModal");
  if (modal?.open) {
    modal.close();
  }
}

function syncPinButtonsInDom() {
  document.querySelectorAll(".slide-card").forEach((card) => {
    const mid = card.dataset.modelId;
    const pinned = state.pinnedIds.includes(mid);
    card.classList.toggle("is-pinned", pinned);
    const btn = card.querySelector(".pin-btn");
    if (btn) {
      btn.classList.toggle("active", pinned);
      btn.setAttribute("aria-pressed", String(pinned));
      btn.textContent = pinned ? "✓ Pinned" : "+ Compare";
      btn.title = pinned
        ? "Unpin from side-by-side comparison"
        : "Pin model to compare side-by-side (up to 4)";
    }
  });
}

function bindComparatorControls() {
  document.getElementById("openCompareModalBtn").addEventListener("click", () => {
    openCompareModal();
  });
  document.getElementById("clearCompareBtn").addEventListener("click", () => {
    clearAllPins();
  });
  document.getElementById("dockExportBibBtn").addEventListener("click", () => {
    exportModelsBibtex(getPinnedModels(), "animalpath_fm_comparison.bib");
  });
  document.getElementById("dockExportCsvBtn").addEventListener("click", () => {
    exportModelsCsv(getPinnedModels(), "animalpath_fm_comparison.csv");
  });

  const modal = document.getElementById("compareModal");
  document.getElementById("closeCompareModalBtn").addEventListener("click", () => {
    modal.close();
  });
  modal.addEventListener("click", (e) => {
    if (e.target.id === "compareModal") modal.close();
  });

  document.getElementById("modalExportBibBtn").addEventListener("click", () => {
    exportModelsBibtex(getPinnedModels(), "animalpath_fm_comparison.bib");
  });
  document.getElementById("modalCopyBibBtn").addEventListener("click", (e) => {
    const bib = buildBibtexBundle(getPinnedModels());
    copyTextWithFeedback(bib, e.currentTarget);
  });
  document.getElementById("modalExportCsvBtn").addEventListener("click", () => {
    exportModelsCsv(getPinnedModels(), "animalpath_fm_comparison.csv");
  });
  document.getElementById("modalClearCompareBtn").addEventListener("click", () => {
    clearAllPins();
  });
}

function renderCompareDock() {
  const dock = document.getElementById("compareDock");
  const pinned = getPinnedModels();
  const hasPins = pinned.length > 0;
  dock.classList.toggle("hidden", !hasPins);
  document.body.classList.toggle("has-compare-dock", hasPins);

  if (!hasPins) return;

  document.getElementById("compareDockCount").textContent = `Compare (${pinned.length}/${MAX_COMPARE})`;
  document.getElementById("openCompareModalBtn").textContent =
    pinned.length >= 2 ? `Compare Side-by-Side (${pinned.length})` : "Inspect in Comparator (1)";

  const chipsWrap = document.getElementById("compareDockChips");
  chipsWrap.innerHTML = pinned
    .map(
      (m) => `
      <span class="dock-model-chip">
        <span class="fam-dot" style="background:${safeFamVar(m.family)}"></span>
        <span>${esc(m.name)}</span>
        <button type="button" class="dock-chip-remove" data-unpin="${esc(m.id)}" aria-label="Remove ${esc(m.name)} from comparison" title="Unpin ${esc(m.name)}">✕</button>
      </span>
    `
    )
    .join("");

  chipsWrap.querySelectorAll("[data-unpin]").forEach((btn) => {
    btn.onclick = () => togglePinModel(btn.dataset.unpin);
  });
}

function openCompareModal() {
  if (!state.pinnedIds.length) return;
  const dlg = document.getElementById("modelDrawer");
  if (dlg?.open) dlg.close();
  renderCompareModal();
  const modal = document.getElementById("compareModal");
  if (!modal.open) {
    modal.showModal();
  }
}

function renderCompareModal() {
  const pinned = getPinnedModels();
  const sub = document.getElementById("compareModalSub");
  const body = document.getElementById("compareModalBody");
  if (!pinned.length) {
    body.innerHTML = `<div class="empty-box">No models pinned for comparison.</div>`;
    return;
  }

  sub.textContent = `Comparing ${pinned.length} of ${MAX_COMPARE} max models · VRAM compatibility evaluated at ${state.selectedVramGb} GB`;

  const famById = Object.fromEntries(state.registry.families.map((f) => [f.id, f.label]));

  const formatTier = (m) => {
    if (m.species_tier === "rodent_native") return `<span class="badge badge-rodent">Rodent-Native</span>`;
    if (m.species_tier === "multi_species") return `<span class="badge badge-vet">Multi-Species / Vet</span>`;
    return `<span class="badge badge-gated">Cross-Species Transfer</span>`;
  };

  const formatApps = (m) => {
    const badges = (m.applications || []).map(
      (a) => `<span class="species-mini">${esc(APP_LABELS[a] || a)}</span>`
    );
    if (m.open_weights && !m.gated) {
      badges.push(`<span class="badge badge-open">Ungated Open-Weights</span>`);
    }
    return badges.join(" ") || "—";
  };

  const formatVram = (m) => {
    const hw = evaluateHardwareFit(m, state.selectedVramGb);
    if (!m.open_weights || !m.vram_min_gb) {
      return `<span class="badge badge-ref">Literature Reference</span><div class="muted-note">Weights not publicly released</div>`;
    }
    return `
      <span class="badge ${esc(hw.css)}">${esc(hw.label)}</span>
      <div class="mono mt-xs" style="font-size:0.78rem">Min: ${esc(m.vram_min_gb)} GB · Rec: ${esc(m.vram_rec_gb)} GB</div>
      <div class="muted-note">Checkpoint: ~${esc(m.weights_gb)} GB</div>
    `;
  };

  const formatTasks = (m) => {
    if (!m.tasks || !m.tasks.length) {
      return `<span class="muted-note">Literature / Benchmark Reference</span>`;
    }
    return `<div class="species-mini-tags">${m.tasks
      .map((t) => `<span class="species-mini">${esc(state.registry.tasks[t]?.label || t)}</span>`)
      .join("")}</div>`;
  };

  const formatLicense = (m) => {
    const openB = m.open_weights
      ? `<span class="badge badge-open">${m.gated ? "Open (Gated HF)" : "Open (Ungated)"}</span>`
      : `<span class="badge badge-ref">Proprietary</span>`;
    const commB = m.commercial_ok
      ? `<span class="badge badge-hw-ok">Commercial OK</span>`
      : `<span class="badge badge-gated">Non-Commercial / Academic</span>`;
    return `<div class="badge-row" style="margin-top:0">${openB} ${commB}</div><div class="mono mt-xs" style="font-size:0.77rem">${esc(m.license)}</div>`;
  };

  const formatCitation = (m) => {
    const p = m.papers?.[0];
    const hub = getDeduplicatedHubLinks(m)
      .map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.shortLabel)}</a>`)
      .join(" · ");
    return `
      ${p ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(p.label)} ↗</strong></a><div class="muted-note" style="margin-top:0.2rem">${esc(p.citation)}</div>` : "—"}
      ${hub ? `<div class="mt-xs" style="font-size:0.77rem">${hub}</div>` : ""}
    `;
  };

  body.innerHTML = `
    <div class="table-wrap compare-table-wrap">
      <table class="data-table compare-table">
        <thead>
          <tr>
            <th class="compare-row-head">Dimension</th>
            ${pinned
              .map(
                (m) => `
              <th class="compare-col-head" style="--col-stain:${safeFamVar(m.family)}">
                <div class="compare-col-top">
                  <div>
                    <div class="compare-model-name">${esc(m.name)}</div>
                    <div class="compare-model-org">${esc(m.org)} (${esc(m.year)})</div>
                  </div>
                  <button type="button" class="icon-btn compare-unpin-btn" data-cmp-unpin="${esc(m.id)}" title="Remove ${esc(m.name)}" aria-label="Remove ${esc(m.name)}">✕</button>
                </div>
                <div class="compare-col-actions">
                  ${
                    m.runnable
                      ? `<button type="button" class="primary-btn cmp-run-btn" data-cmp-run="${esc(m.id)}" style="padding:0.26rem 0.62rem;font-size:0.75rem">Run →</button>`
                      : ""
                  }
                  <button type="button" class="secondary-btn cmp-inspect-btn" data-cmp-inspect="${esc(m.id)}" style="padding:0.24rem 0.58rem;font-size:0.75rem">Details &amp; Python</button>
                </div>
              </th>
            `
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" class="compare-row-head">Species Alignment</th>
            ${pinned
              .map(
                (m) => `
              <td>
                ${formatTier(m)}
                <div class="species-mini-tags mt-xs">
                  ${(m.species_tags || []).map((s) => `<span class="species-mini">${esc(s)}</span>`).join("")}
                </div>
              </td>`
              )
              .join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">Organs &amp; Tissues</th>
            ${pinned
              .map(
                (m) => `
              <td>
                <div class="species-mini-tags">
                  ${(m.organs || []).map((o) => `<span class="species-mini">${esc(o)}</span>`).join("") || "—"}
                </div>
              </td>`
              )
              .join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">Preclinical Focus</th>
            ${pinned.map((m) => `<td><div class="species-mini-tags">${formatApps(m)}</div></td>`).join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">Architecture &amp; Scale</th>
            ${pinned
              .map(
                (m) => `
              <td>
                <div><strong>${esc(m.architecture)}</strong></div>
                <div class="mono mt-xs" style="font-size:0.77rem">${esc(m.params || "—")} · ${m.embed_dim ? esc(m.embed_dim) + "-D" : "VLM"} · ${esc(m.patch_px)}px (${esc(m.magnification)})</div>
                <div class="muted-note">Family: ${esc(famById[m.family] || m.family)}</div>
              </td>`
              )
              .join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">GPU VRAM &amp; Weights</th>
            ${pinned.map((m) => `<td>${formatVram(m)}</td>`).join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">Supported Tasks</th>
            ${pinned.map((m) => `<td>${formatTasks(m)}</td>`).join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">License &amp; Access</th>
            ${pinned.map((m) => `<td>${formatLicense(m)}</td>`).join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">Paper Citation</th>
            ${pinned.map((m) => `<td>${formatCitation(m)}</td>`).join("")}
          </tr>
          <tr>
            <th scope="row" class="compare-row-head">CLI Download</th>
            ${pinned
              .map((m) => {
                const cid = `cmp-cli-${escId(m.id)}`;
                return `
                  <td>
                    <div class="code-row">
                      <code id="${cid}">${esc(m.cli_download || "")}</code>
                      <button type="button" class="copy-mini" data-copy-target="${cid}">Copy</button>
                    </div>
                  </td>`;
              })
              .join("")}
          </tr>
        </tbody>
      </table>
    </div>
  `;

  bindCopyButtons(body);

  body.querySelectorAll("[data-cmp-unpin]").forEach((btn) => {
    btn.onclick = () => togglePinModel(btn.dataset.cmpUnpin);
  });
  body.querySelectorAll("[data-cmp-run]").forEach((btn) => {
    btn.onclick = () => {
      document.getElementById("compareModal").close();
      selectModelForRun(btn.dataset.cmpRun);
      switchSection("run");
    };
  });
  body.querySelectorAll("[data-cmp-inspect]").forEach((btn) => {
    btn.onclick = () => {
      const targetModel = state.registry.models.find((x) => x.id === btn.dataset.cmpInspect);
      if (targetModel) {
        document.getElementById("compareModal").close();
        openModelDrawer(targetModel);
      }
    };
  });
}

function buildBibtexBundle(models) {
  if (!models || !models.length) return "";
  const header = `% AnimalPath-FM — Preclinical, Rodent & Veterinary Pathology Foundation Models (${models.length} citations)\n`;
  const entries = models
    .map((m) => (m.bibtex || "").trim())
    .filter(Boolean)
    .join("\n\n");
  return `${header}\n${entries}\n`;
}

function exportModelsBibtex(models, filename = "animalpath_fm_models.bib") {
  if (!models || !models.length) return;
  const content = buildBibtexBundle(models);
  triggerBlobDownload(new Blob([content], { type: "application/x-bibtex;charset=utf-8" }), filename);
}

function exportModelsCsv(models, filename = "animalpath_fm_models.csv") {
  if (!models || !models.length) return;
  const columns = [
    "id",
    "name",
    "org",
    "year",
    "family",
    "species_tier",
    "species_tags",
    "organs",
    "applications",
    "architecture",
    "params",
    "embed_dim",
    "patch_px",
    "magnification",
    "open_weights",
    "gated",
    "commercial_ok",
    "license",
    "weights_gb",
    "vram_min_gb",
    "vram_rec_gb",
    "tasks",
    "hf_repo",
    "github_url",
    "primary_citation",
    "primary_paper_url",
    "cli_download"
  ];

  const rows = models.map((m) => ({
    id: m.id,
    name: m.name,
    org: m.org,
    year: m.year,
    family: m.family,
    species_tier: m.species_tier,
    species_tags: (m.species_tags || []).join("; "),
    organs: (m.organs || []).join("; "),
    applications: (m.applications || []).map((a) => APP_LABELS[a] || a).join("; "),
    architecture: m.architecture,
    params: m.params || "",
    embed_dim: m.embed_dim ?? "",
    patch_px: m.patch_px ?? "",
    magnification: m.magnification || "",
    open_weights: m.open_weights ? "yes" : "no",
    gated: m.gated ? "yes" : "no",
    commercial_ok: m.commercial_ok ? "yes" : "no",
    license: m.license || "",
    weights_gb: m.weights_gb ?? "",
    vram_min_gb: m.vram_min_gb ?? "",
    vram_rec_gb: m.vram_rec_gb ?? "",
    tasks: (m.tasks || []).map((t) => state.registry.tasks[t]?.label || t).join("; "),
    hf_repo: m.hf_repo || "",
    github_url: m.github_url || "",
    primary_citation: m.papers?.[0]?.citation || "",
    primary_paper_url: m.papers?.[0]?.url || "",
    cli_download: m.cli_download || ""
  }));

  const csvLines = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))
  ];
  triggerBlobDownload(new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8" }), filename);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* RUN WORKBENCH */
function initRunForm() {
  const select = document.getElementById("runModelSelect");
  const runnable = state.registry.models.filter((m) => m.runnable);
  select.innerHTML = runnable
    .map(
      (m) =>
        `<option value="${esc(m.id)}">${esc(m.name)} — ${esc(m.species_tags?.[0] || "")} (${esc(m.params)})</option>`
    )
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
  (state.run.previewUrls || []).forEach((u) => URL.revokeObjectURL(u));
  state.run.previewUrls = [];
  state.run.files = Array.from(fileList || []);

  const strip = document.getElementById("tilePreviewStrip");
  strip.innerHTML = "";
  state.run.files.slice(0, 12).forEach((file) => {
    const div = document.createElement("div");
    div.className = "thumb-item";
    const img = document.createElement("img");
    const blobUrl = URL.createObjectURL(file);
    state.run.previewUrls.push(blobUrl);
    img.src = blobUrl;
    img.alt = file.name;
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
    <strong>${esc(m.architecture)}</strong> · License: <code>${esc(m.license)}</code> · Min VRAM: <strong>${esc(m.vram_min_gb)} GB</strong>
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
        <label class="field-label" for="paramGenes">Target Mus musculus Marker Panel (comma-separated)</label>
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
  const wsiPath = document.getElementById("wsiPathInput")?.value?.trim() || "";
  const params = {
    organ: document.getElementById("paramOrgan")?.value,
    prompts: document.getElementById("paramPrompts")?.value,
    genes: document.getElementById("paramGenes")?.value,
    k_clusters: document.getElementById("paramK")?.value || 3,
    magnification: document.getElementById("paramMag")?.value || "20x",
    wsi_path: wsiPath
  };

  if (state.mode === "server" && state.serverConnected) {
    statusEl.textContent = "Submitting job to local FastAPI runner…";
    try {
      const fd = new FormData();
      fd.append("model_id", m.id);
      fd.append("task", state.run.task);
      fd.append("params", JSON.stringify(params));
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
      if (d.paper_url) {
        links.push(`<a class="ext-pill" href="${esc(safeUrl(d.paper_url))}" target="_blank" rel="noopener noreferrer">📄 Paper / DOI ↗</a>`);
      }
      if (d.hf_url) {
        links.push(`<a class="ext-pill" href="${esc(safeUrl(d.hf_url))}" target="_blank" rel="noopener noreferrer">🤗 Hugging Face ↗</a>`);
      }
      if (d.github_url) {
        links.push(`<a class="ext-pill" href="${esc(safeUrl(d.github_url))}" target="_blank" rel="noopener noreferrer">💻 Repo / Tiles ↗</a>`);
      }

      const cid = `ds-cli-${escId(d.id)}`;
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

  const exportAllBibBtn = document.getElementById("exportAllBibBtn");
  if (exportAllBibBtn) {
    exportAllBibBtn.onclick = () => exportModelsBibtex(state.registry.models, "animalpath_fm_all_16_models.bib");
  }
  const exportAllCsvBtn = document.getElementById("exportAllCsvBtn");
  if (exportAllCsvBtn) {
    exportAllCsvBtn.onclick = () => exportModelsCsv(state.registry.models, "animalpath_fm_all_16_models.csv");
  }

  const tbody = document.getElementById("papersTableBody");
  tbody.innerHTML = state.registry.models
    .map((m) => {
      const p = m.papers?.[0];
      const hub = getDeduplicatedHubLinks(m)
        .map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.shortLabel)}</a>`)
        .join(" · ");
      return `
        <tr>
          <td><strong>${esc(m.name)}</strong><div class="muted-note">${esc(m.org)}</div></td>
          <td>${(m.species_tags || []).map((s) => `<span class="species-mini">${esc(s)}</span>`).join(" ")}</td>
          <td>
            <span class="badge ${m.open_weights ? "badge-open" : "badge-ref"}">${m.open_weights ? (m.gated ? "Open (Gated)" : "Open (Ungated)") : "Proprietary"}</span>
            <div class="muted-note">${esc(m.license)}</div>
          </td>
          <td>${p ? `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(p.label)} ↗</strong></a><div class="muted-note">${esc(p.citation)}</div>` : "—"}</td>
          <td>${hub || "—"}</td>
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
    document.getElementById("serverHealthBox").innerHTML =
      "Running in client-side <strong>Demo Mode</strong>. Switch to <em>My Local / HPC Server</em> to connect to <code>backend/server.py</code>.";
    syncModeUi();
    updateHwBar();
    renderWeightsTable();
  };

  document.getElementById("modeServerBtn").onclick = () => {
    state.mode = "server";
    localStorage.setItem("apfm_mode", "server");
    syncModeUi();
    pingServer(false).then(syncModeUi);
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
    const box = document.getElementById("serverHealthBox");
    if (!state.serverConnected) {
      box.innerHTML =
        "<strong>Server Offline:</strong> Connect to your local FastAPI backend first, or run <code>hf auth login</code> in your terminal.";
      return;
    }
    try {
      const r = await apiFetch("/api/weights/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hf_token: state.hfToken })
      });
      const data = await r.json();
      box.innerHTML = `<strong>HF Access Check:</strong> Checked ${esc(Object.keys(data.access || {}).length)} repositories.`;
      await refreshWeightsTable();
    } catch (err) {
      box.innerHTML = `<strong>HF Access Check Failed:</strong> ${esc(err.message)}`;
    }
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
    renderWeightsTable();
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

      const cliId = `wt-cli-${escId(m.id)}`;
      const actionHtml = state.serverConnected
        ? `<button type="button" class="secondary-btn dl-weight-btn" data-mid="${esc(m.id)}" style="padding:0.25rem 0.6rem;font-size:0.76rem">${st?.cached ? "Re-verify" : "Download on Server"}</button>`
        : `<div class="code-row code-row-compact"><code id="${cliId}">${esc(m.cli_download)}</code><button type="button" class="copy-mini" data-copy-target="${cliId}">Copy</button></div>`;

      return `
        <tr>
          <td><strong>${esc(m.name)}</strong></td>
          <td><a href="${esc(safeUrl(`https://huggingface.co/${m.hf_repo}`))}" target="_blank" rel="noopener noreferrer"><code>${esc(m.hf_repo)}</code> ↗</a></td>
          <td class="mono">${m.weights_gb ? esc(m.weights_gb) + " GB" : "—"}</td>
          <td>${m.gated ? `<span class="badge badge-ref">Gated (Accept License)</span>` : `<span class="badge badge-open">Ungated</span>`}</td>
          <td>${statusBadge}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    })
    .join("");

  bindCopyButtons(tbody);
  tbody.querySelectorAll(".dl-weight-btn").forEach((btn) => {
    btn.onclick = () => triggerServerWeightDownload(btn.dataset.mid);
  });
}

async function triggerServerWeightDownload(modelId) {
  const box = document.getElementById("serverHealthBox");
  if (!state.serverConnected) {
    box.innerHTML = `<strong>Server Offline:</strong> Connect to your local FastAPI server first to cache <code>${esc(modelId)}</code>, or copy its <code>hf download</code> CLI command below.`;
    return;
  }
  try {
    box.innerHTML = `<strong>Downloading weights for ${esc(modelId)}…</strong>`;
    const r = await apiFetch(`/api/weights/${encodeURIComponent(modelId)}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hf_token: state.hfToken || null })
    });
    const res = await r.json();
    box.innerHTML = `<strong>Weight Download (${esc(modelId)}):</strong> ${esc(res.status)} — ${esc(res.detail || "")}`;
    await refreshWeightsTable();
    renderSlideRack();
  } catch (err) {
    box.innerHTML = `<strong>Weight Download Failed (${esc(modelId)}):</strong> ${esc(err.message)}`;
  }
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

function safeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "#";
}

function escId(s) {
  return String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
