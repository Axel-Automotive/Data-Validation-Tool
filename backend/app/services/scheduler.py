"""Background scheduler that runs validations automatically and emails reports."""
from __future__ import annotations
import os
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.routers.files import load_df
from app.services import client_store, email_service, runs_store, schedule_store, shared_store
from app.services.excel_service import get_result, run_all_conditions

_scheduler: BackgroundScheduler | None = None

VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# Schedules store hour/minute as the user's local wall-clock time. In a container
# the process TZ is UTC, so an 08:00 schedule would fire at 08:00 UTC. Set
# SCHEDULER_TIMEZONE (IANA name, e.g. "America/New_York") to fire in that zone;
# unset → the server's local time (unchanged legacy behaviour).
SCHEDULER_TIMEZONE = os.getenv("SCHEDULER_TIMEZONE") or None


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


def run_schedule(schedule_id: str) -> dict:
    """Execute one schedule: run all conditions, email the report. Records status.

    Used both by the scheduler trigger and the manual 'run now' endpoint.
    """
    when = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    s = schedule_store.get(schedule_id)
    if not s:
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
        combined_id, results = run_all_conditions(all_conditions, df_axel, df_dms)
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
        runs_store.record(
            client_id=client["id"], client_name=client["name"], kind="scheduled",
            conditions=results, combined_result_id=combined_id, email_to=emailed,
            status="ok" if not n_fail else "errors",
        )
        return {"ok": True, "status": status, "combined_result_id": combined_id}

    except Exception as e:
        status = f"Error: {e}"
        schedule_store.mark_run(schedule_id, status, when)
        try:
            client_name = (client_store.get_client(s["client_id"]) or {}).get("name", "?")
        except Exception:
            client_name = "?"
        runs_store.record(
            client_id=s.get("client_id", ""), client_name=client_name, kind="scheduled",
            conditions=[], combined_result_id=None, status="failed",
        )
        return {"ok": False, "status": status}
