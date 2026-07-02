"""Reconciliation breaks (exceptions) — persisted and tracked across runs.

A break is one unmatched key or failed check from a comparison. Each is
identified by a stable `signature` so the same break recurring in a later run
carries forward (ageing, comments, status) instead of being recreated. Breaks
absent from a run whose condition still ran are marked cleared.
"""
from __future__ import annotations

import hashlib
from datetime import datetime

from app.database import session_scope
from app.models.tables import Break, break_dict

_UPDATABLE = {"status", "comment", "assignee"}
_VALID_STATUS = {"open", "acknowledged", "resolved"}


def _signature(client_id: str, b: dict) -> str:
    raw = "|".join([
        client_id or "", b.get("condition_name", ""), b.get("validation_name", ""),
        b.get("type", ""), b.get("break_type", ""), b.get("key_label", ""),
    ])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def sync(client_id: str, run_id: str | None, breaks: list[dict],
         ran_conditions: list[tuple]) -> dict:
    """Reconcile this run's breaks against stored ones.

    `breaks`: dicts with condition_name, validation_name, type, break_type,
    key_label, detail. `ran_conditions`: (name, validation_name, type) tuples for
    EVERY condition that executed (even those that produced no breaks), so their
    now-absent breaks can be cleared. Returns {new, cleared, open, resolved}.
    """
    now = datetime.now()
    ran = {tuple(c) for c in ran_conditions}
    incoming = {}
    for b in breaks:
        incoming[_signature(client_id, b)] = b

    new_count = cleared_count = 0
    with session_scope() as db:
        existing = {b.signature: b for b in
                    db.query(Break).filter(Break.client_id == client_id).all()}

        for sig, b in incoming.items():
            row = existing.get(sig)
            if row:
                row.last_seen = now
                row.last_run_id = run_id
                row.cleared = False
                row.cleared_at = None
                row.detail = b.get("detail", {})
                row.key_label = b.get("key_label", "")
                if row.status == "resolved":     # it came back after being resolved
                    row.status = "open"
            else:
                db.add(Break(
                    client_id=client_id, signature=sig,
                    condition_name=b.get("condition_name", ""),
                    validation_name=b.get("validation_name", ""),
                    type=b.get("type", ""), break_type=b.get("break_type", ""),
                    key_label=b.get("key_label", ""), detail=b.get("detail", {}),
                    status="open", first_seen=now, last_seen=now,
                    first_run_id=run_id, last_run_id=run_id,
                ))
                new_count += 1

        # Clear breaks whose condition ran but which no longer appear.
        for sig, row in existing.items():
            if sig in incoming or row.cleared or row.status == "resolved":
                continue
            if (row.condition_name, row.validation_name, row.type) in ran:
                row.cleared = True
                row.cleared_at = now
                row.last_run_id = run_id
                cleared_count += 1

        db.flush()
        open_count = (db.query(Break)
                        .filter(Break.client_id == client_id, Break.cleared == False,  # noqa: E712
                                Break.status != "resolved").count())
    return {"new": new_count, "cleared": cleared_count, "open": open_count}


def sync_from_results(client_id: str, run_id: str | None, condition_results: list[dict]) -> dict:
    """Extract breaks from run_all_conditions() results and sync them. Skips
    errored conditions (they produced no breaks and shouldn't clear existing)."""
    breaks: list[dict] = []
    ran: list[tuple] = []
    for c in condition_results:
        if c.get("error"):
            continue
        ident = (c.get("condition_name", ""), c.get("validation_name", ""), c.get("type", ""))
        ran.append(ident)
        for b in c.get("_breaks", []):
            breaks.append({**b, "condition_name": ident[0],
                           "validation_name": ident[1], "type": ident[2]})
    return sync(client_id, run_id, breaks, ran)


def get_all(client_id: str | None = None, status: str | None = None,
            include_cleared: bool = False) -> list[dict]:
    with session_scope() as db:
        q = db.query(Break)
        if client_id:
            q = q.filter(Break.client_id == client_id)
        if not include_cleared:
            q = q.filter(Break.cleared == False)  # noqa: E712
        if status:
            q = q.filter(Break.status == status)
        else:
            q = q.filter(Break.status != "resolved")   # default: actionable only
        q = q.order_by(Break.status.asc(), Break.first_seen.desc())
        return [break_dict(b) for b in q.all()]


def run_diff(client_id: str) -> dict:
    """What changed in the client's most recent run: breaks first surfaced then
    (new) and breaks cleared then (resolved-in-data). Also the still-open total."""
    from app.services import runs_store
    runs = [r for r in runs_store.get_all() if r.get("client_id") == client_id]
    if not runs:
        return {"run_id": None, "ran_at": None, "new": [], "cleared": [], "still_open": 0}
    latest = runs[0]                      # get_all is newest-first
    rid = latest["id"]
    with session_scope() as db:
        rows = db.query(Break).filter(Break.client_id == client_id).all()
        new = [break_dict(b) for b in rows if b.first_run_id == rid and not b.cleared]
        cleared = [break_dict(b) for b in rows if b.cleared and b.last_run_id == rid]
        still_open = sum(1 for b in rows if not b.cleared and b.status != "resolved")
    return {"run_id": rid, "ran_at": latest.get("ts"),
            "new": new, "cleared": cleared, "still_open": still_open}


def update(break_id: str, fields: dict) -> dict | None:
    with session_scope() as db:
        b = db.get(Break, break_id)
        if not b:
            return None
        for k, v in fields.items():
            if k in _UPDATABLE and v is not None:
                if k == "status" and v not in _VALID_STATUS:
                    continue
                setattr(b, k, v)
        db.flush()
        return break_dict(b)
