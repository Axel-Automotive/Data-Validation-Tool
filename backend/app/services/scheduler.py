"""Background scheduler that runs validations automatically and emails reports."""
from __future__ import annotations
import logging
import os
import time
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.util import astimezone

from app.routers.files import load_df, file_meta
from app.services import (
    break_store, client_store, email_service, runs_store, schedule_store, shared_store,
)
from app.services.excel_service import get_result, run_all_conditions

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _resolve_timezone():
    """Schedules store hour/minute as the user's local wall-clock time. In a
    container the process TZ is UTC, so an 08:00 schedule would fire at 08:00
    UTC. Set SCHEDULER_TIMEZONE (IANA name, e.g. "America/New_York") to fire in
    that zone; unset → the server's local time (unchanged legacy behaviour).

    An invalid value must NOT take down app startup — fall back to local time.
    """
    name = os.getenv("SCHEDULER_TIMEZONE") or None
    if not name:
        return None
    try:
        return astimezone(name)
    except Exception:
        log.warning("Invalid SCHEDULER_TIMEZONE %r — falling back to server local time.", name)
        return None


SCHEDULER_TIMEZONE = _resolve_timezone()


def start() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True, timezone=SCHEDULER_TIMEZONE)
    _scheduler.start()
    for s in schedule_store.get_all():
        if s.get("enabled"):
            _add_job(s)


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def _add_job(s: dict) -> None:
    days = [d for d in s.get("days", []) if d in VALID_DAYS] or VALID_DAYS
    # Pass the timezone to the trigger itself: CronTrigger otherwise defaults to
    # the local machine zone at construction, which add_job does NOT override
    # with the scheduler's timezone. None → local time (unchanged legacy default).
    trigger = CronTrigger(
        day_of_week=",".join(days),
        hour=int(s.get("hour", 8)),
        minute=int(s.get("minute", 0)),
        timezone=SCHEDULER_TIMEZONE,
    )
    _scheduler.add_job(
        run_schedule, trigger, id=s["id"], args=[s["id"]],
        replace_existing=True, misfire_grace_time=3600, coalesce=True,
    )


def sync(s: dict) -> None:
    """Register/refresh a schedule's job (called after create/update)."""
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(s["id"])
    except Exception:
        pass
    if s.get("enabled"):
        _add_job(s)


def remove(schedule_id: str) -> None:
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(schedule_id)
    except Exception:
        pass


# ── Observability helpers ──────────────────────────────────────────────────────

# A scheduled run's match/pass rate dropping far below its recent average is an
# anomaly worth alerting on (research rule of thumb).
RATE_DROP_ALERT = 20.0   # percentage points


def _result_rate(c: dict) -> float | None:
    m = c.get("metrics") or {}
    for k in ("match_rate", "pair_rate", "pass_rate"):
        if m.get(k) is not None:
            return m[k]
    return None


def _avg_rate(conditions: list[dict]) -> float | None:
    rates = [r for r in (_result_rate(c) for c in conditions) if r is not None]
    return sum(rates) / len(rates) if rates else None


def _trailing_avg_rate(client_id: str, n: int = 5) -> float | None:
    """Average rate across this client's most recent prior scheduled runs."""
    try:
        runs = [r for r in runs_store.get_all()
                if r.get("client_id") == client_id and r.get("kind") == "scheduled" and r.get("summary")]
    except Exception:
        return None
    vals = [v for v in (_avg_rate(r["summary"]) for r in runs[:n]) if v is not None]
    return sum(vals) / len(vals) if vals else None


def _send_alert(recipients: list[str], subject: str, body: str) -> None:
    """Best-effort alert email — never let a send failure break the run."""
    if not recipients or not email_service.is_configured():
        return
    try:
        email_service.send_report(recipients, subject, body, None)
    except Exception:
        log.exception("failed to send scheduler alert email")


def run_schedule(schedule_id: str) -> dict:
    """Execute one schedule: run all conditions, email the report. Records status.

    Used both by the scheduler trigger and the manual 'run now' endpoint.
    """
    when = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    t0 = time.monotonic()
    s = schedule_store.get(schedule_id)
    if not s:
        log.warning("scheduled run skipped: schedule %s not found", schedule_id)
        return {"ok": False, "status": "Schedule not found"}

    try:
        client = client_store.get_client(s["client_id"])
        if not client:
            raise ValueError("Client no longer exists")

        # AXEL side: a saved DB query (live pull) or the pinned file. Imported
        # lazily to avoid a router/service import cycle at module load.
        from app.routers.compare import resolve_axel_df
        df_axel = resolve_axel_df(s["client_id"], s.get("file_axel_id", ""),
                                  s.get("sheet_axel", ""), s.get("axel_source"))
        df_dms  = load_df(s["file_dms_id"],  s["sheet_dms"])

        all_conditions = shared_store.get_all() + client.get("conditions", [])
        # Trailing average BEFORE this run is recorded — the baseline to detect a drop.
        baseline_rate = _trailing_avg_rate(s["client_id"])
        is_query = bool(s.get("axel_source") and s["axel_source"].get("kind") == "query")
        run_info = {
            "axel_name": "SQL/API query" if is_query else (file_meta(s.get("file_axel_id", "")) or {}).get("name", "—"),
            "axel_sheet": "—" if is_query else s.get("sheet_axel", ""),
            "dms_name": (file_meta(s.get("file_dms_id", "")) or {}).get("name", "—"),
            "dms_sheet": s.get("sheet_dms", ""),
        }
        combined_id, results = run_all_conditions(all_conditions, df_axel, df_dms, run_info)
        n_fail = sum(1 for c in results if c.get("error"))

        recipients = email_service.clean_recipients(
            s.get("recipients") or client.get("recipients", [])
        )
        emailed = []
        if recipients:
            data, filename = get_result(combined_id)
            body = email_service.summary_text(
                client["name"], results,
                heading=f"Scheduled validation report for {client['name']} ({s['name']}).",
            )
            subject = (client.get("email_subject") or "").strip() or f"Scheduled Validation — {client['name']}"
            email_service.send_report(recipients, subject, body, data, filename)
            emailed = recipients
            status = f"OK — emailed {len(recipients)} recipient(s)" + (f", {n_fail} error(s)" if n_fail else "")
        else:
            status = "Ran — no recipients configured, not emailed"

        schedule_store.mark_run(schedule_id, status, when)
        run = runs_store.record(
            client_id=client["id"], client_name=client["name"], kind="scheduled",
            conditions=results, combined_result_id=combined_id, email_to=emailed,
            status="ok" if not n_fail else "errors",
        )
        try:
            break_store.sync_from_results(client["id"], run["id"], results)
        except Exception:
            log.exception("failed to sync breaks for schedule=%s", schedule_id)

        dur_ms = int((time.monotonic() - t0) * 1000)
        cur_rate = _avg_rate(results)
        log.info(
            "scheduled run ok: schedule=%s client=%r conditions=%d rows_axel=%d "
            "rows_dms=%d failures=%d avg_rate=%s duration_ms=%d emailed=%d",
            schedule_id, client["name"], len(results), len(df_axel), len(df_dms),
            n_fail, "n/a" if cur_rate is None else f"{cur_rate:.1f}", dur_ms, len(emailed),
        )

        # Anomaly: match/pass rate dropped far below the recent average.
        if cur_rate is not None and baseline_rate is not None \
                and cur_rate <= baseline_rate - RATE_DROP_ALERT:
            drop = baseline_rate - cur_rate
            log.warning("scheduled run anomaly: schedule=%s client=%r rate %.1f%% vs "
                        "recent avg %.1f%% (down %.1f pts)",
                        schedule_id, client["name"], cur_rate, baseline_rate, drop)
            _send_alert(
                recipients,
                f"⚠ AXEL Validator anomaly — {client['name']} ({s['name']})",
                f"The scheduled validation for {client['name']} ({s['name']}) matched only "
                f"{cur_rate:.1f}% on average, down {drop:.1f} points from its recent average "
                f"of {baseline_rate:.1f}%.\n\nReview the attached-report run in the app.",
            )

        return {"ok": True, "status": status, "combined_result_id": combined_id}

    except Exception as e:
        status = f"Error: {e}"
        dur_ms = int((time.monotonic() - t0) * 1000)
        log.error("scheduled run FAILED: schedule=%s client_id=%s error=%s duration_ms=%d",
                  schedule_id, s.get("client_id"), e, dur_ms)
        schedule_store.mark_run(schedule_id, status, when)
        client = None
        try:
            client = client_store.get_client(s["client_id"])
        except Exception:
            pass
        client_name = (client or {}).get("name", "?")
        runs_store.record(
            client_id=s.get("client_id", ""), client_name=client_name, kind="scheduled",
            conditions=[], combined_result_id=None, status="failed",
        )
        # Alert the recipients that the unattended run failed.
        try:
            recipients = email_service.clean_recipients(
                s.get("recipients") or (client or {}).get("recipients", []))
        except Exception:
            recipients = []
        _send_alert(
            recipients,
            f"✗ AXEL Validator run failed — {client_name} ({s.get('name', '?')})",
            f"The scheduled validation '{s.get('name','?')}' for {client_name} failed to run.\n\n"
            f"Error: {e}\n\nNo report was produced. Please check the source files/query in the app.",
        )
        return {"ok": False, "status": status}
