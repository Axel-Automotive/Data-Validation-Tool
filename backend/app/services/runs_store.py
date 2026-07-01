"""Log of validation runs (manual, emailed, scheduled), backed by the database."""
from __future__ import annotations

from datetime import datetime

from app.database import session_scope
from app.models.tables import Run, run_dict

MAX_RUNS = 500   # keep the most recent N records


def get_all() -> list[dict]:
    # Most recent first.
    with session_scope() as db:
        rows = (db.query(Run)
                  .order_by(Run.timestamp.desc(), Run.id.desc())
                  .limit(MAX_RUNS).all())
        return [run_dict(r) for r in rows]


def record(
    *,
    client_id: str,
    client_name: str,
    kind: str,                       # "manual" | "email" | "scheduled"
    conditions: list[dict],          # the run_all condition_results
    combined_result_id: str | None,
    email_to: list[str] | None = None,
    status: str = "ok",
) -> dict:
    n_total = len(conditions)
    n_error = sum(1 for c in conditions if c.get("error"))
    summary = [
        {
            "name": c.get("condition_name"),
            "validation_name": c.get("validation_name", ""),
            "type": c.get("type"),
            "error": c.get("error"),
            "metrics": c.get("metrics"),
        }
        for c in conditions
    ]
    with session_scope() as db:
        r = Run(
            client_id=client_id or None, client_name=client_name, kind=kind,
            total=n_total, errors=n_error, combined_result_id=combined_result_id,
            email_to=email_to or [], status=status, summary_metrics=summary,
            timestamp=datetime.now(),
        )
        db.add(r)
        db.flush()
        result = run_dict(r)
        # Trim to the most recent MAX_RUNS.
        stale = [x.id for x in (db.query(Run.id)
                                  .order_by(Run.timestamp.desc(), Run.id.desc())
                                  .offset(MAX_RUNS).all())]
        if stale:
            db.query(Run).filter(Run.id.in_(stale)).delete(synchronize_session=False)
        return result
