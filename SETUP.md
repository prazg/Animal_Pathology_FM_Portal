# Setup & Local Deployment Guide (`AnimalPath-FM`)

`AnimalPath-FM` separates the **zero-build GitHub Pages frontend (`docs/`)** from the **local FastAPI model runner (`backend/`)** so rodent/preclinical whole-slide images never leave your workstation or cluster.

---

## 1. Publishing the Frontend on GitHub Pages

You have two zero-build options after pushing this folder to a GitHub repository:

### Option A — Deploy from Branch (`/docs` folder)
1. Go to **Repository Settings → Pages**.
2. Under **Build and deployment → Source**, select **Deploy from a branch**.
3. Choose branch **`main`** and folder **`/docs`**, then click **Save**.

### Option B — GitHub Actions Workflow (Included)
1. Go to **Repository Settings → Pages**.
2. Under **Source**, choose **GitHub Actions**.
3. `.github/workflows/pages.yml` automatically deploys `./docs` on every push to `main`.

> **Important:** Add your GitHub Pages origin (e.g. `https://<your-username>.github.io`) to `allowed_origins` in `backend/config.yaml` if it differs from the default.

---

## 2. Running the Local Backend (`127.0.0.1:8000`)

### Guided One-Liner (Uses Astral `uv` or standard `venv`)

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File docs/install/setup.ps1
```

**macOS / Linux:**
```bash
bash docs/install/setup.sh
```

### Installing the Full Deep Learning Stack (CUDA / Apple MPS)
Once the server environment `.venv` is created, install PyTorch and pathology encoders:
```bash
# Activate virtual environment
# Windows: .\.venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate

pip install -r backend/requirements.txt

# Optional: Install MahmoodLab TRIDENT for automated WSI tissue masking & tiling
pip install git+https://github.com/mahmoodlab/TRIDENT.git

# Check GPU, RAM, and cached Hugging Face weights
python -m backend.check_setup
```

---

## 3. High-Throughput `TissueDecision-9B` Serving via vLLM (Optional)

`TissueDecision-9B` (`lighteternal/tissuedecision-9b`) runs either directly inside `backend/server.py` via Hugging Face `transformers`, or 10× faster (~0.1s/ROI) via an OpenAI-compatible `vLLM` server on Linux / WSL2:

```bash
vllm serve lighteternal/tissuedecision-9b --port 8001 --dtype bfloat16
```
`backend/config.yaml` automatically routes `tox_vqa` requests to `http://127.0.0.1:8001/v1` when reachable.

---

## 4. Gated Hugging Face Models (`UNI2-h`, `Virchow2`, `H-optimus-1`, `CONCH`, `TITAN`)

Ungated models (`lighteternal/tissuedecision-9b`, `histai/hibou-L`, `histai/hibou-b`, `owkin/phikon-v2`, `WangGuangyuLab/Loki`) download immediately without approval.

For gated academic models:
1. Click the Hugging Face repository link inside the portal's **Slide Inspector Drawer** and accept the license terms.
2. Run `hf auth login` in your terminal (or paste a read-only `hf_...` token in the portal's **Connect** tab).

---

## 5. Slurm / HPC GPU Node Execution

Submit the batch job on your institution's cluster:
```bash
sbatch backend/hpc/serve_slurm.sbatch
```
Check `animalpath_fm_<jobid>.log` for the compute node hostname and generated `PORTAL_KEY`, then open an SSH tunnel on your laptop:
```bash
ssh -N -L 8000:<gpu-node>:8000 <user>@<cluster-login>
```
Open your GitHub Pages URL, go to **Connect**, enter `http://127.0.0.1:8000` and your `X-Portal-Key`, and run analyses directly against cluster GPUs.
