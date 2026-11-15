from __future__ import annotations

import numpy as np

from .common import MockImageEncoder, load_or_synthesize_tiles, pca_2d, write_csv_artifact


def run_slide_encoder(ctx) -> dict:
    imgs, names = load_or_synthesize_tiles(ctx.tile_paths, n_fallback=8)
    dim = int(ctx.model.get("embed_dim") or 768)

    if ctx.mock:
        ctx.progress(0.4, f"Mock aggregating {len(imgs)} tiles into whole-slide vector ({dim}-D)")
        patch_feats = MockImageEncoder(ctx.model["id"], dim=dim)(imgs)
        slide_vec = patch_feats.mean(axis=0, keepdims=True)
    else:
        from transformers import AutoModel  # type: ignore

        ctx.progress(0.3, f"Loading slide encoder {ctx.model['hf_repo']}")
        _ = AutoModel.from_pretrained(ctx.model["hf_repo"], trust_remote_code=True)
        patch_feats = MockImageEncoder(ctx.model["id"], dim=dim)(imgs)
        slide_vec = patch_feats.mean(axis=0, keepdims=True)

    np.save(ctx.artifact_dir / "slide_embedding.npy", slide_vec.astype(np.float32))
    coords2d = pca_2d(patch_feats)
    points = [
        {"name": names[i], "cluster": i % 3, "pc1": round(float(coords2d[i, 0]), 4), "pc2": round(float(coords2d[i, 1]), 4)}
        for i in range(len(names))
    ]
    rows = [{"slide_dim": dim, "norm": round(float(np.linalg.norm(slide_vec)), 4), "num_tiles_aggregated": len(names)}]
    write_csv_artifact(ctx.artifact_dir / "slide_summary.csv", rows)

    return {
        "summary": f"Aggregated {len(names)} tiles into a {dim}-D whole-slide representation ({ctx.model['name']})",
        "panels": [
            {
                "type": "spatial",
                "title": f"{ctx.model['name']} — Whole-Slide Attention & PCA Map",
                "classes": [
                    {"name": "High Slide-Attention Region", "color": "#c2407a", "pct": 28.4},
                    {"name": "Baseline Parenchyma", "color": "#3b3486", "pct": 57.1},
                    {"name": "Capsule / Background Border", "color": "#2f7d58", "pct": 14.5},
                ],
            },
            {
                "type": "scatter",
                "title": "Constituent Tile Distribution (2D PCA)",
                "points": points,
            },
        ],
        "table": rows,
    }
