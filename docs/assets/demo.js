// Deterministic, realistic rodent & preclinical pathology synthetic generator for GPU-free Demo Mode

const MURINE_MARKER_ROLES = {
  alb: { display: "Alb", role: "Pan-hepatocyte functional marker", base: 3.42 },
  cyp2e1: { display: "Cyp2e1", role: "Zone-3 pericentral xenobiotic metabolism", base: 2.88 },
  glul: { display: "Glul", role: "Pericentral glutamine synthetase", base: 2.35 },
  havcr1: { display: "Havcr1 (Kim-1)", role: "Proximal tubule / injury response", base: 1.74 },
  "havcr1 (kim-1)": { display: "Havcr1 (Kim-1)", role: "Proximal tubule / injury response", base: 1.74 },
  col1a1: { display: "Col1a1", role: "Stellate / fibrotic extracellular matrix", base: 1.52 },
  ptprc: { display: "Ptprc (CD45)", role: "Pan-leukocyte inflammatory infiltrate", base: 1.29 },
  "ptprc (cd45)": { display: "Ptprc (CD45)", role: "Pan-leukocyte inflammatory infiltrate", base: 1.29 },
  slc17a7: { display: "Slc17a7 (Vglut1)", role: "Cortical excitatory glutamatergic neuron", base: 3.18 },
  camk2a: { display: "Camk2a", role: "Forebrain pyramidal neuron signaling", base: 2.94 },
  nrgn: { display: "Nrgn", role: "Telencephalic postsynaptic marker", base: 2.61 },
  snap25: { display: "Snap25", role: "Pan-neuronal presynaptic SNARE", base: 3.05 },
  syn1: { display: "Syn1", role: "Synaptic vesicle phosphoprotein", base: 2.42 },
  gfap: { display: "Gfap", role: "Reactive astrocyte / gliosis marker", base: 1.86 },
  kras: { display: "Kras", role: "GEMM oncogenic RAS signaling driver", base: 2.74 },
  trp53: { display: "Trp53", role: "Murine tumor suppressor / DNA damage response", base: 1.95 },
  mki67: { display: "Mki67 (Ki-67)", role: "Mitotic proliferation index marker", base: 2.12 },
  pecam1: { display: "Pecam1 (CD31)", role: "Sinusoidal & microvascular endothelium", base: 1.78 },
  acta2: { display: "Acta2 (a-SMA)", role: "Activated myofibroblast / vascular smooth muscle", base: 1.66 },
  clec4f: { display: "Clec4f", role: "Resident murine Kupffer cell macrophage", base: 1.91 },
  nphs1: { display: "Nphs1 (Nephrin)", role: "Glomerular podocyte slit diaphragm", base: 2.28 },
  lcn2: { display: "Lcn2 (NGAL)", role: "Distal nephron acute tubular injury marker", base: 2.04 }
};

const DEFAULT_FINDINGS = [
  "Normal hepatic parenchyma",
  "Centrilobular hepatocellular necrosis",
  "Periportal bile duct hyperplasia",
  "Microvesicular steatosis",
  "Mononuclear inflammatory cell infiltrate"
];

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
  const rng = mulberry32(hashStr(`${model.id}:${task}:${JSON.stringify(params)}:${inputNames.join(",")}`));
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
    const parsedChoices = String(params.prompts ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const rawChoices = parsedChoices.length > 0 ? parsedChoices : DEFAULT_FINDINGS;

    const scores = rawChoices.map((_, idx) => {
      const prior = idx === 1 ? 0.64 : idx === 0 ? 0.16 : 0.06;
      return Math.max(0.01, prior + (rng() - 0.5) * 0.08);
    });
    const sum = scores.reduce((a, b) => a + b, 0) || 1;
    const probs = rawChoices
      .map((label, i) => ({
        label,
        prob: +(scores[i] / sum).toFixed(4)
      }))
      .sort((a, b) => b.prob - a.prob);

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
    const rawGenes = String(params.genes ?? "")
      .split(/[,;\n]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    const geneTokens = rawGenes.length > 0 ? rawGenes : ["Alb", "Cyp2e1", "Glul", "Havcr1", "Col1a1", "Ptprc"];

    const genes = geneTokens.map((token) => {
      const meta = MURINE_MARKER_ROLES[token.toLowerCase()];
      const geneRng = mulberry32(hashStr(`${model.id}:${token.toLowerCase()}`));
      const baseVal = meta ? meta.base : 1.45 + geneRng() * 1.65;
      return {
        gene: meta ? meta.display : token,
        role: meta ? meta.role : "Murine spatial transcriptomic marker",
        mean: +(baseVal + rng() * 0.45).toFixed(2)
      };
    });

    baseJob.summary = `Predicted virtual Mus musculus spatial transcriptomic expression (${genes.length} markers) across ${tiles.length} spots/tiles`;
    baseJob.panels.push({
      type: "omics",
      title: `${model.name} — Virtual Mouse Gene Expression (log1p CPM)`,
      genes
    });
    baseJob.table = genes;
    return baseJob;
  }

  if (task === "segment_wsi") {
    const rawWeights = [
      52.0 + (rng() - 0.5) * 6.0,
      18.5 + (rng() - 0.5) * 4.0,
      12.0 + (rng() - 0.5) * 2.5,
      10.5 + (rng() - 0.5) * 2.5,
      7.0 + (rng() - 0.5) * 2.0
    ];
    const totalW = rawWeights.reduce((a, b) => a + b, 0) || 100;
    const pcts = rawWeights.map((w) => +((w / totalW) * 100).toFixed(1));
    const drift = +(100 - pcts.reduce((a, b) => a + b, 0)).toFixed(1);
    pcts[0] = +(pcts[0] + drift).toFixed(1);

    const classes = [
      { name: "Hepatic Parenchyma (Zones 1-2)", color: "#c2407a", pct: pcts[0] },
      { name: "Centrilobular Coagulative Necrosis", color: "#e05a2b", pct: pcts[1] },
      { name: "Portal Triad & Bile Ductules", color: "#3b3486", pct: pcts[2] },
      { name: "Central Vein / Sinusoidal Lumen", color: "#0b7f90", pct: pcts[3] },
      { name: "Inflammatory Infiltrate / Fibrous Capsule", color: "#2f7d58", pct: pcts[4] }
    ];
    const sourceLabel = params.wsi_path
      ? String(params.wsi_path).split(/[\\/]/).pop()
      : inputNames.length > 0
      ? `${inputNames.length} uploaded ROI(s)`
      : "whole rodent organ section";
    baseJob.summary = `Segmented ${sourceLabel} into ${classes.length} MegaMouse / tissue compartments`;
    baseJob.panels.push({
      type: "spatial",
      title: `${model.name} — Whole-Slide Mouse/Rat Compartment Overlay`,
      seed: hashStr(`${model.id}:${sourceLabel}`),
      classes
    });
    baseJob.table = classes.map((c) => ({ compartment: c.name, area_percent: c.pct }));
    return baseJob;
  }

  // Default: embed_tiles or embed_slide (PCA + Cosine Heatmap + Spatial if slide)
  const parsedK = Math.round(Number(params.k_clusters));
  const k = Number.isFinite(parsedK) ? Math.max(2, Math.min(8, parsedK)) : 3;
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
