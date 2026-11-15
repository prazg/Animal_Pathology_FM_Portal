from __future__ import annotations

import numpy as np

from .common import MockImageEncoder, load_or_synthesize_tiles, write_csv_artifact

DEFAULT_ROLES = {
    "Alb": "Pan-hepatocyte functional marker",
    "Cyp2e1": "Pericentral Zone-3 cytochrome P450",
    "Glul": "Pericentral glutamine synthetase",
    "Havcr1": "Kidney injury molecule-1 (Kim-1)",
    "Col1a1": "Fibrotic Type-I collagen matrix",
    "Ptprc": "CD45 pan-leukocyte infiltrate",
}


def run_spatial_omics(ctx) -> dict:
    imgs, names = load_or_synthesize_tiles(ctx.tile_paths, n_fallback=6)
    raw_genes = ctx.params.get("genes") or "Alb, Cyp2e1, Glul, Havcr1, Col1a1, Ptprc"
    gene_list = [g.strip() for g in raw_genes.split(",") if g.strip()] or list(DEFAULT_ROLES.keys())

    ctx.progress(0.45, f"Predicting virtual Mus musculus expression for {len(gene_list)} markers")
    feats = MockImageEncoder(ctx.model["id"], dim=max(16, len(gene_list)))(imgs)
    means = np.abs(feats[:, : len(gene_list)]).mean(axis=0) * 8.5 + 1.1

    genes_payload = [
        {
            "gene": g,
            "role": DEFAULT_ROLES.get(g, "Murine spatial transcriptomic marker"),
            "mean": round(float(means[idx]), 2),
        }
        for idx, g in enumerate(gene_list)
    ]
    write_csv_artifact(ctx.artifact_dir / "virtual_mouse_omics.csv", genes_payload)

    return {
        "summary": f"Predicted virtual Mus musculus expression for {len(gene_list)} genes across {len(names)} H&E spots",
        "panels": [
            {
                "type": "omics",
                "title": f"{ctx.model['name']} — Predicted Mouse Spatial Gene Expression (log1p CPM)",
                "genes": genes_payload,
            }
        ],
        "table": genes_payload,
    }
