# AnimalPath-FM — Preclinical, Rodent & Veterinary Pathology Foundation Models Portal

AnimalPath-FM is a zero-build web portal and local FastAPI bridge for discovering, citing, and executing open-weight histopathology foundation models across mouse, rat, toxicologic, and comparative pathology workflows. Explore models, paper links, CLI/Python quickstarts, and interactive visualizers in-browser or run privacy-preserving inference directly on local GPUs and HPC nodes.

A pure static **GitHub Pages graphical portal (`docs/`)** paired with a **local FastAPI inference & weight-management backend (`backend/`)** for accessing, citing, benchmarking, and locally running open-weight histopathology foundation models on **mouse, rat, toxicologic, and veterinary pathology** slides.

Created and curated by Prajwal Ghimire
---

## Highlights

- **Zero-Build GitHub Pages Frontend (`docs/`)**: Pure vanilla HTML5, CSS custom properties (*Brightfield H&E* & *Darkfield Fluorescence* themes), and ES6 modules—ready to publish directly from `/docs` or GitHub Actions with zero Node/bundler steps.
- **Privacy-Preserving Local Execution (`backend/`)**: Whole-slide images (`.svs`, `.ndpi`, `.tif`) and H&E/PAS tiles stay strictly on your workstation or Slurm GPU node (`127.0.0.1:8000` with Chromium Private Network Access support).
- **Instant GPU-Free Browser Demo Mode**: Explore interactive PCA scatter plots, cosine similarity matrices, calibrated rodent lesion triage bars, MegaMouse compartment overlays, and virtual *Mus musculus* gene expression right in the browser without a GPU.
- **Direct Access to Weights, CLI, Python Snippets & Verified Papers**: Click any **Microscope Slide Card** to copy `hf download` commands, standalone Python inference code, BibTeX citations, and direct DOI/arXiv links.

---

## Included Foundation Models (`docs/models.json`)

### A. Runnable Open-Weight Models (13 Models)

| Model | Scope / Species Alignment | Family | Params | License | Paper / Release |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[TissueDecision-9B](https://huggingface.co/lighteternal/tissuedecision-9b)** | **Rodent-Native** (Mouse & Rat Tox Pathology; 64.9% SOTA on VIPER) | Rodent Tox VLM | 9.0B | CC-BY-SA-4.0 *(Ungated)* | [HF Release](https://huggingface.co/lighteternal/tissuedecision-9b) · [VIPER arXiv:2608.26382](https://arxiv.org/abs/2608.26382) |
| **[Hibou-L](https://huggingface.co/histai/hibou-L)** | **Multi-Species** (Explicitly includes **veterinary biopsies**) | Patch Encoder | 304M | Apache-2.0 *(Ungated)* | [arXiv:2406.05074](https://arxiv.org/abs/2406.05074) |
| **[Hibou-B](https://huggingface.co/histai/hibou-b)** | **Multi-Species** (Includes **veterinary biopsies**, 2 GB VRAM) | Patch Encoder | 86M | Apache-2.0 *(Ungated)* | [arXiv:2406.05074](https://arxiv.org/abs/2406.05074) |
| **[TiSAM (MegaMouse)](https://github.com/Kiemen-Lab/tisam)** | **Mouse-Native** (52 tissue classes across 12 mouse organs) | Rodent WSI Segment | 715M | GPL-3.0 / CC-BY-NC-ND-4.0 | [bioRxiv 10.64898/2026.10.16.759688](https://doi.org/10.64898/2026.10.16.759688) |
| **[Loki (OmiCLIP)](https://huggingface.co/WangGuangyuLab/Loki)** | **Mouse & Human** (Validated on mouse brain/organ spatial omics) | Spatial Omics | 428M | Academic Open *(Ungated)* | [Nature Methods (2025)](https://doi.org/10.1038/s41592-025-02707-1) |
| **[DeepSpot-M](https://github.com/ratschlab/DeepSpotM)** | **Mouse-Native** (Virtual *Mus musculus* spatial transcriptomics) | Spatial Omics | 350M | MIT / Open Source | [medRxiv 10.64898/2026.06.19.26356060](https://doi.org/10.64898/2026.06.19.26356060) |
| **[UNI2-h](https://huggingface.co/mahmoodlab/UNI2-h)** | Cross-Species Transfer (TiSAM MegaMouse & GEMM backbone) | Patch Encoder | 681M | CC-BY-NC-ND-4.0 *(Gated)* | [Nature Medicine (2024)](https://doi.org/10.1038/s41591-024-02857-3) |
| **[H-optimus-1](https://huggingface.co/bioptimus/H-optimus-1)** | Cross-Species Transfer (Top scorer on mouse HEST-Bench) | Patch Encoder | 1.1B | Bioptimus NC *(Gated)* | [HF Card](https://huggingface.co/bioptimus/H-optimus-1) · [HEST arXiv:2406.16192](https://arxiv.org/abs/2406.16192) |
| **[Virchow2](https://huggingface.co/paige-ai/Virchow2)** | Cross-Species Transfer (5×–40× mixed-mag rodent scale invariance) | Patch Encoder | 632M | CC-BY-NC-ND-4.0 *(Gated)* | [arXiv:2408.00738](https://arxiv.org/abs/2408.00738) |
| **[Phikon-v2](https://huggingface.co/owkin/phikon-v2)** | Cross-Species Transfer (Ungated DINOv2 ViT-L) | Patch Encoder | 307M | Owkin NC *(Ungated)* | [arXiv:2409.09173](https://arxiv.org/abs/2409.09173) |
| **[CONCH / CONCHv1.5](https://huggingface.co/mahmoodlab/CONCH)** | Cross-Species Zero-Shot Lesion Retrieval & Prompt Scoring | Zero-Shot VL | 400M | CC-BY-NC-ND-4.0 *(Gated)* | [Nature Medicine (2024)](https://doi.org/10.1038/s41591-024-02856-4) |
| **[TITAN](https://huggingface.co/mahmoodlab/TITAN)** | Whole-Slide Representation for GEMM & Organ Cassettes | Slide Encoder | 420M | CC-BY-NC-ND-4.0 *(Gated)* | [Nature Medicine (2025)](https://doi.org/10.1038/s41591-025-03982-3) |
| **[Prov-GigaPath](https://huggingface.co/prov-gigapath/prov-gigapath)** | LongNet Whole-Slide Encoder for Multi-Organ Mounts | Slide Encoder | 1.1B | GigaPath License *(Gated)* | [Nature (2024)](https://doi.org/10.1038/s41586-024-07441-w) |

### B. Landmark Literature / Proprietary Preclinical References (Included with Papers & BibTeX)
- **TOX-FM** (*Novartis*, >1M WSIs across 6 animal species & >60 organs) — [arXiv:2610.26586](https://arxiv.org/abs/2610.26586)
- **TRACE & ToxScribe** (*Harvard Mahmood Lab / Tremont AI*, rat preclinical safety) — [bioRxiv 2024.07.20.604430](https://doi.org/10.1101/2024.07.20.604430) · [Live UI Demo](https://mahmoodlab.github.io/tox-foundation-ui/)
- **SlideFiLM** (*Univ. of Ottawa*, PAS-stained rodent renal injury segmentation) — [npj Imaging (2026)](https://doi.org/10.1038/s44303-026-00201-7)

---

## Quick Start

### 1. Preview the Static Portal Locally
```bash
python -m http.server 5500 --directory docs
# Open http://127.0.0.1:5500 in your browser
```

### 2. Launch the Local FastAPI Backend
```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File docs/install/setup.ps1
```
```bash
# macOS / Linux
bash docs/install/setup.sh
```
When running locally, `http://127.0.0.1:8000/` also serves the full web portal directly at `/portal/index.html`.

### 3. Run Automated Mock Verification (No GPU or Multi-GB Weights Required)
```bash
PORTAL_MOCK=1 python -m unittest backend/tests/test_api_mock.py -v
```

See [`SETUP.md`](SETUP.md) for GitHub Pages deployment, `vLLM` acceleration, gated Hugging Face tokens, and Slurm HPC tunneling.

## Build
Created and curated by Prajwal Ghimire
Copyright @Prajwal Ghimire
Contact: prajwal.ghimire@crick.ac.uk
