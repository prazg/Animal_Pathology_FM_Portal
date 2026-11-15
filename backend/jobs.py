from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional

from .runners import dispatch_runner


class JobContext:
    def __init__(
        self,
        job_id: str,
        model: dict,
        task: str,
        params: dict,
        device: str,
        mock: bool,
        vllm_base_url: str,
        artifact_dir: Path,
        tile_paths: List[Path],
        wsi_path: Optional[Path],
        update_cb,
    ):
        self.job_id = job_id
        self.model = model
        self.task = task
        self.params = params
        self.device = device
        self.mock = mock
        self.vllm_base_url = vllm_base_url
        self.artifact_dir = artifact_dir
        self.tile_paths = tile_paths
        self.wsi_path = wsi_path
        self._update_cb = update_cb

    def progress(self, frac: float, message: str = "") -> None:
        self._update_cb(frac, message)


class JobManager:
    def __init__(self, artifacts_root: Path):
        self.artifacts_root = artifacts_root
        self.artifacts_root.mkdir(parents=True, exist_ok=True)
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create_and_start(
        self,
        model: dict,
        task: str,
        params: dict,
        device: str,
        mock: bool,
        vllm_base_url: str,
        tile_paths: List[Path],
        wsi_path: Optional[Path],
        run_sync: bool = False,
    ) -> Dict[str, Any]:
        job_id = uuid.uuid4().hex[:10]
        art_dir = self.artifacts_root / job_id
        art_dir.mkdir(parents=True, exist_ok=True)

        record: Dict[str, Any] = {
            "id": job_id,
            "mode": "mock" if mock else "server",
            "status": "queued",
            "progress": 0.0,
            "message": "Queued",
            "created_at": time.strftime("%H:%M:%S"),
            "model_id": model["id"],
            "model_name": model["name"],
            "task": task,
            "summary": "",
            "panels": [],
            "table": [],
            "files": [],
        }
        with self._lock:
            self._jobs[job_id] = record

        def _update(frac: float, msg: str) -> None:
            with self._lock:
                record["progress"] = round(float(frac), 3)
                if msg:
                    record["message"] = msg

        ctx = JobContext(
            job_id=job_id,
            model=model,
            task=task,
            params=params,
            device=device,
            mock=mock,
            vllm_base_url=vllm_base_url,
            artifact_dir=art_dir,
            tile_paths=tile_paths,
            wsi_path=wsi_path,
            update_cb=_update,
        )

        def _worker() -> None:
            with self._lock:
                record["status"] = "running"
                record["message"] = f"Running {model['name']} ({task})"
            try:
                out = dispatch_runner(ctx)
                files = [p.name for p in sorted(art_dir.iterdir()) if p.is_file() and not p.name.startswith("_")]
                with self._lock:
                    record.update(out)
                    record["files"] = files
                    record["progress"] = 1.0
                    record["status"] = "completed"
                    record["message"] = "Completed"
            except Exception as exc:
                with self._lock:
                    record["status"] = "failed"
                    record["error"] = str(exc)
                    record["message"] = f"Failed: {exc}"

        if run_sync:
            _worker()
        else:
            t = threading.Thread(target=_worker, daemon=True)
            t.start()

        return self.get(job_id)  # type: ignore

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def get_artifact_path(self, job_id: str, filename: str) -> Optional[Path]:
        safe_name = Path(filename).name
        candidate = (self.artifacts_root / job_id / safe_name).resolve()
        if candidate.exists() and candidate.is_file():
            return candidate
        return None
