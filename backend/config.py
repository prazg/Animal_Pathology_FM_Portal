from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import yaml

ROOT_DIR = Path(__file__).resolve().parent.parent
MODELS_JSON_PATH = ROOT_DIR / "docs" / "models.json"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"
EXAMPLE_CONFIG_PATH = Path(__file__).resolve().parent / "config.example.yaml"


@dataclass
class PortalConfig:
    host: str = "127.0.0.1"
    port: int = 8000
    portal_key: str = ""
    allowed_origins: List[str] = field(
        default_factory=lambda: [
            "https://prazg.github.io",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "null",
        ]
    )
    device: str = "auto"
    mock: bool = False
    vllm_base_url: str = "http://127.0.0.1:8001/v1"
    allowed_wsi_roots: List[str] = field(default_factory=lambda: ["./sample_slides"])
    artifacts_dir: str = "./backend/artifacts"


def load_config() -> PortalConfig:
    cfg_path = DEFAULT_CONFIG_PATH if DEFAULT_CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    raw = {}
    if cfg_path.exists():
        with open(cfg_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

    cfg = PortalConfig(
        host=str(raw.get("host", "127.0.0.1")),
        port=int(raw.get("port", 8000)),
        portal_key=os.environ.get("PORTAL_KEY", str(raw.get("portal_key", ""))),
        allowed_origins=list(raw.get("allowed_origins") or PortalConfig().allowed_origins),
        device=os.environ.get("PORTAL_DEVICE", str(raw.get("device", "auto"))),
        mock=bool(raw.get("mock", False))
        or os.environ.get("PORTAL_MOCK", "0") in ("1", "true", "True")
        or os.environ.get("MOCK", "0") in ("1", "true", "True"),
        vllm_base_url=os.environ.get("VLLM_BASE_URL", str(raw.get("vllm_base_url", "http://127.0.0.1:8001/v1"))),
        allowed_wsi_roots=list(raw.get("allowed_wsi_roots") or ["./sample_slides"]),
        artifacts_dir=str(raw.get("artifacts_dir", "./backend/artifacts")),
    )
    return cfg


def load_registry() -> dict:
    with open(MODELS_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
