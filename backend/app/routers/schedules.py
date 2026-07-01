from fastapi import APIRouter, HTTPException

from app.models import ScheduleUpsertRequest
from app.routers.files import file_meta
from app.services import axel_query_store, client_store, email_service, schedule_store, scheduler

router = APIRouter()

VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _validate(body: ScheduleUpsertRequest) -> dict:
    if not client_store.get_client(body.client_id):
        raise HTTPException(404, "Client not found")
    # AXEL side: a saved DB query (live pull) or a pinned file.
    if body.axel_source and body.axel_source.get("kind") == "query":
        if not axel_query_store.get(body.client_id, body.axel_source.get("query_id")):
            raise HTTPException(400, "AXEL query not found for this client.")
    elif not file_meta(body.file_axel_id):
        raise HTTPException(400, "AXEL file not found — upload it first, or use a data-source query.")
    if not file_meta(body.file_dms_id):
        raise HTTPException(400, "DMS file not found — upload it first.")
    if not (0 <= body.hour <= 23) or not (0 <= body.minute <= 59):
        raise HTTPException(400, "Invalid time.")
    days = [d for d in body.days if d in VALID_DAYS]
    if not days:
        raise HTTPException(400, "Select at least one day of the week.")
    data = body.model_dump()
    data["days"] = days
    data["recipients"] = email_service.clean_recipients(body.recipients)
    return data


@router.get("/")
def list_schedules():
    return schedule_store.get_all()


@router.post("/", status_code=201)
def create_schedule(body: ScheduleUpsertRequest):
    data = _validate(body)
    s = schedule_store.create(data)
    scheduler.sync(s)
    return s


@router.put("/{schedule_id}")
def update_schedule(schedule_id: str, body: ScheduleUpsertRequest):
    data = _validate(body)
    s = schedule_store.update(schedule_id, data)
    if not s:
        raise HTTPException(404, "Schedule not found")
    scheduler.sync(s)
    return s


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str):
    if not schedule_store.delete(schedule_id):
        raise HTTPException(404, "Schedule not found")
    scheduler.remove(schedule_id)
    return {"ok": True}


@router.post("/{schedule_id}/run")
def run_schedule_now(schedule_id: str):
    if not schedule_store.get(schedule_id):
        raise HTTPException(404, "Schedule not found")
    result = scheduler.run_schedule(schedule_id)
    return {**result, "schedule": schedule_store.get(schedule_id)}
