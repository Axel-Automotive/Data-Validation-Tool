"""Background scheduler that runs validations automatically and emails reports."""
from __future__ import annotations
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.routers.files import load_df
from app.services import client_store, email_service, schedule_store
from app.services.excel_service import get_result, run_all_conditions

_scheduler: BackgroundScheduler | None = None

VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def start() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
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
    trigger = CronTrigger(
        day_of_week=",".join(days),
        hour=int(s.get("hour", 8)),
        minute=int(s.get("minute", 0)),
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

        df_axel = load_df(s["file_axel_id"], s["sheet_axel"])
        df_dms  = load_df(s["file_dms_id"],  s["sheet_dms"])

        combined_id, results = run_all_conditions(client.get("conditions", []), df_axel, df_dms)
        n_fail = sum(1 for c in results if c.get("error"))

        recipients = email_service.clean_recipients(
            s.get("recipients") or client.get("recipients", [])
        )
        if recipients:
            data, filename = get_result(combined_id)
            body = (
                f"Scheduled validation report for {client['name']} ({s['name']}).\n\n"
                f"Conditions run: {len(results)}\nErrors: {n_fail}\n\n"
                f"The full report is attached."
            )
            email_service.send_report(
                recipients, f"Scheduled Validation — {client['name']}", body, data, filename
            )
            status = f"OK — emailed {len(recipients)} recipient(s)" + (f", {n_fail} error(s)" if n_fail else "")
        else:
            status = "Ran — no recipients configured, not emailed"

        schedule_store.mark_run(schedule_id, status, when)
        return {"ok": True, "status": status, "combined_result_id": combined_id}

    except Exception as e:
        status = f"Error: {e}"
        schedule_store.mark_run(schedule_id, status, when)
        return {"ok": False, "status": status}
