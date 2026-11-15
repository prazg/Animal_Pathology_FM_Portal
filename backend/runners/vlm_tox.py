from __future__ import annotations

import base64
import io
import numpy as np

from .common import load_or_synthesize_tiles, write_csv_artifact


def _parse_choices(raw: str):
    lines = [s.strip() for s in (raw or "").splitlines() if s.strip()]
    if not lines:
        lines = [
            "Normal hepatic parenchyma",
            "Centrilobular hepatocellular necrosis",
            "Periportal bile duct hyperplasia",
            "Microvesicular steatosis",
        ]
    return lines


def run_tox_vqa(ctx) -> dict:
    imgs, names = load_or_synthesize_tiles(ctx.tile_paths, n_fallback=2)
    organ = ctx.params.get("organ") or "Sprague-Dawley Rat Liver (H&E)"
    choices = _parse_choices(ctx.params.get("prompts", ""))

    if ctx.mock:
        ctx.progress(0.4, f"Mock evaluating {ctx.model['name']} across {len(choices)} toxicologic choices")
        arr = np.asarray(imgs[0].resize((32, 32)), dtype=np.float32) / 255.0
        eosin_ratio = float(arr[..., 0].mean() / (arr[..., 1].mean() + 0.1))
        logits = np.array([1.1 if i == 1 and eosin_ratio > 1.2 else (0.9 if i == 0 else 0.15) for i in range(len(choices))], dtype=np.float32)
        probs = np.exp(logits) / np.exp(logits).sum()
    else:
        # Try local OpenAI-compatible vLLM endpoint first, else fall back to local HF transformers
        probs = _run_live_tissuedecision(ctx, imgs[0], organ, choices)

    ranked = sorted(
        [{"label": choices[i], "prob": round(float(probs[i]), 4)} for i in range(len(choices))],
        key=lambda x: x["prob"],
        reverse=True,
    )

    rows = [
        {
            "rank": idx + 1,
            "finding": item["label"],
            "probability": item["prob"],
            "sample_tile": names[0],
        }
        for idx, item in enumerate(ranked)
    ]
    write_csv_artifact(ctx.artifact_dir / "tox_vqa_predictions.csv", rows)

    return {
        "summary": f"Evaluated {len(imgs)} rodent ROI(s) · Top call: {ranked[0]['label']} ({ranked[0]['prob'] * 100:.1f}%)",
        "panels": [
            {
                "type": "bars",
                "title": f"{ctx.model['name']} — Rodent Toxicologic Triage Probabilities",
                "subtitle": f"Organ Context: {organ} · Primary Tile: {names[0]}",
                "items": ranked,
            }
        ],
        "table": rows,
    }


def _run_live_tissuedecision(ctx, image, organ: str, choices: list) -> np.ndarray:
    import httpx  # type: ignore

    choice_str = "\n".join(f"{chr(65 + i)}) {c}" for i, c in enumerate(choices))
    prompt = f"Organ: {organ}. Select the single most accurate histopathological finding:\n{choice_str}"

    # 1. Probe local vLLM endpoint if running
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                f"{ctx.vllm_base_url.rstrip('/')}/chat/completions",
                json={
                    "model": ctx.model["hf_repo"],
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ],
                    "max_tokens": 64,
                    "temperature": 0.0,
                },
            )
            if resp.status_code == 200:
                ans = resp.json()["choices"][0]["message"]["content"]
                return _text_to_probs(ans, choices)
    except Exception:
        pass

    # 2. Local Hugging Face Transformers inference
    import torch  # type: ignore
    from transformers import AutoProcessor, AutoModelForImageTextToText  # type: ignore

    repo = ctx.model["hf_repo"]
    ctx.progress(0.25, f"Loading {repo} via Hugging Face transformers")
    proc = AutoProcessor.from_pretrained(repo)
    dtype = torch.bfloat16 if ctx.device == "cuda" else torch.float32
    model = AutoModelForImageTextToText.from_pretrained(repo, torch_dtype=dtype, device_map="auto")
    msgs = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt}]}]
    inputs = proc.apply_chat_template(msgs, add_generation_prompt=True, tokenize=True, return_dict=True, return_tensors="pt").to(model.device)
    with torch.inference_mode():
        out = model.generate(**inputs, max_new_tokens=64, do_sample=False)
    decoded = proc.decode(out[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True)
    return _text_to_probs(decoded, choices)


def _text_to_probs(answer_text: str, choices: list) -> np.ndarray:
    scores = np.full(len(choices), 0.05, dtype=np.float32)
    low = answer_text.lower()
    for i, c in enumerate(choices):
        letter = f"{chr(97 + i)})"
        if c.lower() in low or letter in low:
            scores[i] = 0.80
            break
    return scores / scores.sum()
