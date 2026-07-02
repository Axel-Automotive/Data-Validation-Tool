"""SQLAlchemy ORM models + dict serializers.

Serializers reproduce the exact dict shapes the routers, scheduler, compare, and
frontend already expect, so the storage swap is invisible above the store layer.
Flexible/unstructured blocks (condition config, schedule source config, query
definitions, run summaries) use native JSON columns so SQLite and SQL Server
both store them cleanly.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base

TS_FMT = "%Y-%m-%d %H:%M:%S"


def _uuid() -> str:
    return str(uuid.uuid4())


def _fmt(dt) -> str | None:
    return dt.strftime(TS_FMT) if dt else None


# ── Tables ────────────────────────────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"
    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    email_subject = Column(String, default="")
    recipients = Column(JSON, default=list)

    conditions = relationship(
        "Condition", back_populates="client",
        cascade="all, delete-orphan", order_by="Condition.position",
    )
    schedules = relationship("Schedule", back_populates="client", cascade="all, delete-orphan")
    # Runs are an audit log and must survive client deletion: on delete SQLAlchemy
    # nullifies Run.client_id (the row keeps its denormalized client_name). No
    # delete-orphan here, so history is preserved on both SQLite and Postgres.
    runs = relationship("Run", back_populates="client")
    # Breaks are per-client working state — removed with the client.
    breaks = relationship("Break", back_populates="client", cascade="all, delete-orphan")


class Condition(Base):
    __tablename__ = "conditions"
    id = Column(String, primary_key=True, default=_uuid)
    client_id = Column(String, ForeignKey("clients.id"), nullable=True)   # null → shared
    name = Column(String, nullable=False)
    validation_name = Column(String, default="")
    type = Column(String, nullable=False)   # sheet_diff | stacked | calc_diff | custom_rule
    enabled = Column(Boolean, default=True)
    config = Column(JSON, default=dict)
    is_shared = Column(Boolean, default=False)
    position = Column(Integer, default=0)   # ordering within a client / the shared set

    client = relationship("Client", back_populates="conditions")


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(String, primary_key=True, default=_uuid)
    client_id = Column(String, ForeignKey("clients.id"), nullable=False)
    name = Column(String, nullable=False)
    hour = Column(Integer, default=8)
    minute = Column(Integer, default=0)
    days = Column(JSON, default=list)
    enabled = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)
    # data-source config: file ids, sheets, query source ref, recipient overrides
    config = Column(JSON, default=dict)

    client = relationship("Client", back_populates="schedules")


class Run(Base):
    __tablename__ = "runs"
    id = Column(String, primary_key=True, default=_uuid)
    client_id = Column(String, ForeignKey("clients.id"), nullable=True)
    client_name = Column(String, default="")
    timestamp = Column(DateTime, default=datetime.now)
    kind = Column(String)                    # manual | email | scheduled
    status = Column(String, default="ok")
    total = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    combined_result_id = Column(String, nullable=True)
    email_to = Column(JSON, default=list)
    summary_metrics = Column(JSON, default=list)   # per-condition summary list

    client = relationship("Client", back_populates="runs")


class AxelQuery(Base):
    __tablename__ = "axel_queries"
    id = Column(String, primary_key=True, default=_uuid)
    client_id = Column(String, ForeignKey("clients.id"), nullable=False)
    data = Column(JSON, default=dict)   # full query definition (name, sql/api_*, params, …)


class AxelConnection(Base):
    __tablename__ = "axel_connections"
    client_id = Column(String, ForeignKey("clients.id"), primary_key=True)
    data = Column(JSON, default=dict)   # connection dict incl. *_enc encrypted secrets


class Break(Base):
    """A single reconciliation exception (unmatched key / failed check), tracked
    across runs by a stable `signature` so recurring items carry forward."""
    __tablename__ = "breaks"
    id = Column(String, primary_key=True, default=_uuid)
    client_id = Column(String, ForeignKey("clients.id"), nullable=True)
    signature = Column(String, nullable=False, index=True)   # stable identity across runs
    condition_name = Column(String, default="")
    validation_name = Column(String, default="")
    type = Column(String, default="")                        # comparison type
    break_type = Column(String, default="")                  # unmatched_axel|unmatched_dms|failed
    key_label = Column(String, default="")                   # the offending key/group value
    detail = Column(JSON, default=dict)                      # small display summary
    status = Column(String, default="open")                  # open | acknowledged | resolved
    comment = Column(String, default="")
    assignee = Column(String, default="")
    first_seen = Column(DateTime, default=datetime.now)
    last_seen = Column(DateTime, default=datetime.now)
    cleared = Column(Boolean, default=False)                 # absent from the latest run
    cleared_at = Column(DateTime, nullable=True)
    first_run_id = Column(String, nullable=True)             # run that first surfaced it
    last_run_id = Column(String, nullable=True)

    client = relationship("Client", back_populates="breaks")


# ── Serializers (ORM → the dict shapes the app already uses) ───────────────────

def condition_dict(c: Condition, shared: bool = False) -> dict:
    d = {
        "id": c.id, "name": c.name, "validation_name": c.validation_name or "",
        "type": c.type, "enabled": bool(c.enabled), "config": c.config or {},
    }
    if shared or c.is_shared:
        d["shared"] = True
    return d


def client_dict(c: Client) -> dict:
    return {
        "id": c.id, "name": c.name, "email_subject": c.email_subject or "",
        "recipients": c.recipients or [],
        "conditions": [condition_dict(x) for x in c.conditions],
    }


SCHED_CONFIG_KEYS = ("file_axel_id", "sheet_axel", "file_dms_id", "sheet_dms",
                     "axel_source", "recipients")


def schedule_dict(s: Schedule) -> dict:
    cfg = s.config or {}
    return {
        "id": s.id, "name": s.name, "client_id": s.client_id,
        "hour": s.hour, "minute": s.minute, "days": s.days or [],
        "enabled": bool(s.enabled), "last_run": _fmt(s.last_run), "last_status": s.last_status,
        "file_axel_id": cfg.get("file_axel_id", ""), "sheet_axel": cfg.get("sheet_axel", ""),
        "file_dms_id": cfg.get("file_dms_id", ""), "sheet_dms": cfg.get("sheet_dms", ""),
        "axel_source": cfg.get("axel_source"), "recipients": cfg.get("recipients", []),
    }


def run_dict(r: Run) -> dict:
    return {
        "id": r.id, "ts": _fmt(r.timestamp), "client_id": r.client_id,
        "client_name": r.client_name or "", "kind": r.kind,
        "total": r.total or 0, "errors": r.errors or 0,
        "combined_result_id": r.combined_result_id, "email_to": r.email_to or [],
        "status": r.status, "summary": r.summary_metrics or [],
    }


def break_dict(b: Break) -> dict:
    age_days = None
    if b.first_seen:
        age_days = (datetime.now() - b.first_seen).days
    return {
        "id": b.id, "client_id": b.client_id,
        "condition_name": b.condition_name or "", "validation_name": b.validation_name or "",
        "type": b.type, "break_type": b.break_type, "key_label": b.key_label or "",
        "detail": b.detail or {}, "status": b.status, "comment": b.comment or "",
        "assignee": b.assignee or "", "first_seen": _fmt(b.first_seen), "last_seen": _fmt(b.last_seen),
        "cleared": bool(b.cleared), "cleared_at": _fmt(b.cleared_at), "age_days": age_days,
    }
