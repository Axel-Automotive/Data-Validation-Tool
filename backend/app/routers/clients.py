from fastapi import APIRouter, HTTPException
from app.models import ClientCreateRequest, ConditionUpsertRequest, RecipientsRequest
from app.services import client_store, email_service

router = APIRouter()


# ── Clients ───────────────────────────────────────────────────────────────────

@router.get("/")
def list_clients():
    return client_store.get_all_clients()


@router.post("/", status_code=201)
def create_client(body: ClientCreateRequest):
    return client_store.create_client(body.name)


@router.put("/{client_id}")
def update_client(client_id: str, body: ClientCreateRequest):
    c = client_store.update_client(client_id, body.name)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


@router.delete("/{client_id}")
def delete_client(client_id: str):
    if not client_store.delete_client(client_id):
        raise HTTPException(404, "Client not found")
    return {"ok": True}


@router.put("/{client_id}/recipients")
def set_recipients(client_id: str, body: RecipientsRequest):
    cleaned = email_service.clean_recipients(body.recipients)
    c = client_store.update_recipients(client_id, cleaned)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


# ── Conditions ────────────────────────────────────────────────────────────────

@router.get("/{client_id}/conditions")
def list_conditions(client_id: str):
    c = client_store.get_client(client_id)
    if not c:
        raise HTTPException(404, "Client not found")
    return c.get("conditions", [])


@router.post("/{client_id}/conditions", status_code=201)
def add_condition(client_id: str, body: ConditionUpsertRequest):
    cond = client_store.add_condition(client_id, body.model_dump())
    if not cond:
        raise HTTPException(404, "Client not found")
    return cond


@router.put("/{client_id}/conditions/{condition_id}")
def update_condition(client_id: str, condition_id: str, body: ConditionUpsertRequest):
    cond = client_store.update_condition(client_id, condition_id, body.model_dump())
    if not cond:
        raise HTTPException(404, "Condition not found")
    return cond


@router.delete("/{client_id}/conditions/{condition_id}")
def delete_condition(client_id: str, condition_id: str):
    if not client_store.delete_condition(client_id, condition_id):
        raise HTTPException(404, "Condition not found")
    return {"ok": True}
