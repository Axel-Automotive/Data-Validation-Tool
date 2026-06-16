"""JSON-file-backed log of validation runs (manual, emailed, scheduled)."""
from __future__ import annotations
import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "runs.json"

_lock = threading.RLock()
MAX_RUNS = 500   # keep the most recent N records


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"runs": []}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"runs": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)


def get_all() -> list[dict]:
    # Most recent first.
    return list(reversed(_load()["runs"]))


def record(
    *,
    client_id: str,
    client_name: str,
    kind: str,                       # "manual" | "email" | "scheduled"
    conditions: list[dict],          # the run_all condition_results
    combined_result_id: str | None,
    email_to: list[str] | None = None,
    status: str = "ok",
) -> dict:
    n_total = len(conditions)
    n_error = sum(1 for c in conditions if c.get("error"))
    summary = [
        {
            "name": c.get("condition_name"),
            "validation_name": c.get("validation_name", ""),
            "type": c.get("type"),
            "error": c.get("error"),
            "metrics": c.get("metrics"),
        }
        for c in conditions
    ]
    entry = {
        "id": str(uuid.uuid4()),
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "client_id": client_id,
        "client_name": client_name,
        "kind": kind,
        "total": n_total,
        "errors": n_error,
        "combined_result_id": combined_result_id,
        "email_to": email_to or [],
        "status": status,
        "summary": summary,
    }
    with _lock:
        data = _load()
        data["runs"].append(entry)
        if len(data["runs"]) > MAX_RUNS:
            data["runs"] = data["runs"][-MAX_RUNS:]
        _save(data)
    return entry
