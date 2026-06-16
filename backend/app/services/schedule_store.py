"""JSON-file-backed store for scheduled runs."""
from __future__ import annotations
import json
import os
import threading
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "schedules.json"

_lock = threading.RLock()


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"schedules": []}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"schedules": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)


def get_all() -> list[dict]:
    return _load()["schedules"]


def get(schedule_id: str) -> dict | None:
    return next((s for s in get_all() if s["id"] == schedule_id), None)


def create(schedule: dict) -> dict:
    with _lock:
        schedule = {**schedule, "id": str(uuid.uuid4()), "last_run": None, "last_status": None}
        data = _load()
        data["schedules"].append(schedule)
        _save(data)
        return schedule


def update(schedule_id: str, updates: dict) -> dict | None:
    with _lock:
        data = _load()
        for s in data["schedules"]:
            if s["id"] == schedule_id:
                s.update({k: v for k, v in updates.items() if k != "id"})
                _save(data)
                return s
        return None


def delete(schedule_id: str) -> bool:
    with _lock:
        data = _load()
        before = len(data["schedules"])
        data["schedules"] = [s for s in data["schedules"] if s["id"] != schedule_id]
        if len(data["schedules"]) < before:
            _save(data)
            return True
        return False


def mark_run(schedule_id: str, status: str, when: str) -> None:
    with _lock:
        data = _load()
        for s in data["schedules"]:
            if s["id"] == schedule_id:
                s["last_run"] = when
                s["last_status"] = status
                _save(data)
                return
