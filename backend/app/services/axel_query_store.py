"""Per-client AXEL report queries, backed by the database.

The full query definition (name, SQL / API config, params, row_limit, …) is kept
in a JSON `data` column; `id` and `client_id` are columns for lookup.
"""
from __future__ import annotations

import uuid

from app.database import session_scope
from app.models.tables import AxelQuery


def _dict(row: AxelQuery) -> dict:
    d = dict(row.data or {})
    d["id"] = row.id
    return d


def get_all(client_id: str) -> list[dict]:
    with session_scope() as db:
        return [_dict(r) for r in db.query(AxelQuery).filter(AxelQuery.client_id == client_id).all()]


def get(client_id: str, query_id: str) -> dict | None:
    with session_scope() as db:
        r = db.query(AxelQuery).filter(
            AxelQuery.client_id == client_id, AxelQuery.id == query_id).first()
        return _dict(r) if r else None


def add(client_id: str, query: dict) -> dict:
    with session_scope() as db:
        r = AxelQuery(id=str(uuid.uuid4()), client_id=client_id,
                      data={k: v for k, v in query.items() if k != "id"})
        db.add(r)
        db.flush()
        return _dict(r)


def update(client_id: str, query_id: str, updates: dict) -> dict | None:
    with session_scope() as db:
        r = db.query(AxelQuery).filter(
            AxelQuery.client_id == client_id, AxelQuery.id == query_id).first()
        if not r:
            return None
        merged = dict(r.data or {})
        merged.update({k: v for k, v in updates.items() if k != "id"})
        r.data = merged
        db.flush()
        return _dict(r)


def delete(client_id: str, query_id: str) -> bool:
    with session_scope() as db:
        r = db.query(AxelQuery).filter(
            AxelQuery.client_id == client_id, AxelQuery.id == query_id).first()
        if not r:
            return False
        db.delete(r)
        return True
