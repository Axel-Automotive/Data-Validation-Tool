"""Per-client AXEL data-source connection config, backed by the database.

Secrets (password / api_token) are stored ENCRYPTED (via crypto_util) inside the
JSON `data` column — never in clear. get() decrypts for internal use; get_public()
masks for API responses.
"""
from __future__ import annotations

from app.database import session_scope
from app.models.tables import AxelConnection
from app.services import crypto_util

# Clear field -> encrypted column name, handled transparently on save/load.
_SECRETS = {"password": "password_enc", "api_token": "api_token_enc"}


def _public_from(stored: dict) -> dict:
    pub = {k: v for k, v in stored.items() if not k.endswith("_enc")}
    pub["has_password"] = bool(stored.get("password_enc"))
    pub["has_api_token"] = bool(stored.get("api_token_enc"))
    return pub


def get(client_id: str) -> dict | None:
    """Internal use: returns config with secrets DECRYPTED into clear fields."""
    with session_scope() as db:
        row = db.get(AxelConnection, client_id)
        if not row:
            return None
        raw = row.data or {}
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
    with session_scope() as db:
        row = db.get(AxelConnection, client_id)
        return _public_from(row.data or {}) if row else None


def upsert(client_id: str, cfg: dict) -> dict:
    """Create/update a client's connection. A blank/absent secret keeps the
    previously stored one (so the UI never has to re-send the password)."""
    with session_scope() as db:
        row = db.get(AxelConnection, client_id)
        existing = (row.data or {}) if row else {}
        stored = {k: v for k, v in cfg.items() if k not in _SECRETS and v is not None}
        for clear, enc in _SECRETS.items():
            if cfg.get(clear):
                stored[enc] = crypto_util.encrypt(cfg[clear])
            elif existing.get(enc):
                stored[enc] = existing[enc]
        if row:
            row.data = stored
        else:
            db.add(AxelConnection(client_id=client_id, data=stored))
        db.flush()
        return _public_from(stored)


def delete(client_id: str) -> bool:
    with session_scope() as db:
        row = db.get(AxelConnection, client_id)
        if not row:
            return False
        db.delete(row)
        return True
