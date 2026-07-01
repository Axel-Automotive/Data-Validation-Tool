import io
import json
import time
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

router = APIRouter()

# Persist uploaded files to disk so they survive restarts and can be used by
# scheduled (unattended) runs. Each file is stored as <id>.<ext> + <id>.json,
# where <ext> is "xlsx" (Excel) or "csv". CSV files have no worksheets, so they
# expose a single pseudo-sheet named "CSV" to keep the file+sheet flow uniform.
FILES_DIR = Path(__file__).parent.parent.parent / "data" / "files"

CSV_SHEET = "CSV"


def _meta_path(file_id: str) -> Path:
    return FILES_DIR / f"{file_id}.json"


def _read_meta(file_id: str) -> dict | None:
    mp = _meta_path(file_id)
    if not mp.exists():
        return None
    try:
        return json.loads(mp.read_text())
    except Exception:
        return None


def _data_path(file_id: str, ext: str | None = None) -> Path:
    # Default to "xlsx" so files uploaded before CSV support (which had no `ext`
    # in their meta) still resolve to <id>.xlsx.
    if ext is None:
        ext = (_read_meta(file_id) or {}).get("ext", "xlsx")
    return FILES_DIR / f"{file_id}.{ext}"


def _read_csv_bytes(content: bytes) -> pd.DataFrame:
    """Parse CSV bytes, tolerating a BOM and non-UTF-8 encodings."""
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(content), encoding=enc)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(io.BytesIO(content), encoding="latin-1")


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "file"
    is_csv = name.lower().endswith(".csv")
    try:
        if is_csv:
            _read_csv_bytes(content)          # validate it parses
            sheets, ext = [CSV_SHEET], "csv"
        else:
            sheets = pd.ExcelFile(io.BytesIO(content)).sheet_names
            ext = "xlsx"
    except Exception:
        raise HTTPException(
            400, "Could not read this file. Upload an Excel workbook (.xlsx/.xls) or a CSV (.csv)."
        )

    file_id = str(uuid.uuid4())
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    _data_path(file_id, ext).write_bytes(content)
    _meta_path(file_id).write_text(json.dumps({"name": name, "sheets": sheets, "ext": ext}))
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
    content, ext = _require(file_id)
    df = _read_csv_bytes(content) if ext == "csv" else pd.ExcelFile(io.BytesIO(content)).parse(sheet)
    return {"columns": df.columns.tolist(), "rows": len(df), "cols": len(df.columns)}


# ── Internal helpers used by compare router & scheduler ─────────────────────────

def load_df(file_id: str, sheet: str) -> pd.DataFrame:
    content, ext = _require(file_id)
    if ext == "csv":
        return _read_csv_bytes(content)
    return pd.ExcelFile(io.BytesIO(content)).parse(sheet)


def file_meta(file_id: str) -> dict | None:
    d = _read_meta(file_id)
    if not d:
        return None
    return {"id": file_id, "name": d.get("name"), "sheets": d.get("sheets", [])}


def _require(file_id: str) -> tuple[bytes, str]:
    """Return (file bytes, ext) or raise 404 if the file is missing."""
    meta = _read_meta(file_id)
    if not meta:
        raise HTTPException(404, "File not found — please re-upload.")
    ext = meta.get("ext", "xlsx")
    p = _data_path(file_id, ext)
    if not p.exists():
        raise HTTPException(404, "File not found — please re-upload.")
    return p.read_bytes(), ext


def cleanup_old_files(max_age_days: int = 30) -> int:
    """Delete uploaded files older than max_age_days. Returns count removed.

    Files referenced by an enabled schedule are preserved regardless of age.
    """
    if not FILES_DIR.exists():
        return 0
    try:
        from app.services import schedule_store
        pinned = set()
        for s in schedule_store.get_all():
            pinned.add(s.get("file_axel_id"))
            pinned.add(s.get("file_dms_id"))
    except Exception:
        pinned = set()

    cutoff = time.time() - max_age_days * 86400
    removed = 0
    for meta in FILES_DIR.glob("*.json"):
        fid = meta.stem
        if fid in pinned:
            continue
        try:
            if meta.stat().st_mtime < cutoff:
                # Resolve the data file BEFORE removing meta (meta records the ext).
                data_file = _data_path(fid)
                meta.unlink(missing_ok=True)
                data_file.unlink(missing_ok=True)
                removed += 1
        except OSError:
            pass
    return removed
