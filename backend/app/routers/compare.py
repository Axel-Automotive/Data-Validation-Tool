import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pydantic import BaseModel as _BaseModel

from app.models import RunConditionRequest, RunAllRequest
from app.routers.files import load_df, file_meta
from app.services import (
    axel_connection_store,
    axel_query_store,
    axel_source,
    client_store,
    email_service,
    runs_store,
    shared_store,
)
from app.services.excel_service import (
    get_result,
    run_calc_difference,
    run_condition,
    run_all_conditions,
    run_sheet_difference,
    run_stacked_comparison,
)

router = APIRouter()


def _public(result: dict) -> dict:
    """Drop internal-only keys (full DataFrames) that aren't JSON-serializable."""
    return {k: v for k, v in result.items() if not k.startswith("_")}


def resolve_axel_df(client_id: str, file_axel_id: str, sheet_axel: str,
                    axel_source_ref: dict | None):
    """Produce the AXEL-side DataFrame from either a saved query or an .xlsx file.

    `axel_source_ref` of {"kind": "query", "query_id", "params"} runs the client's
    saved query; otherwise we fall back to the uploaded file (existing behaviour).
    """
    if axel_source_ref and axel_source_ref.get("kind") == "query":
        query = axel_query_store.get(client_id, axel_source_ref.get("query_id"))
        if not query:
            raise HTTPException(404, "AXEL query not found for this client.")
        conn = axel_connection_store.get(client_id)
        return axel_source.run_query(client_id, conn, query, axel_source_ref.get("params"))
    if not file_axel_id or not sheet_axel:
        raise HTTPException(400, "No AXEL source provided — choose a file/sheet or a query.")
    return load_df(file_axel_id, sheet_axel)


# ── Ad-hoc request models ─────────────────────────────────────────────────────

class SheetDiffRequest(BaseModel):
    file_a_id: str; file_b_id: str
    sheet_a: str;   sheet_b: str
    cols_a: list[str]; cols_b: list[str]


class StackedRequest(BaseModel):
    file_a_id: str; file_b_id: str
    sheet_a: str;   sheet_b: str
    name_a: str = "AXEL"; name_b: str = "DMS"
    control_col: str
    control_col_b: str | None = None


class CalcDiffRequest(BaseModel):
    file_a_id: str; file_b_id: str
    sheet_a: str;   sheet_b: str
    name_a: str = "AXEL"; name_b: str = "DMS"
    key_col: str; num_col_a: str; num_col_b: str


# ── Ad-hoc comparison endpoints ───────────────────────────────────────────────

@router.post("/sheet-diff")
def sheet_diff(req: SheetDiffRequest):
    return _public(run_sheet_difference(
        load_df(req.file_a_id, req.sheet_a),
        load_df(req.file_b_id, req.sheet_b),
        req.cols_a, req.cols_b,
    ))


@router.post("/stacked")
def stacked(req: StackedRequest):
    return _public(run_stacked_comparison(
        load_df(req.file_a_id, req.sheet_a),
        load_df(req.file_b_id, req.sheet_b),
        req.name_a, req.name_b, req.control_col,
        req.control_col_b,
    ))


@router.post("/calc-diff")
def calc_diff(req: CalcDiffRequest):
    return _public(run_calc_difference(
        load_df(req.file_a_id, req.sheet_a),
        load_df(req.file_b_id, req.sheet_b),
        req.name_a, req.name_b,
        req.key_col, req.num_col_a, req.num_col_b,
    ))


# ── Condition-based endpoints ─────────────────────────────────────────────────

@router.post("/run-condition")
def run_one_condition(req: RunConditionRequest):
    client = client_store.get_client(req.client_id)
    if not client:
        raise HTTPException(404, "Client not found")

    cond = next((c for c in client.get("conditions", []) if c["id"] == req.condition_id), None)
    if not cond:
        cond = shared_store.get(req.condition_id)   # may be a shared condition
    if not cond:
        raise HTTPException(404, "Condition not found")

    df_axel = resolve_axel_df(req.client_id, req.file_axel_id, req.sheet_axel, req.axel_source)
    df_dms  = load_df(req.file_dms_id,  req.sheet_dms)
    return _public(run_condition(df_axel, df_dms, cond["type"], cond.get("config", {})))


@router.post("/run-all")
def run_all(req: RunAllRequest):
    client = client_store.get_client(req.client_id)
    if not client:
        raise HTTPException(404, "Client not found")

    df_axel = resolve_axel_df(req.client_id, req.file_axel_id, req.sheet_axel, req.axel_source)
    df_dms  = load_df(req.file_dms_id,  req.sheet_dms)

    # Shared conditions apply to every client, run before the client's own.
    all_conditions = shared_store.get_all() + client.get("conditions", [])

    is_query = bool(req.axel_source and req.axel_source.get("kind") == "query")
    axel_name = "SQL/API query" if is_query else ((file_meta(req.file_axel_id) or {}).get("name", "—"))
    run_info = {
        "axel_name": axel_name,
        "axel_sheet": "—" if is_query else req.sheet_axel,
        "dms_name": (file_meta(req.file_dms_id) or {}).get("name", "—"),
        "dms_sheet": req.sheet_dms,
    }
    combined_id, condition_results = run_all_conditions(
        all_conditions, df_axel, df_dms, run_info
    )

    resp = {"combined_result_id": combined_id, "conditions": condition_results,
            "email_sent": False, "email_to": []}

    if req.email:
        recipients = email_service.clean_recipients(
            req.email_to if req.email_to is not None else client.get("recipients", [])
        )
        if not recipients:
            raise HTTPException(400, "No recipients configured for this client. Add them in Settings.")
        data, filename = get_result(combined_id)
        body = email_service.summary_text(client["name"], condition_results)
        subject = (client.get("email_subject") or "").strip() or f"Validation Report — {client['name']}"
        sent = email_service.send_report(recipients, subject, body, data, filename)
        resp["email_sent"] = True
        resp["email_to"] = sent["recipients"]

    runs_store.record(
        client_id=client["id"], client_name=client["name"],
        kind="email" if req.email else "manual",
        conditions=condition_results, combined_result_id=combined_id,
        email_to=resp["email_to"],
        status="ok" if not any(c.get("error") for c in condition_results) else "errors",
    )
    return resp


@router.get("/email/status")
def email_status():
    return email_service.status()


class TestEmailRequest(_BaseModel):
    to: str


@router.post("/email/test")
def email_test(req: TestEmailRequest):
    return email_service.send_test(req.to)


# ── Download ──────────────────────────────────────────────────────────────────

@router.get("/download/{result_id}")
def download(result_id: str):
    entry = get_result(result_id)
    if not entry:
        raise HTTPException(404, "Result not found or expired.")
    data, filename = entry
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
