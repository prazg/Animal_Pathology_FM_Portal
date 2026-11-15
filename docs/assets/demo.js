// Deterministic, realistic rodent & preclinical pathology synthetic generator for GPU-free Demo Mode

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateDemoJob(model, task, params = {}, inputNames = []) {
  const rng = mulberry32(hashStr(`${model.id}:${task}:${JSON.stringify(params)}`));
  const now = new Date().toLocaleTimeString();
  const jobId = `demo-${Math.random().toString(36).slice(2, 8)}`;

  const defaultTiles = [
    "SD_Rat_Liver_Ctrl_01.png",
    "SD_Rat_Liver_Ctrl_02.png",
    "SD_Rat_Liver_APAP_HighDose_01.png",
    "SD_Rat_Liver_APAP_HighDose_02.png",
    "SD_Rat_Liver_APAP_MidDose_03.png",
    "C57BL6_Kidney_Cortex_01.png",
    "C57BL6_Kidney_TubularInjury_02.png",
    "C57BL6_Lung_Alveolar_01.png",
    "C57BL6_Spleen_WhitePulp_01.png",
    "GEMM_KrasG12D_LungAdenoma_01.png",
    "GEMM_KrasG12D_LungAdenoma_02.png",
    "SD_Rat_Liver_BileDuctHyperplasia_01.png"
  ];
  const tiles = inputNames.length > 0 ? inputNames : defaultTiles;

  const baseJob = {
    id: jobId,
    mode: "demo",
    status: "completed",
    created_at: now,
    model_id: model.id,
    model_name: model.name,
    task,
    summary: "",
    panels: [],
    table: []
  };

  if (task === "tox_vqa" || task === "zeroshot_classify") {
    const rawChoices = (params.prompts || "Normal hepatic parenchyma\nCentrilobular hepatocellular necrosis\nPeriportal bile duct hyperplasia\nMicrovesicular steatosis\nMononuclear cell infiltrate")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const scores = rawChoices.map((_, idx) => {
      const prior = idx === 1 ? 0.64 : idx === 0 ? 0.16 : 0.06;
      return Math.max(0.01, prior + (rng() - 0.5) * 0.08);
    });
    const sum = scores.reduce((a, b) => a + b, 0);
    const probs = rawChoices.map((label, i) => ({
      label,
      prob: +(scores[i] / sum).toFixed(4)
    })).sort((a, b) => b.prob - a.prob);

    baseJob.summary = `Evaluated ${tiles.length} rodent ROI(s) · Top call: ${probs[0].label} (${(probs[0].prob * 100).toFixed(1)}%)`;
    baseJob.panels.push({
      type: "bars",
      title: `${model.name} — Calibrated Rodent Lesion Probabilities`,
      subtitle: params.organ ? `Organ Context: ${params.organ}` : "Organ Context: Sprague-Dawley Rat Liver (H&E, 20x)",
      items: probs
    });
    baseJob.table = probs.map((p, idx) => ({
      rank: idx + 1,
      finding: p.label,
      probability: p.prob,
      send_severity_est: p.prob > 0.5 ? "Moderate (Grade 3)" : p.prob > 0.15 ? "Minimal (Grade 1)" : "Absent"
    }));
    return baseJob;
  }

  if (task === "predict_omics") {
    const genes = [
      { gene: "Alb", role: "Pan-hepatocyte marker", mean: +(3.42 + rng() * 0.4).toFixed(2) },
      { gene: "Cyp2e1", role: "Zone-3 pericentral xenobiotic metabolism", mean: +(2.88 + rng() * 0.5).toFixed(2) },
      { gene: "Glul", role: "Pericentral glutamine synthetase", mean: +(2.35 + rng() * 0.4).toFixed(2) },
      { gene: "Havcr1 (Kim-1)", role: "Proximal tubule / injury response", mean: +(1.74 + rng() * 0.6).toFixed(2) },
      { gene: "Col1a1", role: "Stellate / fibrotic extracellular matrix", mean: +(1.52 + rng() * 0.5).toFixed(2) },
      { gene: "Ptprc (CD45)", role: "Pan-leukocyte inflammatory infiltrate", mean: +(1.29 + rng() * 0.45).toFixed(2) }
    ];
    baseJob.summary = `Predicted virtual Mus musculus spatial transcriptomic expression across ${tiles.length} spots/tiles`;
    baseJob.panels.push({
      type: "omics",
      title: `${model.name} — Virtual Mouse Gene Expression (log1p CPM)`,
      genes
    });
    baseJob.table = genes;
    return baseJob;
  }

  if (task === "segment_wsi") {
    const classes = [
      { name: "Hepatic Parenchyma (Zones 1-2)", color: "#c2407a", pct: 54.2 },
      { name: "Centrilobular Coagulative Necrosis", color: "#e05a2b", pct: 18.6 },
      { name: "Portal Triad & Bile Ductules", color: "#3b3486", pct: 11.4 },
      { name: "Central Vein / Sinusoidal Lumen", color: "#0b7f90", pct: 9.8 },
      { name: "Inflammatory Infiltrate / Fibrous Capsule", color: "#2f7d58", pct: 6.0 }
    ];
    baseJob.summary = `Segmented whole rodent organ section into ${classes.length} MegaMouse / tissue compartments`;
    baseJob.panels.push({
      type: "spatial",
      title: `${model.name} — Whole-Slide Mouse/Rat Compartment Overlay`,
      seed: hashStr(model.id),
      classes
    });
    baseJob.table = classes.map((c) => ({ compartment: c.name, area_percent: c.pct }));
    return baseJob;
  }

  // Default: embed_tiles or embed_slide (PCA + Cosine Heatmap + Spatial if slide)
  const k = Number(params.k_clusters || 3);
  const points = tiles.map((name, i) => {
    const cluster = i % k;
    const angle = (cluster / k) * Math.PI * 2;
    const x = Math.cos(angle) * 2.1 + (rng() - 0.5) * 1.1;
    const y = Math.sin(angle) * 2.1 + (rng() - 0.5) * 1.1;
    return { name, cluster, pc1: +x.toFixed(3), pc2: +y.toFixed(3) };
  });

  const n = Math.min(points.length, 12);
  const matrix = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      if (i === j) row.push(1.0);
      else {
        const same = points[i].cluster === points[j].cluster ? 0.78 : 0.32;
        row.push(+Math.min(0.99, Math.max(0.05, same + (rng() - 0.5) * 0.22)).toFixed(3));
      }
    }
    matrix.push(row);
  }

  baseJob.summary = `Extracted ${model.embed_dim}-D embeddings for ${points.length} rodent patches (${k} morphological clusters)`;
  baseJob.panels.push({
    type: "scatter",
    title: `${model.name} — Patch Embedding PCA (${model.embed_dim}-D → 2D)`,
    points
  });
  baseJob.panels.push({
    type: "matrix",
    title: "Pairwise Cosine Similarity Matrix",
    labels: points.slice(0, n).map((p) => p.name),
    matrix
  });

  if (task === "embed_slide") {
    baseJob.panels.push({
      type: "spatial",
      title: `${model.name} — Whole-Slide Spatial PCA-RGB Map`,
      seed: hashStr(model.id + "slide"),
      classes: [
        { name: "PC1 Dominant (Normal Cortex/Parenchyma)", color: "#3b3486", pct: 61.5 },
        { name: "PC2 Dominant (Lesion / Altered Focus)", color: "#c2407a", pct: 24.1 },
        { name: "PC3 Dominant (Stroma / Vasculature)", color: "#2f7d58", pct: 14.4 }
      ]
    });
  }

  baseJob.table = points.map((p) => ({
    tile: p.name,
    cluster: `Cluster ${p.cluster + 1}`,
    pc1: p.pc1,
    pc2: p.pc2,
    embed_dim: model.embed_dim
  }));

  return baseJob;
}

export function generateSampleShowcaseJobs(models) {
  const byId = Object.fromEntries(models.map((m) => [m.id, m]));
  const samples = [];
  if (byId["tissuedecision-9b"]) {
    samples.push(
      generateDemoJob(byId["tissuedecision-9b"], "tox_vqa", {
        organ: "Sprague-Dawley Rat Liver (Open TG-GATEs APAP High-Dose)"
      })
    );
  }
  if (byId["hibou-l"]) {
    samples.push(generateDemoJob(byId["hibou-l"], "embed_tiles", { k_clusters: 3 }));
  }
  if (byId["tisam-megamouse"]) {
    samples.push(generateDemoJob(byId["tisam-megamouse"], "segment_wsi", {}));
  }
  if (byId["loki-omiclip"]) {
    samples.push(generateDemoJob(byId["loki-omiclip"], "predict_omics", {}));
  }
  return samples;
}
