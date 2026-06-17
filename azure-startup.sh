#!/usr/bin/env bash
set -e

ROOT=/home/site/wwwroot

# Prefer dependencies bundled by GitHub Actions. Fall back to the legacy hidden
# folder and then to the Oryx virtualenv if Azure created one during deployment.
export PYTHONPATH="$ROOT/python_packages/lib/site-packages:$ROOT/.python_packages/lib/site-packages:$ROOT/backend:${PYTHONPATH:-}"

if [ -f "$ROOT/antenv/bin/activate" ]; then
  . "$ROOT/antenv/bin/activate"
fi

cd "$ROOT/backend"

python - <<'PY'
import sys

import fastapi
import uvicorn

print(f"Startup Python: {sys.executable}", flush=True)
print(f"FastAPI: {fastapi.__version__}", flush=True)
print(f"Uvicorn: {uvicorn.__version__}", flush=True)
PY

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
