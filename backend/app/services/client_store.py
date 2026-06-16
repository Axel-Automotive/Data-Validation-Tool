"""JSON-file-backed store for clients and their conditions."""
from __future__ import annotations
import json
import os
import threading
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "clients.json"

# Sync endpoints run in a threadpool, so concurrent read-modify-write cycles can
# interleave and silently drop one another's changes. Serialise all mutations.
_lock = threading.RLock()


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"clients": []}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"clients": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Write to a temp file then atomically replace, so a crash mid-write can't
    # leave clients.json truncated/corrupt.
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)


# ── Clients ───────────────────────────────────────────────────────────────────

def get_all_clients() -> list[dict]:
    return _load()["clients"]


def get_client(client_id: str) -> dict | None:
    return next((c for c in get_all_clients() if c["id"] == client_id), None)


def create_client(name: str) -> dict:
    with _lock:
        client = {"id": str(uuid.uuid4()), "name": name, "conditions": [], "recipients": []}
        data = _load()
        data["clients"].append(client)
        _save(data)
        return client


def update_recipients(client_id: str, recipients: list[str]) -> dict | None:
    with _lock:
        data = _load()
        for c in data["clients"]:
            if c["id"] == client_id:
                c["recipients"] = recipients
                _save(data)
                return c
        return None


def update_client(client_id: str, name: str) -> dict | None:
    with _lock:
        data = _load()
        for c in data["clients"]:
            if c["id"] == client_id:
                c["name"] = name
                _save(data)
                return c
        return None


def delete_client(client_id: str) -> bool:
    with _lock:
        data = _load()
        before = len(data["clients"])
        data["clients"] = [c for c in data["clients"] if c["id"] != client_id]
        if len(data["clients"]) < before:
            _save(data)
            return True
        return False


# ── Conditions ────────────────────────────────────────────────────────────────

def add_condition(client_id: str, condition: dict) -> dict | None:
    with _lock:
        data = _load()
        for c in data["clients"]:
            if c["id"] == client_id:
                condition = {**condition, "id": str(uuid.uuid4())}
                c["conditions"].append(condition)
                _save(data)
                return condition
        return None


def update_condition(client_id: str, condition_id: str, updates: dict) -> dict | None:
    with _lock:
        data = _load()
        for c in data["clients"]:
            if c["id"] == client_id:
                for cond in c["conditions"]:
                    if cond["id"] == condition_id:
                        cond.update({k: v for k, v in updates.items() if k != "id"})
                        _save(data)
                        return cond
        return None


def delete_condition(client_id: str, condition_id: str) -> bool:
    with _lock:
        data = _load()
        for c in data["clients"]:
            if c["id"] == client_id:
                before = len(c["conditions"])
                c["conditions"] = [cd for cd in c["conditions"] if cd["id"] != condition_id]
                if len(c["conditions"]) < before:
                    _save(data)
                    return True
        return False


def reorder_conditions(client_id: str, ordered_ids: list[str]) -> list[dict] | None:
    data = _load()
    for c in data["clients"]:
        if c["id"] == client_id:
            lookup = {cd["id"]: cd for cd in c["conditions"]}
            c["conditions"] = [lookup[oid] for oid in ordered_ids if oid in lookup]
            _save(data)
            return c["conditions"]
    return None
