#!/usr/bin/env bash
set -e

cd /home/site/wwwroot/backend

# Oryx installs dependencies into a virtualenv at /home/site/wwwroot/antenv
# during deployment. A custom startup command does NOT auto-activate it, so
# activate it here — otherwise `python` is the system interpreter and
# uvicorn/fastapi aren't found (ModuleNotFoundError -> container never starts).
if [ -d /home/site/wwwroot/antenv ]; then
  source /home/site/wwwroot/antenv/bin/activate
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
