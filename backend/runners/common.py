from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image


class MockImageEncoder:
    """Deterministic image feature projector for MOCK=1 testing & CI verification."""

    def __init__(self, model_id: str, dim: int = 1024):
        seed = int(hashlib.sha256(model_id.encode("utf-8")).hexdigest()[:8], 16)
        self.rng = np.random.default_rng(seed)
        self.dim = dim
        self.proj = self.rng.standard_normal((12, dim)).astype(np.float32)

    def __call__(self, images: List[Image.Image]) -> np.ndarray:
        feats = []
        for idx, im in enumerate(images):
            arr = np.asarray(im.convert("RGB").resize((32, 32)), dtype=np.float32) / 255.0
            stats = np.concatenate(
                [
                    arr.mean(axis=(0, 1)),
                    arr.std(axis=(0, 1)),
                    np.quantile(arr, 0.25, axis=(0, 1)),
                    np.quantile(arr, 0.75, axis=(0, 1)),
                ]
            )
            vec = stats @ self.proj + 0.05 * np.sin(idx + 1)
            norm = np.linalg.norm(vec) + 1e-8
            feats.append(vec / norm)
        return np.stack(feats, axis=0)


def load_or_synthesize_tiles(tile_paths: List[Path], n_fallback: int = 8) -> Tuple[List[Image.Image], List[str]]:
    if tile_paths:
        imgs = [Image.open(p).convert("RGB") for p in tile_paths]
        names = [p.name for p in tile_paths]
        return imgs, names

    # Synthesize deterministic H&E-toned rodent tiles when none were uploaded
    rng = np.random.default_rng(42)
    imgs, names = [], []
    organs = ["SD_Rat_Liver_Ctrl", "SD_Rat_Liver_Necrosis", "C57BL6_Kidney_Cortex", "GEMM_Lung_Adenoma"]
    for i in range(n_fallback):
        base = np.zeros((128, 128, 3), dtype=np.uint8)
        base[..., 0] = int(185 + (i % 3) * 18)
        base[..., 1] = int(110 + (i % 4) * 15)
        base[..., 2] = int(165 + (i % 2) * 25)
        noise = rng.integers(-20, 20, size=(128, 128, 3))
        arr = np.clip(base.astype(int) + noise, 0, 255).astype(np.uint8)
        imgs.append(Image.fromarray(arr))
        names.append(f"{organs[i % len(organs)]}_{i + 1:02d}.png")
    return imgs, names


def pca_2d(x: np.ndarray) -> np.ndarray:
    if x.shape[0] < 2:
        return np.zeros((x.shape[0], 2), dtype=np.float32)
    xc = x - x.mean(axis=0, keepdims=True)
    _, _, vt = np.linalg.svd(xc, full_matrices=False)
    comps = vt[:2].T
    if comps.shape[1] < 2:
        comps = np.pad(comps, ((0, 0), (0, 2 - comps.shape[1])))
    return (xc @ comps).astype(np.float32)


def simple_kmeans(x: np.ndarray, k: int = 3, iters: int = 15) -> np.ndarray:
    n = x.shape[0]
    k = max(1, min(k, n))
    centers = x[:k].copy()
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        dists = np.linalg.norm(x[:, None, :] - centers[None, :, :], axis=-1)
        labels = dists.argmin(axis=1)
        for c in range(k):
            mask = labels == c
            if mask.any():
                centers[c] = x[mask].mean(axis=0)
    return labels


def cosine_sim_matrix(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True) + 1e-8
    xn = x / norms
    return np.clip(xn @ xn.T, 0.0, 1.0)


def write_csv_artifact(path: Path, rows: List[dict]) -> None:
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
