#!/bin/bash
#SBATCH --job-name=animalpath-fm
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=08:00:00
#SBATCH --output=animalpath_fm_%j.log

set -euo pipefail

export PORTAL_KEY="${PORTAL_KEY:-$(python3 -c 'import secrets; print(secrets.token_hex(16))')}"
NODE_HOST="$(hostname)"

echo "============================================================"
echo "AnimalPath-FM Backend running on GPU node: ${NODE_HOST}:8000"
echo "Portal Secret Key (X-Portal-Key): ${PORTAL_KEY}"
echo "On your laptop, open an SSH tunnel:"
echo "  ssh -N -L 8000:${NODE_HOST}:8000 ${USER}@<cluster-login-host>"
echo "Then connect https://<your-user>.github.io/Animal_Pathology_FM_Portal/ to http://127.0.0.1:8000"
echo "============================================================"

python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
