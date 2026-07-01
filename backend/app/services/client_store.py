"""Clients + their conditions, backed by the database (see app.database)."""
from __future__ import annotations

from sqlalchemy import func

from app.database import session_scope
from app.models.tables import Client, Condition, client_dict, condition_dict


# ── Clients ───────────────────────────────────────────────────────────────────

def get_all_clients() -> list[dict]:
    with session_scope() as db:
        return [client_dict(c) for c in db.query(Client).all()]


def get_client(client_id: str) -> dict | None:
    with session_scope() as db:
        c = db.get(Client, client_id)
        return client_dict(c) if c else None


def create_client(name: str) -> dict:
    with session_scope() as db:
        c = Client(name=name, recipients=[], email_subject="")
        db.add(c)
        db.flush()
        return client_dict(c)


def update_email_settings(client_id: str, recipients: list[str], subject: str) -> dict | None:
    with session_scope() as db:
        c = db.get(Client, client_id)
        if not c:
            return None
        c.recipients = recipients
        c.email_subject = subject
        db.flush()
        return client_dict(c)


def update_client(client_id: str, name: str) -> dict | None:
    with session_scope() as db:
        c = db.get(Client, client_id)
        if not c:
            return None
        c.name = name
        db.flush()
        return client_dict(c)


def delete_client(client_id: str) -> bool:
    with session_scope() as db:
        c = db.get(Client, client_id)
        if not c:
            return False
        db.delete(c)
        return True


# ── Conditions ────────────────────────────────────────────────────────────────

def _next_position(db, client_id: str) -> int:
    m = db.query(func.max(Condition.position)).filter(Condition.client_id == client_id).scalar()
    return (m or 0) + 1


def add_condition(client_id: str, condition: dict) -> dict | None:
    with session_scope() as db:
        if not db.get(Client, client_id):
            return None
        cond = Condition(
            client_id=client_id, is_shared=False, position=_next_position(db, client_id),
            name=condition.get("name"), validation_name=condition.get("validation_name", ""),
            type=condition.get("type"), enabled=condition.get("enabled", True),
            config=condition.get("config", {}),
        )
        db.add(cond)
        db.flush()
        return condition_dict(cond)


def update_condition(client_id: str, condition_id: str, updates: dict) -> dict | None:
    with session_scope() as db:
        cond = db.query(Condition).filter(
            Condition.id == condition_id, Condition.client_id == client_id).first()
        if not cond:
            return None
        for k in ("name", "validation_name", "type", "enabled", "config"):
            if k in updates:
                setattr(cond, k, updates[k])
        db.flush()
        return condition_dict(cond)


def delete_condition(client_id: str, condition_id: str) -> bool:
    with session_scope() as db:
        cond = db.query(Condition).filter(
            Condition.id == condition_id, Condition.client_id == client_id).first()
        if not cond:
            return False
        db.delete(cond)
        return True


def reorder_conditions(client_id: str, ordered_ids: list[str]) -> list[dict] | None:
    with session_scope() as db:
        conds = {c.id: c for c in db.query(Condition).filter(Condition.client_id == client_id).all()}
        if not conds:
            return None
        pos = 1
        for oid in ordered_ids:
            if oid in conds:
                conds[oid].position = pos
                pos += 1
        db.flush()
        return [condition_dict(conds[oid]) for oid in ordered_ids if oid in conds]
