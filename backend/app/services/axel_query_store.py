"""Per-client AXEL report queries ("one query = one report").

Queries carry no secrets (just SQL text / API paths), but are kept out of the
git-tracked clients.json to keep query CRUD independent and avoid bloating it.

Stored shape (data/axel_queries.json):
    { "queries": { "<client_id>": [ { "id": ..., "name": ..., ... } ] } }
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "axel_queries.json"

_lock = threading.RLock()


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"queries": {}}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"queries": {}}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)


def get_all(client_id: str) -> list[dict]:
    return _load()["queries"].get(client_id, [])


def get(client_id: str, query_id: str) -> dict | None:
    return next((q for q in get_all(client_id) if q["id"] == query_id), None)


def add(client_id: str, query: dict) -> dict:
    with _lock:
        data = _load()
        query = {**query, "id": str(uuid.uuid4())}
        data["queries"].setdefault(client_id, []).append(query)
        _save(data)
        return query


def update(client_id: str, query_id: str, updates: dict) -> dict | None:
    with _lock:
        data = _load()
        for q in data["queries"].get(client_id, []):
            if q["id"] == query_id:
                q.update({k: v for k, v in updates.items() if k != "id"})
                _save(data)
                return q
        return None


def delete(client_id: str, query_id: str) -> bool:
    with _lock:
        data = _load()
        items = data["queries"].get(client_id, [])
        new = [q for q in items if q["id"] != query_id]
        if len(new) < len(items):
            data["queries"][client_id] = new
            _save(data)
            return True
        return False
