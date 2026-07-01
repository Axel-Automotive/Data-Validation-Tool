"""Shared validation conditions (apply to ALL clients), backed by the database.

Stored as Condition rows with is_shared=True and client_id=NULL.
"""
from __future__ import annotations

from sqlalchemy import func

from app.database import session_scope
from app.models.tables import Condition, condition_dict


def get_all() -> list[dict]:
    with session_scope() as db:
        rows = (db.query(Condition)
                  .filter(Condition.is_shared.is_(True))
                  .order_by(Condition.position).all())
        return [condition_dict(c, shared=True) for c in rows]


def get(condition_id: str) -> dict | None:
    with session_scope() as db:
        c = db.query(Condition).filter(
            Condition.id == condition_id, Condition.is_shared.is_(True)).first()
        return condition_dict(c, shared=True) if c else None


def add(condition: dict) -> dict:
    with session_scope() as db:
        pos = (db.query(func.max(Condition.position))
                 .filter(Condition.is_shared.is_(True)).scalar() or 0) + 1
        c = Condition(
            client_id=None, is_shared=True, position=pos,
            name=condition.get("name"), validation_name=condition.get("validation_name", ""),
            type=condition.get("type"), enabled=condition.get("enabled", True),
            config=condition.get("config", {}),
        )
        db.add(c)
        db.flush()
        return condition_dict(c, shared=True)


def update(condition_id: str, updates: dict) -> dict | None:
    with session_scope() as db:
        c = db.query(Condition).filter(
            Condition.id == condition_id, Condition.is_shared.is_(True)).first()
        if not c:
            return None
        for k in ("name", "validation_name", "type", "enabled", "config"):
            if k in updates:
                setattr(c, k, updates[k])
        db.flush()
        return condition_dict(c, shared=True)


def delete(condition_id: str) -> bool:
    with session_scope() as db:
        c = db.query(Condition).filter(
            Condition.id == condition_id, Condition.is_shared.is_(True)).first()
        if not c:
            return False
        db.delete(c)
        return True
