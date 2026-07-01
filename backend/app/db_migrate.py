"""One-time import of the legacy JSON stores into the database.

Runs at startup: if the DB is empty and legacy `data/*.json` files exist, their
contents are imported, then each file is renamed to `*.json.bak`. Idempotent —
once data exists (or files are backed up) it does nothing.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.database import session_scope
from app.models.tables import (
    AxelConnection, AxelQuery, Client, Condition, Run, Schedule, SCHED_CONFIG_KEYS,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TS_FMT = "%Y-%m-%d %H:%M:%S"


def _read(name: str):
    p = DATA_DIR / name
    if not p.exists():
        return None, p
    try:
        return json.loads(p.read_text()), p
    except Exception:
        return None, p


def _parse_ts(s):
    try:
        return datetime.strptime(s, TS_FMT)
    except (TypeError, ValueError):
        return datetime.now()


def run_migration() -> None:
    migrated: list[Path] = []
    with session_scope() as db:
        # Already populated → nothing to do.
        if (db.query(Client).first() or db.query(Condition).first()
                or db.query(Schedule).first() or db.query(Run).first()):
            return

        data, p = _read("clients.json")
        if data:
            for c in data.get("clients", []):
                db.add(Client(id=c["id"], name=c.get("name", ""),
                              email_subject=c.get("email_subject", ""),
                              recipients=c.get("recipients", [])))
                for i, cond in enumerate(c.get("conditions", [])):
                    db.add(Condition(
                        id=cond.get("id"), client_id=c["id"], is_shared=False, position=i + 1,
                        name=cond.get("name", ""), validation_name=cond.get("validation_name", ""),
                        type=cond.get("type"), enabled=cond.get("enabled", True),
                        config=cond.get("config", {})))
            migrated.append(p)

        data, p = _read("shared_conditions.json")
        if data:
            for i, cond in enumerate(data.get("conditions", [])):
                db.add(Condition(
                    id=cond.get("id"), client_id=None, is_shared=True, position=i + 1,
                    name=cond.get("name", ""), validation_name=cond.get("validation_name", ""),
                    type=cond.get("type"), enabled=cond.get("enabled", True),
                    config=cond.get("config", {})))
            migrated.append(p)

        data, p = _read("schedules.json")
        if data:
            for s in data.get("schedules", []):
                config = {k: s.get(k) for k in SCHED_CONFIG_KEYS if k in s}
                db.add(Schedule(
                    id=s["id"], client_id=s.get("client_id"), name=s.get("name", ""),
                    hour=s.get("hour", 8), minute=s.get("minute", 0), days=s.get("days", []),
                    enabled=s.get("enabled", True),
                    last_run=_parse_ts(s["last_run"]) if s.get("last_run") else None,
                    last_status=s.get("last_status"), config=config))
            migrated.append(p)

        data, p = _read("runs.json")
        if data:
            for r in data.get("runs", []):
                db.add(Run(
                    id=r.get("id"), client_id=r.get("client_id") or None,
                    client_name=r.get("client_name", ""),
                    timestamp=_parse_ts(r["ts"]) if r.get("ts") else datetime.now(),
                    kind=r.get("kind"), status=r.get("status", "ok"),
                    total=r.get("total", 0), errors=r.get("errors", 0),
                    combined_result_id=r.get("combined_result_id"),
                    email_to=r.get("email_to", []), summary_metrics=r.get("summary", [])))
            migrated.append(p)

        data, p = _read("axel_queries.json")
        if data:
            for cid, queries in (data.get("queries", {}) or {}).items():
                for q in queries:
                    db.add(AxelQuery(id=q.get("id"), client_id=cid,
                                     data={k: v for k, v in q.items() if k != "id"}))
            migrated.append(p)

        data, p = _read("axel_connections.json")
        if data:
            for cid, conn in (data.get("connections", {}) or {}).items():
                db.add(AxelConnection(client_id=cid, data=conn))
            migrated.append(p)

    # After a successful commit, back up the imported files so we don't re-import.
    for p in migrated:
        try:
            p.rename(p.with_suffix(p.suffix + ".bak"))
        except OSError:
            pass
