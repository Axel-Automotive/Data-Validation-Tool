from fastapi import APIRouter, HTTPException
from app.models import (
    AxelConnectionRequest,
    AxelQueryUpsertRequest,
    ClientCreateRequest,
    ConditionUpsertRequest,
    EmailSettingsRequest,
)
from app.services import (
    axel_connection_store,
    axel_query_store,
    axel_source,
    client_store,
    email_service,
)

router = APIRouter()


def _require_client(client_id: str) -> dict:
    c = client_store.get_client(client_id)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


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


@router.put("/{client_id}/email")
def set_email_settings(client_id: str, body: EmailSettingsRequest):
    cleaned = email_service.clean_recipients(body.recipients)
    c = client_store.update_email_settings(client_id, cleaned, body.subject.strip())
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


# ── AXEL data-source connection (per client) ──────────────────────────────────

@router.get("/{client_id}/axel-connection")
def get_axel_connection(client_id: str):
    _require_client(client_id)
    return axel_connection_store.get_public(client_id) or {}


@router.put("/{client_id}/axel-connection")
def set_axel_connection(client_id: str, body: AxelConnectionRequest):
    _require_client(client_id)
    saved = axel_connection_store.upsert(client_id, body.model_dump())
    axel_source.invalidate(client_id)   # rebuild engine with new settings
    return saved


@router.delete("/{client_id}/axel-connection")
def delete_axel_connection(client_id: str):
    _require_client(client_id)
    axel_connection_store.delete(client_id)
    axel_source.invalidate(client_id)
    return {"ok": True}


@router.post("/{client_id}/axel-connection/test")
def test_axel_connection(client_id: str):
    _require_client(client_id)
    conn = axel_connection_store.get(client_id)
    if not conn:
        raise HTTPException(400, "No connection configured for this client.")
    return axel_source.test_connection(client_id, conn)


# ── AXEL report queries (per client) ──────────────────────────────────────────

def _validate_query_body(body: AxelQueryUpsertRequest) -> dict:
    data = body.model_dump()
    if data.get("source_kind", "db") == "db" and data.get("db_mode", "sql") == "sql":
        data["sql"] = axel_source.validate_sql(data.get("sql", ""))
    return data


@router.get("/{client_id}/axel-queries")
def list_axel_queries(client_id: str):
    _require_client(client_id)
    return axel_query_store.get_all(client_id)


@router.post("/{client_id}/axel-queries", status_code=201)
def create_axel_query(client_id: str, body: AxelQueryUpsertRequest):
    _require_client(client_id)
    return axel_query_store.add(client_id, _validate_query_body(body))


@router.put("/{client_id}/axel-queries/{query_id}")
def update_axel_query(client_id: str, query_id: str, body: AxelQueryUpsertRequest):
    _require_client(client_id)
    q = axel_query_store.update(client_id, query_id, _validate_query_body(body))
    if not q:
        raise HTTPException(404, "Query not found")
    return q


@router.delete("/{client_id}/axel-queries/{query_id}")
def delete_axel_query(client_id: str, query_id: str):
    _require_client(client_id)
    if not axel_query_store.delete(client_id, query_id):
        raise HTTPException(404, "Query not found")
    return {"ok": True}


@router.post("/{client_id}/axel-queries/{query_id}/preview")
def preview_axel_query(client_id: str, query_id: str, params: dict | None = None):
    _require_client(client_id)
    query = axel_query_store.get(client_id, query_id)
    if not query:
        raise HTTPException(404, "Query not found")
    conn = axel_connection_store.get(client_id)
    if not conn:
        raise HTTPException(400, "No connection configured for this client.")
    return axel_source.preview(client_id, conn, query, params)
