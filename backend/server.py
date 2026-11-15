from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import ROOT_DIR, load_config, load_registry
from .hardware import detect_hardware
from .jobs import JobManager
from .weights import check_all_weights, check_hf_gated_access, download_model_weights

cfg = load_config()
registry = load_registry()
hw_info = detect_hardware(cfg.device)
job_manager = JobManager((ROOT_DIR / cfg.artifacts_dir).resolve())

app = FastAPI(
    title="AnimalPath-FM Local Backend",
    version=registry["portal"]["version"],
    description="Local FastAPI inference & Hugging Face weight manager for Preclinical & Animal Pathology Foundation Models.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.allowed_origins if "*" not in cfg.allowed_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network_access(request: Request, call_next):
    """Permits HTTPS GitHub Pages to reach http://127.0.0.1:8000 in Chromium browsers."""
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def verify_key(
    x_portal_key: Optional[str] = Header(default=None),
    key: Optional[str] = Query(default=None),
) -> None:
    if not cfg.portal_key:
        return
    provided = x_portal_key or key or ""
    if provided != cfg.portal_key:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Portal-Key")


class TokenPayload(BaseModel):
    hf_token: Optional[str] = None


def _validate_wsi_path(raw_path: Optional[str]) -> Optional[Path]:
    if not raw_path:
        return None
    p = Path(raw_path).resolve()
    if cfg.mock:
        return p
    allowed = [(ROOT_DIR / r).resolve() for r in cfg.allowed_wsi_roots]
    if not any(str(p).startswith(str(root)) for root in allowed):
        raise HTTPException(
            status_code=403,
            detail=f"WSI path '{p}' is outside configured allowed_wsi_roots in backend/config.yaml",
        )
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"WSI file not found: {p}")
    return p


@app.get("/api/health", dependencies=[Depends(verify_key)])
def api_health():
    return {
        "status": "ok",
        "portal": registry["portal"]["short_name"],
        "version": registry["portal"]["version"],
        "mock": cfg.mock,
        "allowed_wsi_roots": cfg.allowed_wsi_roots,
        **hw_info,
    }


@app.get("/api/models", dependencies=[Depends(verify_key)])
def api_models():
    weights = check_all_weights(registry)
    return {
        "models": registry["models"],
        "weights": weights,
    }


@app.get("/api/weights", dependencies=[Depends(verify_key)])
def api_weights():
    return {
        "hf_home": hw_info["hf_home"],
        "models": check_all_weights(registry),
    }


@app.post("/api/weights/access", dependencies=[Depends(verify_key)])
def api_weights_access(payload: TokenPayload):
    return check_hf_gated_access(registry, hf_token=payload.hf_token, mock=cfg.mock)


@app.post("/api/weights/{model_id}/download", dependencies=[Depends(verify_key)])
def api_download_weight(model_id: str, payload: TokenPayload):
    model = next((m for m in registry["models"] if m["id"] == model_id), None)
    if not model:
        raise HTTPException(status_code=404, detail=f"Unknown model_id: {model_id}")
    return download_model_weights(model, hf_token=payload.hf_token, mock=cfg.mock)


@app.post("/api/jobs", dependencies=[Depends(verify_key)])
async def api_create_job(
    model_id: str = Form(...),
    task: str = Form(...),
    params: str = Form("{}"),
    wsi_path: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
):
    model = next((m for m in registry["models"] if m["id"] == model_id), None)
    if not model or not model.get("runnable"):
        raise HTTPException(status_code=400, detail=f"Model '{model_id}' is not runnable locally.")
    if task not in (model.get("tasks") or []):
        raise HTTPException(status_code=400, detail=f"Task '{task}' is not supported by '{model_id}'.")

    parsed_params = json.loads(params or "{}")
    checked_wsi = _validate_wsi_path(wsi_path)

    upload_dir = (ROOT_DIR / cfg.artifacts_dir / "_uploads").resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_tiles: List[Path] = []
    for uf in files:
        if not uf.filename:
            continue
        dest = upload_dir / Path(uf.filename).name
        content = await uf.read()
        dest.write_bytes(content)
        saved_tiles.append(dest)

    job = job_manager.create_and_start(
        model=model,
        task=task,
        params=parsed_params,
        device=hw_info["device"],
        mock=cfg.mock,
        vllm_base_url=cfg.vllm_base_url,
        tile_paths=saved_tiles,
        wsi_path=checked_wsi,
        run_sync=cfg.mock,
    )
    return job


@app.get("/api/jobs/{job_id}", dependencies=[Depends(verify_key)])
def api_get_job(job_id: str):
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job


@app.get("/api/jobs/{job_id}/files/{filename}", dependencies=[Depends(verify_key)])
def api_get_job_file(job_id: str, filename: str):
    path = job_manager.get_artifact_path(job_id, filename)
    if not path:
        raise HTTPException(status_code=404, detail="Artifact file not found")
    return FileResponse(path, filename=path.name)


@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/portal/index.html")


docs_dir = ROOT_DIR / "docs"
if docs_dir.exists():
    app.mount("/portal", StaticFiles(directory=str(docs_dir), html=True), name="portal")
