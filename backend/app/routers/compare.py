import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models import RunConditionRequest, RunAllRequest
from app.routers.files import load_df
from app.services import client_store, email_service
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
        raise HTTPException(404, "Condition not found")

    df_axel = load_df(req.file_axel_id, req.sheet_axel)
    df_dms  = load_df(req.file_dms_id,  req.sheet_dms)
    return _public(run_condition(df_axel, df_dms, cond["type"], cond.get("config", {})))


@router.post("/run-all")
def run_all(req: RunAllRequest):
    client = client_store.get_client(req.client_id)
    if not client:
        raise HTTPException(404, "Client not found")

    df_axel = load_df(req.file_axel_id, req.sheet_axel)
    df_dms  = load_df(req.file_dms_id,  req.sheet_dms)

    combined_id, condition_results = run_all_conditions(
        client.get("conditions", []), df_axel, df_dms
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
        n_ok   = sum(1 for c in condition_results if not c.get("error"))
        n_fail = len(condition_results) - n_ok
        body = (
            f"Validation report for {client['name']}.\n\n"
            f"Conditions run: {len(condition_results)}\n"
            f"Completed: {n_ok}\n"
            f"Errors: {n_fail}\n\n"
            f"The full report is attached."
        )
        subject = (client.get("email_subject") or "").strip() or f"Validation Report — {client['name']}"
        sent = email_service.send_report(recipients, subject, body, data, filename)
        resp["email_sent"] = True
        resp["email_to"] = sent["recipients"]

    return resp


@router.get("/email/status")
def email_status():
    return email_service.status()


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
