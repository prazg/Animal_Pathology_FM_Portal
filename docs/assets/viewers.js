// Framework-free SVG & HTML5 Canvas viewers for Rodent & Preclinical Pathology outputs

const CLUSTER_COLORS_BRIGHT = ["#3b3486", "#c2407a", "#23744f", "#b45309", "#0a7282", "#6d3391"];
const CLUSTER_COLORS_DARK = ["#8f88ff", "#ff6ba8", "#42dc8b", "#f5b04c", "#38d6e8", "#c485ff"];

const DARKFIELD_COLOR_REMAP = {
  "#3b3486": "#8f88ff",
  "#c2407a": "#ff6ba8",
  "#2f7d58": "#42dc8b",
  "#23744f": "#42dc8b",
  "#0b7f90": "#38d6e8",
  "#e05a2b": "#ff8b54",
  "#8a5a2b": "#f5b04c"
};

function isDarkfield() {
  return document.documentElement.getAttribute("data-theme") === "darkfield";
}

function resolveClassColor(rawColor, idx = 0) {
  const dark = isDarkfield();
  const palette = dark ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_BRIGHT;
  const clean = safeCssColor(rawColor, palette[idx % palette.length]);
  if (dark && DARKFIELD_COLOR_REMAP[clean.toLowerCase()]) {
    return DARKFIELD_COLOR_REMAP[clean.toLowerCase()];
  }
  return clean;
}

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
      a.rel = "noopener noreferrer";
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
    const probNum = Number(item.prob) || 0;
    const pct = (probNum * 100).toFixed(1);
    const widthPct = Math.max(2, Math.min(100, probNum * 100)).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-bar-row";
    row.innerHTML = `
      <div class="prob-bar-head">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="mono">${escapeHtml(pct)}%</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill ${idx === 0 ? "top" : ""}" style="width: ${widthPct}%"></div>
      </div>
    `;
    card.appendChild(row);
  });
}

function renderScatter(card, panel) {
  const pts = panel.points || [];
  if (!pts.length) return;
  const dark = isDarkfield();
  const palette = dark ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_BRIGHT;
  const xs = pts.map((p) => Number(p.pc1) || 0);
  const ys = pts.map((p) => Number(p.pc2) || 0);
  const minX = Math.min(...xs) - 0.5;
  const maxX = Math.max(...xs) + 0.5;
  const minY = Math.min(...ys) - 0.5;
  const maxY = Math.max(...ys) + 0.5;
  const W = 400;
  const H = 260;
  const pad = 28;

  const sx = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const sy = (v) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - pad * 2);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", panel.title || "2D PCA scatter plot");
  svg.style.width = "100%";
  svg.style.height = "auto";
  svg.style.border = "1px solid var(--border)";
  svg.style.borderRadius = "8px";
  svg.style.background = "var(--surface)";

  // Subtle zero crosshair axes
  const axisStroke = dark ? "rgba(164, 159, 196, 0.2)" : "rgba(91, 85, 120, 0.16)";
  const midX = sx(0);
  const midY = sy(0);
  if (midX >= pad && midX <= W - pad) {
    const vLine = document.createElementNS(svgNS, "line");
    vLine.setAttribute("x1", midX.toFixed(1));
    vLine.setAttribute("y1", String(pad / 2));
    vLine.setAttribute("x2", midX.toFixed(1));
    vLine.setAttribute("y2", String(H - pad / 2));
    vLine.setAttribute("stroke", axisStroke);
    vLine.setAttribute("stroke-dasharray", "3 3");
    svg.appendChild(vLine);
  }
  if (midY >= pad && midY <= H - pad) {
    const hLine = document.createElementNS(svgNS, "line");
    hLine.setAttribute("x1", String(pad / 2));
    hLine.setAttribute("y1", midY.toFixed(1));
    hLine.setAttribute("x2", String(W - pad / 2));
    hLine.setAttribute("y2", midY.toFixed(1));
    hLine.setAttribute("stroke", axisStroke);
    hLine.setAttribute("stroke-dasharray", "3 3");
    svg.appendChild(hLine);
  }

  const tip = document.createElement("div");
  tip.className = "muted-note mono";
  tip.textContent = "Hover or focus any point to inspect patch name & cluster.";

  pts.forEach((p) => {
    const clusterIdx = Math.abs(Number(p.cluster) || 0);
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", sx(Number(p.pc1) || 0).toFixed(1));
    c.setAttribute("cy", sy(Number(p.pc2) || 0).toFixed(1));
    c.setAttribute("r", "6.8");
    c.setAttribute("fill", palette[clusterIdx % palette.length]);
    c.setAttribute("fill-opacity", dark ? "0.92" : "0.88");
    c.setAttribute("stroke", dark ? "#0c0e1c" : "#ffffff");
    c.setAttribute("stroke-width", "1.5");
    c.setAttribute("tabindex", "0");
    c.style.cursor = "pointer";
    const showTip = () => {
      tip.textContent = `${p.name} · Cluster ${clusterIdx + 1} (PC1=${p.pc1}, PC2=${p.pc2})`;
    };
    c.addEventListener("mouseenter", showTip);
    c.addEventListener("focus", showTip);
    svg.appendChild(c);
  });

  card.appendChild(svg);
  card.appendChild(tip);
}

function renderMatrix(card, panel) {
  const mat = panel.matrix || [];
  const n = mat.length;
  if (!n) return;
  const dark = isDarkfield();
  const size = 250;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = "100%";
  canvas.style.maxWidth = "270px";
  canvas.style.borderRadius = "6px";
  canvas.style.border = "1px solid var(--border)";
  const ctx = canvas.getContext("2d");
  const cell = size / n;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = Math.max(0, Math.min(1, Number(mat[i][j]) || 0));
      let r, g, b;
      if (dark) {
        r = Math.round(24 + v * 231);
        g = Math.round(28 + v * 78);
        b = Math.round(78 + v * 92);
      } else {
        r = Math.round(45 + v * 165);
        g = Math.round(35 + v * 45);
        b = Math.round(120 + (1 - v) * 60);
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  card.appendChild(canvas);
  const note = document.createElement("div");
  note.className = "muted-note";
  note.textContent = dark
    ? `${n}×${n} patch cosine similarity (DAPI low → Cy3/TRITC high)`
    : `${n}×${n} patch cosine similarity (Haematoxylin low → Eosin high)`;
  card.appendChild(note);
}

function renderSpatial(card, panel) {
  const dark = isDarkfield();
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 240;
  canvas.style.width = "100%";
  canvas.style.borderRadius = "8px";
  canvas.style.border = "1px solid var(--border)";

  const sliderId = `opacity-${Math.random().toString(36).slice(2, 8)}`;
  const sliderRow = document.createElement("div");
  sliderRow.style.display = "flex";
  sliderRow.style.alignItems = "center";
  sliderRow.style.gap = "0.6rem";
  sliderRow.style.marginTop = "0.5rem";

  const lbl = document.createElement("label");
  lbl.className = "muted-note";
  lbl.style.margin = "0";
  lbl.htmlFor = sliderId;
  lbl.textContent = "Overlay Opacity:";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = sliderId;
  slider.min = "0";
  slider.max = "100";
  slider.value = "72";
  sliderRow.appendChild(lbl);
  sliderRow.appendChild(slider);

  const classes = panel.classes || [];
  const phase = ((Number(panel.seed) || 17) % 97) * 0.07;

  const draw = (alpha) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = dark ? "#0d1024" : "#f4eff6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw organic rodent kidney/liver lobular section silhouette
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(210, 120, 168, 92, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = dark ? "#251c42" : "#e6b8cf";
    ctx.fill();
    ctx.clip();

    // Base histological / nuclear stain texture + compartment mask
    for (let x = 40; x < 380; x += 10) {
      for (let y = 24; y < 216; y += 10) {
        const d = Math.hypot(x - 210, y - 120);
        const wave = Math.sin(x * 0.045 + phase) + Math.cos(y * 0.05 - phase) + d * 0.015;
        const idx = Math.floor((wave + 6) % Math.max(1, classes.length));
        ctx.fillStyle = dark ? "#7a72e8" : "#8a5a8e";
        ctx.fillRect(x, y, 2, 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = resolveClassColor(classes[idx]?.color, idx);
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
  classes.forEach((c, idx) => {
    const span = document.createElement("span");
    span.className = "species-mini";
    const resolvedColor = resolveClassColor(c.color, idx);
    span.innerHTML = `<span class="fam-dot" style="background:${escapeHtml(resolvedColor)}"></span>${escapeHtml(c.name)} (${escapeHtml(c.pct)}%)`;
    legend.appendChild(span);
  });
  card.appendChild(legend);
}

function renderOmics(card, panel) {
  (panel.genes || []).forEach((g) => {
    const meanNum = Number(g.mean) || 0;
    const pct = Math.max(2, Math.min(100, (meanNum / 4.2) * 100)).toFixed(1);
    const row = document.createElement("div");
    row.className = "prob-bar-row";
    row.innerHTML = `
      <div class="prob-bar-head">
        <span><strong>${escapeHtml(g.gene)}</strong> <small class="muted-note">(${escapeHtml(g.role)})</small></span>
        <span class="mono">${escapeHtml(meanNum)} log1p</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill omics-fill" style="width:${pct}%"></div>
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
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), filename);
}

function downloadJson(obj, filename) {
  triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeCssColor(raw, fallback = "#c2407a") {
  const s = String(raw ?? "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  return fallback;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
