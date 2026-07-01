"""Database connection layer — SQLite by default, env-switchable to production.

Set DATABASE_URL to override the default local SQLite file, e.g.
    DATABASE_URL=postgresql+psycopg2://user:pass@host/db
    DATABASE_URL=mssql+pymssql://user:pass@host:1433/db
Unset → a local SQLite file at backend/data/axel_validator.db ($0 deployment).
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"   # backend/data
_DEFAULT_SQLITE = f"sqlite:///{_DATA_DIR / 'axel_validator.db'}"

DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_SQLITE)

if DATABASE_URL.startswith("sqlite"):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI serves sync endpoints across threadpool
    # threads, and the scheduler runs in its own thread; each uses its own session.
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    """Session for non-request code (stores, scheduler, migration). Commits on
    success, rolls back on error, always closes."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imports the ORM models so they register on Base."""
    from app.models import tables  # noqa: F401  (registers mappers)
    Base.metadata.create_all(bind=engine)
