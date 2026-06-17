#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR=/home/LogFiles

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/startup.log") 2>&1

echo "---- Azure startup $(date -u +"%Y-%m-%dT%H:%M:%SZ") ----"
echo "PORT=${PORT:-}"
echo "WEBSITES_PORT=${WEBSITES_PORT:-}"

# Prefer dependencies bundled by GitHub Actions. Fall back to the legacy hidden
# folder and then to the Oryx virtualenv if Azure created one during deployment.
export PYTHONPATH="$ROOT/python_packages/lib/site-packages:$ROOT/.python_packages/lib/site-packages:$ROOT/backend:${PYTHONPATH:-}"
echo "PYTHONPATH=$PYTHONPATH"

if [ -f "$ROOT/antenv/bin/activate" ]; then
  echo "Activating Oryx virtualenv at $ROOT/antenv"
  . "$ROOT/antenv/bin/activate"
fi

cd "$ROOT/backend"
echo "Working directory: $(pwd)"

python - <<'PY'
import sys

import fastapi
import uvicorn

print(f"Startup Python: {sys.executable}", flush=True)
print(f"FastAPI: {fastapi.__version__}", flush=True)
print(f"Uvicorn: {uvicorn.__version__}", flush=True)
PY

echo "Starting uvicorn"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
