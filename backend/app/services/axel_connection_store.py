"""Per-client AXEL data-source connection config, with secrets encrypted at rest.

Each client can point at its own database (or API). Credentials must NOT live in
clients.json (which is tracked in git), so they are kept here in a git-ignored
file with the password / token encrypted via crypto_util.

Stored shape (data/axel_connections.json):
    { "connections": { "<client_id>": {
        "kind": "db" | "api",
        # db:
        "host": "...", "port": 1433, "database": "...", "username": "...",
        "password_enc": "<fernet token>",
        # api:
        "api_base": "https://...", "api_token_enc": "<fernet token>",
    } } }
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from app.services import crypto_util

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_FILE = DATA_DIR / "axel_connections.json"

_lock = threading.RLock()

# Secret fields (clear -> encrypted column name) handled transparently on save/load.
_SECRETS = {"password": "password_enc", "api_token": "api_token_enc"}


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"connections": {}}
    try:
        return json.loads(DATA_FILE.read_text())
    except Exception:
        return {"connections": {}}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, DATA_FILE)
    try:
        DATA_FILE.chmod(0o600)
    except OSError:
        pass


def get(client_id: str) -> dict | None:
    """Internal use: returns config with secrets DECRYPTED into clear fields."""
    raw = _load()["connections"].get(client_id)
    if not raw:
        return None
    cfg = {k: v for k, v in raw.items() if not k.endswith("_enc")}
    for clear, enc in _SECRETS.items():
        if raw.get(enc):
            try:
                cfg[clear] = crypto_util.decrypt(raw[enc])
            except Exception:
                cfg[clear] = ""
    return cfg


def get_public(client_id: str) -> dict | None:
    """API-safe view: no secret values, just whether each secret is set."""
    raw = _load()["connections"].get(client_id)
    if not raw:
        return None
    pub = {k: v for k, v in raw.items() if not k.endswith("_enc")}
    pub["has_password"] = bool(raw.get("password_enc"))
    pub["has_api_token"] = bool(raw.get("api_token_enc"))
    return pub


def upsert(client_id: str, cfg: dict) -> dict:
    """Create/update a client's connection. A blank/absent secret keeps the
    previously stored one (so the UI never has to re-send the password)."""
    with _lock:
        data = _load()
        existing = data["connections"].get(client_id, {})
        stored = {k: v for k, v in cfg.items() if k not in _SECRETS and v is not None}

        # Preserve existing encrypted secrets, replace only when a new value is given.
        for clear, enc in _SECRETS.items():
            if cfg.get(clear):
                stored[enc] = crypto_util.encrypt(cfg[clear])
            elif existing.get(enc):
                stored[enc] = existing[enc]

        data["connections"][client_id] = stored
        _save(data)
        return get_public(client_id)


def delete(client_id: str) -> bool:
    with _lock:
        data = _load()
        if client_id in data["connections"]:
            del data["connections"][client_id]
            _save(data)
            return True
        return False
