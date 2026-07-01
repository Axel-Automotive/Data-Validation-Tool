"""Scheduled runs, backed by the database.

Scalar scheduling fields are columns; data-source fields (file ids, sheets, the
query source ref, recipient overrides) live in a JSON `config` column. The store
reassembles the flat schedule dict the app/frontend expect on the way out.
"""
from __future__ import annotations

from datetime import datetime

from app.database import session_scope
from app.models.tables import SCHED_CONFIG_KEYS, Schedule, schedule_dict

TS_FMT = "%Y-%m-%d %H:%M:%S"
_COL_KEYS = ("name", "client_id", "hour", "minute", "days", "enabled")


def _split(data: dict) -> tuple[dict, dict]:
    cols = {k: data[k] for k in _COL_KEYS if k in data}
    config = {k: data[k] for k in SCHED_CONFIG_KEYS if k in data}
    return cols, config


def get_all() -> list[dict]:
    with session_scope() as db:
        return [schedule_dict(s) for s in db.query(Schedule).all()]


def get(schedule_id: str) -> dict | None:
    with session_scope() as db:
        s = db.get(Schedule, schedule_id)
        return schedule_dict(s) if s else None


def create(schedule: dict) -> dict:
    cols, config = _split(schedule)
    with session_scope() as db:
        s = Schedule(**cols, config=config, last_run=None, last_status=None)
        db.add(s)
        db.flush()
        return schedule_dict(s)


def update(schedule_id: str, updates: dict) -> dict | None:
    cols, config = _split(updates)
    with session_scope() as db:
        s = db.get(Schedule, schedule_id)
        if not s:
            return None
        for k, v in cols.items():
            setattr(s, k, v)
        merged = dict(s.config or {})
        merged.update(config)
        s.config = merged
        db.flush()
        return schedule_dict(s)


def delete(schedule_id: str) -> bool:
    with session_scope() as db:
        s = db.get(Schedule, schedule_id)
        if not s:
            return False
        db.delete(s)
        return True


def mark_run(schedule_id: str, status: str, when: str) -> None:
    with session_scope() as db:
        s = db.get(Schedule, schedule_id)
        if not s:
            return
        try:
            s.last_run = datetime.strptime(when, TS_FMT)
        except (TypeError, ValueError):
            s.last_run = datetime.now()
        s.last_status = status
