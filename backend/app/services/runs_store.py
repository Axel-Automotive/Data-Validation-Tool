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


_RATE_KEYS = ("match_rate", "pair_rate", "pass_rate")


def _rate(metrics: dict | None) -> float | None:
    m = metrics or {}
    for k in _RATE_KEYS:
        if m.get(k) is not None:
            return m[k]
    return None


def condition_trends(client_id: str | None = None, drop_threshold: float = 20.0) -> list[dict]:
    """Per-condition match/pass-rate history across runs, with a regression flag.

    A condition regresses when its latest rate falls `drop_threshold` points below
    the average of its earlier runs. Series are keyed by (client, condition name,
    validation name, type) so the same condition tracks across runs over time.
    Regressed series are returned first.
    """
    runs = list(reversed(get_all()))          # oldest → newest for time order
    if client_id:
        runs = [r for r in runs if r.get("client_id") == client_id]

    series: dict[tuple, dict] = {}
    for r in runs:
        for c in r.get("summary") or []:
            key = (r.get("client_id"), c.get("name"), c.get("validation_name", ""), c.get("type"))
            s = series.setdefault(key, {
                "client_id": r.get("client_id"), "client_name": r.get("client_name"),
                "name": c.get("name"), "validation_name": c.get("validation_name", ""),
                "type": c.get("type"), "points": [],
            })
            s["points"].append({"ts": r.get("ts"), "rate": _rate(c.get("metrics")),
                                 "error": bool(c.get("error"))})

    out = []
    for s in series.values():
        rates = [p["rate"] for p in s["points"] if p["rate"] is not None]
        latest = rates[-1] if rates else None
        prior = rates[:-1]
        baseline = sum(prior) / len(prior) if prior else None
        s["runs"] = len(s["points"])
        s["latest_rate"] = latest
        s["baseline_rate"] = round(baseline, 1) if baseline is not None else None
        s["regression"] = bool(latest is not None and baseline is not None
                               and latest <= baseline - drop_threshold)
        out.append(s)

    out.sort(key=lambda x: (not x["regression"], (x["name"] or "").lower()))
    return out


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
