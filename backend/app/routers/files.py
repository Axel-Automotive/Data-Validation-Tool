import io
import json
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

router = APIRouter()

# Persist uploaded files to disk so they survive restarts and can be used by
# scheduled (unattended) runs. Each file is stored as <id>.xlsx + <id>.json.
FILES_DIR = Path(__file__).parent.parent.parent / "data" / "files"


def _data_path(file_id: str) -> Path:
    return FILES_DIR / f"{file_id}.xlsx"


def _meta_path(file_id: str) -> Path:
    return FILES_DIR / f"{file_id}.json"


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    try:
        sheets = pd.ExcelFile(io.BytesIO(content)).sheet_names
    except Exception:
        raise HTTPException(400, "Could not read this file as an Excel workbook (.xlsx/.xls).")

    file_id = str(uuid.uuid4())
    name = file.filename or "file.xlsx"
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    _data_path(file_id).write_bytes(content)
    _meta_path(file_id).write_text(json.dumps({"name": name, "sheets": sheets}))
    return {"id": file_id, "name": name, "sheets": sheets}


@router.get("/")
def list_files():
    """All persisted files — used by the schedule builder to pin source files."""
    if not FILES_DIR.exists():
        return []
    out = []
    for meta in sorted(FILES_DIR.glob("*.json")):
        try:
            d = json.loads(meta.read_text())
        except Exception:
            continue
        out.append({"id": meta.stem, "name": d.get("name"), "sheets": d.get("sheets", [])})
    return out


@router.get("/{file_id}/columns")
def get_columns(file_id: str, sheet: str = Query(...)):
    content = _require(file_id)
    df = pd.ExcelFile(io.BytesIO(content)).parse(sheet)
    return {"columns": df.columns.tolist(), "rows": len(df), "cols": len(df.columns)}


# ── Internal helpers used by compare router & scheduler ─────────────────────────

def load_df(file_id: str, sheet: str) -> pd.DataFrame:
    content = _require(file_id)
    return pd.ExcelFile(io.BytesIO(content)).parse(sheet)


def file_meta(file_id: str) -> dict | None:
    mp = _meta_path(file_id)
    if not mp.exists():
        return None
    try:
        d = json.loads(mp.read_text())
    except Exception:
        return None
    return {"id": file_id, "name": d.get("name"), "sheets": d.get("sheets", [])}


def _require(file_id: str) -> bytes:
    p = _data_path(file_id)
    if not p.exists():
        raise HTTPException(404, "File not found — please re-upload.")
    return p.read_bytes()
