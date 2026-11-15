from __future__ import annotations

import os
import platform
from typing import Dict, Any


def detect_hardware(preferred_device: str = "auto") -> Dict[str, Any]:
    cpu_cores = os.cpu_count() or 4
    ram_gb = 16.0
    try:
        import psutil  # type: ignore
        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        pass

    device = "cpu"
    gpu_name = None
    vram_gb = None
    torch_version = None

    try:
        import torch  # type: ignore
        torch_version = torch.__version__
        if preferred_device in ("auto", "cuda") and torch.cuda.is_available():
            device = "cuda"
            gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram_gb = round(props.total_memory / (1024**3), 1)
        elif preferred_device in ("auto", "mps") and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device = "mps"
            gpu_name = "Apple Silicon MPS"
            vram_gb = ram_gb
        elif preferred_device not in ("auto",):
            device = preferred_device
    except Exception:
        pass

    hf_home = os.environ.get(
        "HF_HOME",
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface"),
    )

    return {
        "os": platform.system(),
        "cpu_cores": cpu_cores,
        "ram_gb": ram_gb,
        "device": device,
        "gpu_name": gpu_name,
        "vram_gb": vram_gb,
        "torch_version": torch_version,
        "hf_home": hf_home,
    }
