// Framework-free SVG & HTML5 Canvas viewers for Rodent & Preclinical Pathology outputs

const CLUSTER_COLORS = ["#3b3486", "#c2407a", "#2f7d58", "#d97706", "#0b7f90", "#7a3e9d"];

export function renderJobViewer(container, job, backendUrl = "", portalKey = "") {
  container.innerHTML = "";

  const head = document.createElement("div");
  head.className = "section-header";
  head.innerHTML = `
    <div>
      <h3>${escapeHtml(job.model_name)} · <span class="mono">${escapeHtml(job.task)}</span></h3>
      <p>${escapeHtml(job.summary || "")}</p>
    </div>
    <div class="btn-row" id="artifactBtns"></div>
  `;
  container.appendChild(head);

  const btnRow = head.querySelector("#artifactBtns");
  const csvBtn = document.createElement("button");
  csvBtn.type = "button";
  csvBtn.className = "secondary-btn";
  csvBtn.textContent = "Export Table (.csv)";
  csvBtn.onclick = () => downloadCsv(job.table || [], `${job.model_id}_${job.task}.csv`);
  btnRow.appendChild(csvBtn);

  const jsonBtn = document.createElement("button");
  jsonBtn.type = "button";
  jsonBtn.className = "secondary-btn";
  jsonBtn.textContent = "Export Payload (.json)";
  jsonBtn.onclick = () => downloadJson(job, `${job.model_id}_${job.task}.json`);
  btnRow.appendChild(jsonBtn);

  if (Array.isArray(job.files)) {
    job.files.forEach((fname) => {
      const a = document.createElement("a");
      a.className = "secondary-btn";
      const q = portalKey ? `?key=${encodeURIComponent(portalKey)}` : "";
      a.href = `${backendUrl.replace(/\/$/, "")}/api/jobs/${encodeURIComponent(job.id)}/files/${encodeURIComponent(fname)}${q}`;
      a.textContent = `Download ${fname}`;
      a.target = "_blank";
      btnRow.appendChild(a);
    });
  }

  const grid = document.createElement("div");
  grid.className = "panel-grid";
  container.appendChild(grid);

  (job.panels || []).forEach((panel) => {
    const card = document.createElement("div");
    card.className = "viz-card";
    card.innerHTML = `<h4>${escapeHtml(panel.title || panel.type)}</h4>`;
    if (panel.subtitle) {
      const sub = document.createElement("div");
      sub.className = "muted-note";
      sub.style.marginBottom = "0.65rem";
      sub.textContent = panel.subtitle;
      card.appendChild(sub);
    }

    if (panel.type === "bars") renderBars(card, panel);
    else if (panel.type === "scatter") renderScatter(card, panel);
    else if (panel.type === "matrix") renderMatrix(card, panel);
    else if (panel.type === "spatial") renderSpatial(card, panel);
    else if (panel.type === "omics") renderOmics(card, panel);

    grid.appendChild(card);
  });

  if (job.table && job.table.length > 0) {
    const tblWrap = document.createElement("div");
    tblWrap.className = "table-wrap mt-lg";
    tblWrap.appendChild(buildDataTable(job.table));
    container.appendChild(tblWrap);
  }
}

function renderBars(card, panel) {
  (panel.items || []).forEach((item, idx) => {
    const pct = (item.prob * 100).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-bar-row";
    row.innerHTML = `
      <div class="prob-bar-head">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="mono">${pct}%</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill ${idx === 0 ? "top" : ""}" style="width: ${Math.max(2, item.prob * 100)}%"></div>
      </div>
    `;
    card.appendChild(row);
  });
}

function renderScatter(card, panel) {
  const pts = panel.points || [];
  if (!pts.length) return;
  const xs = pts.map((p) => p.pc1);
  const ys = pts.map((p) => p.pc2);
  const minX = Math.min(...xs) - 0.5, maxX = Math.max(...xs) + 0.5;
  const minY = Math.min(...ys) - 0.5, maxY = Math.max(...ys) + 0.5;
  const W = 400, H = 260, pad = 28;

  const sx = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const sy = (v) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - pad * 2);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.width = "100%";
  svg.style.height = "auto";
  svg.style.border = "1px solid var(--border)";
  svg.style.borderRadius = "8px";
  svg.style.background = "var(--surface)";

  const tip = document.createElement("div");
  tip.className = "muted-note mono";
  tip.textContent = "Hover over any point to inspect patch name & cluster.";

  pts.forEach((p) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", sx(p.pc1).toFixed(1));
    c.setAttribute("cy", sy(p.pc2).toFixed(1));
    c.setAttribute("r", "6.5");
    c.setAttribute("fill", CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]);
    c.setAttribute("fill-opacity", "0.86");
    c.setAttribute("stroke", "#ffffff");
    c.setAttribute("stroke-width", "1.4");
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", () => {
      tip.textContent = `${p.name} · Cluster ${p.cluster + 1} (PC1=${p.pc1}, PC2=${p.pc2})`;
    });
    svg.appendChild(c);
  });

  card.appendChild(svg);
  card.appendChild(tip);
}

function renderMatrix(card, panel) {
  const mat = panel.matrix || [];
  const n = mat.length;
  if (!n) return;
  const size = 250;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = "100%";
  canvas.style.maxWidth = "270px";
  canvas.style.borderRadius = "6px";
  const ctx = canvas.getContext("2d");
  const cell = size / n;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = Math.max(0, Math.min(1, mat[i][j]));
      const r = Math.round(45 + v * 165);
      const g = Math.round(35 + v * 45);
      const b = Math.round(120 + (1 - v) * 60);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  card.appendChild(canvas);
  const note = document.createElement("div");
  note.className = "muted-note";
  note.textContent = `${n}×${n} patch cosine similarity (Haematoxylin low → Eosin high)`;
  card.appendChild(note);
}

function renderSpatial(card, panel) {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 240;
  canvas.style.width = "100%";
  canvas.style.borderRadius = "8px";
  canvas.style.border = "1px solid var(--border)";

  const sliderRow = document.createElement("div");
  sliderRow.style.display = "flex";
  sliderRow.style.alignItems = "center";
  sliderRow.style.gap = "0.6rem";
  sliderRow.style.marginTop = "0.5rem";
  sliderRow.innerHTML = `<span class="muted-note" style="margin:0">Overlay Opacity:</span>`;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "72";
  sliderRow.appendChild(slider);

  const classes = panel.classes || [];
  const draw = (alpha) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4eff6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw organic rodent kidney/liver lobular section silhouette
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(210, 120, 168, 92, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#e6b8cf";
    ctx.fill();
    ctx.clip();

    // H&E base texture dots
    for (let x = 40; x < 380; x += 10) {
      for (let y = 24; y < 216; y += 10) {
        const d = Math.hypot(x - 210, y - 120);
        const idx = Math.floor(((Math.sin(x * 0.045) + Math.cos(y * 0.05) + d * 0.015) + 4) % Math.max(1, classes.length));
        ctx.fillStyle = "#8a5a8e";
        ctx.fillRect(x, y, 2, 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = (classes[idx] && classes[idx].color) || "#c2407a";
        ctx.fillRect(x - 4, y - 4, 9, 9);
        ctx.globalAlpha = 1.0;
      }
    }
    ctx.restore();
  };

  draw(0.72);
  slider.addEventListener("input", () => draw(Number(slider.value) / 100));

  card.appendChild(canvas);
  card.appendChild(sliderRow);

  const legend = document.createElement("div");
  legend.className = "badge-row";
  classes.forEach((c) => {
    const span = document.createElement("span");
    span.className = "species-mini";
    span.innerHTML = `<span class="fam-dot" style="background:${c.color}"></span>${escapeHtml(c.name)} (${c.pct}%)`;
    legend.appendChild(span);
  });
  card.appendChild(legend);
}

function renderOmics(card, panel) {
  (panel.genes || []).forEach((g) => {
    const pct = Math.min(100, (g.mean / 4.2) * 100);
    const row = document.createElement("div");
    row.className = "prob-bar-row";
    row.innerHTML = `
      <div class="prob-bar-head">
        <span><strong>${escapeHtml(g.gene)}</strong> <small class="muted-note">(${escapeHtml(g.role)})</small></span>
        <span class="mono">${g.mean} log1p</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill" style="width:${pct}%; background:#8a5a2b"></div>
      </div>
    `;
    card.appendChild(row);
  });
}

function buildDataTable(rows) {
  const tbl = document.createElement("table");
  tbl.className = "data-table";
  const cols = Object.keys(rows[0]);
  tbl.innerHTML = `
    <thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(r[c] ?? ""))}</td>`).join("")}</tr>`).join("")}
    </tbody>
  `;
  return tbl;
}

function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))
  ];
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv" }), filename);
}

function downloadJson(obj, filename) {
  triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
