from __future__ import annotations

from typing import Dict, Any, Optional


def check_all_weights(registry: dict) -> Dict[str, Any]:
    results: Dict[str, Any] = {}
    try:
        from huggingface_hub import try_to_load_from_cache  # type: ignore
    except Exception:
        try_to_load_from_cache = None

    for m in registry.get("models", []):
        repo = m.get("hf_repo")
        if not m.get("open_weights") or not repo:
            continue
        req_files = m.get("hf_files") or ["config.json"]
        cached_files = []
        if try_to_load_from_cache is not None:
            for fname in req_files:
                hit = try_to_load_from_cache(repo_id=repo, filename=fname)
                if isinstance(hit, str):
                    cached_files.append(fname)
        results[m["id"]] = {
            "hf_repo": repo,
            "cached": len(cached_files) == len(req_files) and len(req_files) > 0,
            "cached_files": cached_files,
            "required_files": req_files,
        }
    return results


def download_model_weights(model: dict, hf_token: Optional[str] = None, mock: bool = False) -> Dict[str, Any]:
    repo = model.get("hf_repo")
    if not repo:
        return {"status": "skipped", "detail": "Model does not define a Hugging Face repository."}
    if mock:
        return {"status": "mock_downloaded", "detail": f"Mock mode enabled; verified repo metadata for {repo}."}

    from huggingface_hub import snapshot_download  # type: ignore

    local_dir = snapshot_download(repo_id=repo, token=hf_token or None)
    return {"status": "downloaded", "detail": f"Cached at {local_dir}"}


def check_hf_gated_access(registry: dict, hf_token: Optional[str] = None, mock: bool = False) -> Dict[str, Any]:
    access: Dict[str, str] = {}
    if mock:
        for m in registry.get("models", []):
            if m.get("hf_repo"):
                access[m["id"]] = "mock_ok"
        return {"access": access}

    from huggingface_hub import HfApi  # type: ignore
    api = HfApi(token=hf_token or None)
    for m in registry.get("models", []):
        repo = m.get("hf_repo")
        if not repo:
            continue
        try:
            api.model_info(repo_id=repo, token=hf_token or None)
            access[m["id"]] = "accessible"
        except Exception as exc:
            access[m["id"]] = f"restricted ({type(exc).__name__})"
    return {"access": access}
