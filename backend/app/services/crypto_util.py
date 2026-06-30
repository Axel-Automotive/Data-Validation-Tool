"""Symmetric encryption for secrets at rest (per-client DB credentials).

The key comes from the AXEL_SECRET_KEY env var when set (preferred for
production / Azure App Service). If absent, a key is generated once and stored
in a git-ignored file under data/ so local development works out of the box.

`cryptography` is imported lazily so the rest of the app keeps running for
file-only users who never configured a DB source.
"""
from __future__ import annotations

import os
from pathlib import Path

_KEY_FILE = Path(__file__).parent.parent.parent / "data" / ".secret_key"
_fernet = None  # cached Fernet instance


def _load_key() -> bytes:
    env = os.getenv("AXEL_SECRET_KEY")
    if env:
        return env.encode()

    if _KEY_FILE.exists():
        return _KEY_FILE.read_bytes()

    # No key configured anywhere — generate and persist one (dev convenience).
    from cryptography.fernet import Fernet
    key = Fernet.generate_key()
    _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _KEY_FILE.write_bytes(key)
    try:
        _KEY_FILE.chmod(0o600)
    except OSError:
        pass
    return key


def _get_fernet():
    global _fernet
    if _fernet is None:
        from cryptography.fernet import Fernet
        _fernet = Fernet(_load_key())
    return _fernet


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    return _get_fernet().decrypt(token.encode()).decode()
