#!/usr/bin/env bash
# Launch the Data Validation Tool — backend (FastAPI) + frontend (Vite).
# Usage:  ./start.sh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv/bin"

echo "▶ Starting backend on http://localhost:8000 ..."
( cd "$ROOT/backend" && "$VENV/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 ) &
BACKEND_PID=$!

echo "▶ Starting frontend on http://localhost:5173 ..."
( cd "$ROOT/frontend" && npm run dev ) &
FRONTEND_PID=$!

# Stop both when this script is interrupted (Ctrl+C)
trap "echo; echo '■ Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" INT TERM

echo ""
echo "  Backend  → http://localhost:8000  (API docs: /docs)"
echo "  Frontend → http://localhost:5173"
echo "  Press Ctrl+C to stop both."
echo ""

wait
