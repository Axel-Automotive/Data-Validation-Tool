"""Shared validation conditions that apply to ALL clients."""
from __future__ import annotations
import json
import os
import threading
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "shared_conditions.json"

_lock = threading.RLock()


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"conditions": []}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"conditions": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)


def get_all() -> list[dict]:
    return _load()["conditions"]


def get(condition_id: str) -> dict | None:
    return next((c for c in get_all() if c["id"] == condition_id), None)


def add(condition: dict) -> dict:
    with _lock:
        condition = {**condition, "id": str(uuid.uuid4()), "shared": True}
        data = _load()
        data["conditions"].append(condition)
        _save(data)
        return condition


def update(condition_id: str, updates: dict) -> dict | None:
    with _lock:
        data = _load()
        for c in data["conditions"]:
            if c["id"] == condition_id:
                c.update({k: v for k, v in updates.items() if k != "id"})
                c["shared"] = True
                _save(data)
                return c
        return None


def delete(condition_id: str) -> bool:
    with _lock:
        data = _load()
        before = len(data["conditions"])
        data["conditions"] = [c for c in data["conditions"] if c["id"] != condition_id]
        if len(data["conditions"]) < before:
            _save(data)
            return True
        return False
