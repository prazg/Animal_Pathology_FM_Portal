"""CLI hardware, package, and weight cache checker for AnimalPath-FM."""
from __future__ import annotations

from .config import load_config, load_registry
from .hardware import detect_hardware
from .weights import check_all_weights


def main() -> None:
    cfg = load_config()
    reg = load_registry()
    hw = detect_hardware(cfg.device)
    weights = check_all_weights(reg)

    print("=== AnimalPath-FM Local Diagnostic ===")
    print(f"OS / CPU / RAM : {hw['os']} | {hw['cpu_cores']} cores | {hw['ram_gb']} GB RAM")
    print(f"Compute Device : {hw['device']} ({hw['gpu_name'] or 'CPU-only'}, VRAM: {hw['vram_gb'] or 0} GB)")
    print(f"PyTorch        : {hw['torch_version'] or 'Not installed (Mock/Server-only mode)'}")
    print(f"HF Cache       : {hw['hf_home']}")
    print("\n=== Open-Weight Models Cache Status ===")
    for m in reg["models"]:
        if not m.get("open_weights"):
            continue
        st = weights.get(m["id"], {})
        flag = "READY" if st.get("cached") else "NOT CACHED"
        print(f"  [{flag:10s}] {m['name']:22s} -> {m.get('hf_repo') or m.get('github_url')}")


if __name__ == "__main__":
    main()
