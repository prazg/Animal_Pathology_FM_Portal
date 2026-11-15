// Client WebGL / WebGPU hardware probe & VRAM compatibility badge calculator

export async function probeClientHardware() {
  let gpuName = "Unknown Browser GPU";
  let estimatedVramGb = 8;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        gpuName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpuName;
      }
    }
  } catch (_) {
    // Ignore WebGL sandbox restrictions
  }

  const lower = gpuName.toLowerCase();
  if (/4090|3090|a5000|l4|rtx 6000|m2 max|m3 max|m4 max/.test(lower)) {
    estimatedVramGb = 24;
  } else if (/a100|h100|h200|a6000|l40/.test(lower)) {
    estimatedVramGb = 48;
  } else if (/4080|4070 ti|a4000|m1 pro|m2 pro|m3 pro|m4 pro/.test(lower)) {
    estimatedVramGb = 16;
  } else if (/3060|4070|3080/.test(lower)) {
    estimatedVramGb = 12;
  } else if (/intel|iris|uhd/.test(lower)) {
    estimatedVramGb = 4;
  }

  const cores = navigator.hardwareConcurrency || 8;
  const memGb = navigator.deviceMemory || 16;

  return {
    source: "browser",
    gpuName,
    estimatedVramGb,
    cores,
    ramGb: memGb
  };
}

export function evaluateHardwareFit(model, availableVramGb) {
  if (!model.open_weights || !model.vram_min_gb) {
    return { status: "reference", label: "Literature Ref", css: "badge-ref" };
  }
  if (availableVramGb >= (model.vram_rec_gb || model.vram_min_gb)) {
    return { status: "ok", label: `Fits (${model.vram_min_gb} GB+)`, css: "badge-hw-ok" };
  }
  if (availableVramGb >= model.vram_min_gb) {
    return { status: "tight", label: `Min VRAM (${model.vram_min_gb} GB)`, css: "badge-hw-tight" };
  }
  return { status: "low", label: `Needs ${model.vram_min_gb} GB VRAM`, css: "badge-gated" };
}
