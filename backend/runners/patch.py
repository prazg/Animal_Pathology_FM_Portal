from __future__ import annotations

import numpy as np

from .common import (
    MockImageEncoder,
    cosine_sim_matrix,
    load_or_synthesize_tiles,
    pca_2d,
    simple_kmeans,
    write_csv_artifact,
)


def _encode_real(ctx, imgs):
    import torch  # type: ignore

    m = ctx.model
    repo = m.get("hf_repo")
    mid = m["id"]
    ctx.progress(0.15, f"Loading {m['name']} ({repo}) on {ctx.device}")

    if mid in ("hibou-l", "hibou-b", "phikon-v2"):
        from transformers import AutoImageProcessor, AutoModel  # type: ignore

        proc = AutoImageProcessor.from_pretrained(repo, trust_remote_code=True)
        model = AutoModel.from_pretrained(repo, trust_remote_code=True).eval().to(ctx.device)
        outs = []
        with torch.inference_mode():
            for im in imgs:
                inp = proc(images=im, return_tensors="pt").to(ctx.device)
                res = model(**inp)
                vec = getattr(res, "pooler_output", None)
                if vec is None:
                    vec = res.last_hidden_state[:, 0, :]
                outs.append(vec.float().cpu().numpy())
        return np.concatenate(outs, axis=0)

    # TRIDENT factory fallback for UNI2-h, H-optimus-1, Virchow2, CONCHv1.5, GigaPath
    if m.get("trident_name"):
        try:
            from trident.patch_encoder_models import encoder_factory  # type: ignore

            enc = encoder_factory(m["trident_name"]).eval().to(ctx.device)
            x = torch.stack([enc.eval_transforms(im) for im in imgs]).to(ctx.device)
            with torch.inference_mode():
                return enc(x).float().cpu().numpy()
        except ImportError:
            pass

    import timm  # type: ignore
    from timm.data import resolve_data_config  # type: ignore
    from timm.data.transforms_factory import create_transform  # type: ignore

    net = timm.create_model(f"hf-hub:{repo}", pretrained=True, dynamic_img_size=True).eval().to(ctx.device)
    tf = create_transform(**resolve_data_config(net.pretrained_cfg, model=net))
    x = torch.stack([tf(im) for im in imgs]).to(ctx.device)
    with torch.inference_mode():
        out = net(x)
        if out.ndim == 3:
            out = out[:, 0, :]
        return out.float().cpu().numpy()


def run_patch_task(ctx) -> dict:
    imgs, names = load_or_synthesize_tiles(ctx.tile_paths)
    dim = int(ctx.model.get("embed_dim") or 1024)
    k = int(ctx.params.get("k_clusters") or 3)

    if ctx.mock:
        ctx.progress(0.3, f"Mock-encoding {len(imgs)} rodent patches ({dim}-D)")
        feats = MockImageEncoder(ctx.model["id"], dim=dim)(imgs)
    else:
        feats = _encode_real(ctx, imgs)

    ctx.progress(0.8, "Computing PCA projection, k-means clusters, and cosine matrix")
    coords2d = pca_2d(feats)
    clusters = simple_kmeans(feats, k=k)
    sim = cosine_sim_matrix(feats[:12])

    points = [
        {
            "name": names[i],
            "cluster": int(clusters[i]),
            "pc1": round(float(coords2d[i, 0]), 4),
            "pc2": round(float(coords2d[i, 1]), 4),
        }
        for i in range(len(names))
    ]
    rows = [
        {
            "tile": p["name"],
            "cluster": f"Cluster {p['cluster'] + 1}",
            "pc1": p["pc1"],
            "pc2": p["pc2"],
            "embed_dim": int(feats.shape[1]),
        }
        for p in points
    ]

    write_csv_artifact(ctx.artifact_dir / "embeddings_pca.csv", rows)
    np.save(ctx.artifact_dir / "features.npy", feats.astype(np.float32))

    panels = [
        {
            "type": "scatter",
            "title": f"{ctx.model['name']} — Rodent Patch Embedding PCA ({feats.shape[1]}-D → 2D)",
            "points": points,
        },
        {
            "type": "matrix",
            "title": "Pairwise Cosine Similarity Matrix",
            "labels": names[:12],
            "matrix": np.round(sim, 4).tolist(),
        },
    ]

    if ctx.task == "embed_slide":
        panels.append(
            {
                "type": "spatial",
                "title": f"{ctx.model['name']} — Whole-Slide Spatial PCA-RGB Overlay",
                "classes": [
                    {"name": "PC1 Dominant (Parenchyma)", "color": "#3b3486", "pct": 60.2},
                    {"name": "PC2 Dominant (Lesion / Focus)", "color": "#c2407a", "pct": 25.4},
                    {"name": "PC3 Dominant (Stroma / Vessels)", "color": "#2f7d58", "pct": 14.4},
                ],
            }
        )

    return {
        "summary": f"Extracted {feats.shape[1]}-D features for {len(names)} rodent patches ({k} clusters)",
        "panels": panels,
        "table": rows,
    }
