from __future__ import annotations

import numpy as np

from .common import MockImageEncoder, load_or_synthesize_tiles, write_csv_artifact


def run_zeroshot(ctx) -> dict:
    imgs, names = load_or_synthesize_tiles(ctx.tile_paths, n_fallback=4)
    prompts = [
        s.strip()
        for s in (ctx.params.get("prompts") or "Normal parenchyma\nCoagulative necrosis\nSteatosis\nPortal fibrosis").splitlines()
        if s.strip()
    ]

    if ctx.mock:
        ctx.progress(0.4, f"Mock zero-shot scoring {len(prompts)} prompts with {ctx.model['name']}")
        img_vecs = MockImageEncoder(ctx.model["id"], dim=512)(imgs)
        rng = np.random.default_rng(len(prompts) + 7)
        txt_vecs = rng.standard_normal((len(prompts), 512)).astype(np.float32)
        txt_vecs /= np.linalg.norm(txt_vecs, axis=1, keepdims=True) + 1e-8
        logits = (img_vecs.mean(axis=0, keepdims=True) @ txt_vecs.T)[0] * 4.0
        probs = np.exp(logits) / np.exp(logits).sum()
    else:
        import torch  # type: ignore
        from conch.open_clip_custom import create_model_from_pretrained, tokenize, get_tokenizer  # type: ignore

        repo = ctx.model["hf_repo"]
        model, preprocess = create_model_from_pretrained("conch_ViT-B-16", f"hf_hub:{repo}")
        model = model.eval().to(ctx.device)
        tok = tokenize(texts=prompts, tokenizer=get_tokenizer()).to(ctx.device)
        batch = torch.stack([preprocess(im) for im in imgs]).to(ctx.device)
        with torch.inference_mode():
            im_f = model.encode_image(batch)
            tx_f = model.encode_text(tok)
            p = (im_f @ tx_f.T * model.logit_scale.exp()).softmax(dim=-1).mean(dim=0)
            probs = p.float().cpu().numpy()

    items = sorted(
        [{"label": prompts[i], "prob": round(float(probs[i]), 4)} for i in range(len(prompts))],
        key=lambda x: x["prob"],
        reverse=True,
    )
    rows = [{"rank": i + 1, "prompt": it["label"], "probability": it["prob"]} for i, it in enumerate(items)]
    write_csv_artifact(ctx.artifact_dir / "zeroshot_scores.csv", rows)

    return {
        "summary": f"Zero-shot scored {len(prompts)} histological prompts across {len(names)} tiles · Top: {items[0]['label']}",
        "panels": [
            {
                "type": "bars",
                "title": f"{ctx.model['name']} — Zero-Shot Lesion Similarity Probabilities",
                "items": items,
            }
        ],
        "table": rows,
    }
