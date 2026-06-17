#!/usr/bin/env bash
set -e

cd /home/site/wwwroot/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
