from fastapi import APIRouter, HTTPException

from app.models import ConditionUpsertRequest
from app.services import shared_store

router = APIRouter()


@router.get("/")
def list_shared():
    return shared_store.get_all()


@router.post("/", status_code=201)
def create_shared(body: ConditionUpsertRequest):
    return shared_store.add(body.model_dump())


@router.put("/{condition_id}")
def update_shared(condition_id: str, body: ConditionUpsertRequest):
    c = shared_store.update(condition_id, body.model_dump())
    if not c:
        raise HTTPException(404, "Shared condition not found")
    return c


@router.delete("/{condition_id}")
def delete_shared(condition_id: str):
    if not shared_store.delete(condition_id):
        raise HTTPException(404, "Shared condition not found")
    return {"ok": True}
