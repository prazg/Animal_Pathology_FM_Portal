from __future__ import annotations

from . import patch, vlm_tox, zeroshot, segment, slide, spatial_omics


def dispatch_runner(ctx) -> dict:
    task = ctx.task
    if task == "tox_vqa":
        return vlm_tox.run_tox_vqa(ctx)
    if task == "zeroshot_classify":
        return zeroshot.run_zeroshot(ctx)
    if task == "predict_omics":
        return spatial_omics.run_spatial_omics(ctx)
    if task == "segment_wsi":
        return segment.run_segment(ctx)
    if task == "embed_slide" and ctx.model.get("runner") == "slide":
        return slide.run_slide_encoder(ctx)
    if task in ("embed_tiles", "embed_slide"):
        return patch.run_patch_task(ctx)
    raise ValueError(f"Unsupported task '{task}' for model '{ctx.model.get('id')}'")
