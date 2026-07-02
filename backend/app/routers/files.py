import io
import json
import re
import time
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

router = APIRouter()

# Persist uploaded files to disk so they survive restarts and can be used by
# scheduled (unattended) runs. Each file is stored as <id>.<ext> + <id>.json,
# where <ext> is "xlsx" (Excel), "csv" or "pdf". CSV files have no worksheets,
# so they expose a single pseudo-sheet named "CSV" to keep the file+sheet flow
# uniform; PDFs expose each detected table as a pseudo-sheet ("Table 1", ...).
FILES_DIR = Path(__file__).parent.parent.parent / "data" / "files"

CSV_SHEET = "CSV"


def _safe_id(file_id: str) -> str:
    """Reject anything that isn't a bare id token, so a crafted file_id like
    '../../etc/passwd' can't traverse out of FILES_DIR."""
    if not re.fullmatch(r"[A-Za-z0-9\-]+", file_id or ""):
        raise HTTPException(404, "File not found — please re-upload.")
    return file_id


def _meta_path(file_id: str) -> Path:
    return FILES_DIR / f"{_safe_id(file_id)}.json"


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
    return FILES_DIR / f"{_safe_id(file_id)}.{ext}"


def _read_csv_bytes(content: bytes) -> pd.DataFrame:
    """Parse CSV bytes, tolerating a BOM and non-UTF-8 encodings."""
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(content), encoding=enc)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(io.BytesIO(content), encoding="latin-1")


def _coerce_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Convert text columns to numbers when every non-blank cell parses as one
    (thousands separators tolerated), so PDF-extracted values behave like
    Excel-native numbers in comparisons."""
    for col in df.columns:
        s = df[col].astype(str).str.strip().str.replace(",", "", regex=False)
        non_blank = s != ""
        if not non_blank.any():
            continue
        num = pd.to_numeric(s.where(non_blank), errors="coerce")
        if num[non_blank].notna().all():
            df[col] = num
    return df


def _read_pdf_tables(content: bytes) -> dict[str, pd.DataFrame]:
    """Extract tables from a PDF into DataFrames, one pseudo-sheet per table.

    Two strategies, tried in order:
    1. Grid tables (ruled lines). A table spanning multiple pages repeats its
       header on each page — tables with an identical header row are merged.
    2. Text-report fallback for line-printer style DMS reports (no ruled
       lines): detail rows grouped under a control header, with per-group
       subtotals. Produces a "Details" and a "Summary" pseudo-sheet.
    """
    import pdfplumber  # lazy import — only needed for PDF uploads

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        out = _extract_grid_tables(pdf)
        if not out:
            page_texts = [page.extract_text() or "" for page in pdf.pages]

    if not out:
        if not any(t.strip() for t in page_texts):
            raise HTTPException(
                400, "This PDF contains no extractable text — it looks like a scanned "
                     "image. Only text-based PDFs (system-generated reports) can be compared."
            )
        out = _parse_text_report(page_texts)
    if not out:
        raise HTTPException(
            400, "No tables detected in this PDF. Only PDFs containing data tables can be compared."
        )
    return out


def _extract_grid_tables(pdf) -> dict[str, pd.DataFrame]:
    def _clean(cell) -> str:
        # pdfplumber keeps line-wraps inside cells as '\n'
        return " ".join(str(cell).split()) if cell is not None else ""

    grouped: dict[tuple, list[list[str]]] = {}
    for page in pdf.pages:
        for tbl in page.extract_tables():
            rows = [[_clean(c) for c in row] for row in tbl]
            rows = [r for r in rows if any(r)]          # drop blank rows
            if len(rows) < 2:
                continue
            header = tuple(rows[0])
            body = [r for r in rows[1:] if tuple(r) != header]
            grouped.setdefault(header, []).extend(body)

    out: dict[str, pd.DataFrame] = {}
    for i, (header, body) in enumerate(grouped.items(), start=1):
        cols, seen = [], {}
        for j, c in enumerate(header):
            c = c or f"Column {j + 1}"
            n = seen.get(c, 0)
            seen[c] = n + 1
            cols.append(c if n == 0 else f"{c}.{n}")
        width = len(cols)
        body = [r[:width] + [""] * (width - len(r)) for r in body]
        out[f"Table {i}"] = _coerce_numeric(pd.DataFrame(body, columns=cols))
    return out


# Line-printer report parsing (e.g. a DMS GL detail report):
#
#   GL3250R              Dealer Name                7/01/26     ← page header
#   ========================================================
#   Account 205   CONTRACTS IN TRANSIT ...  Balance 677105.62
#   Control Date  Jrn Document Reference Description  Amount   ← column header
#   ========================================================
#   A2600210 CONDER, NATHAN JON        3VVSX7B21RM066810       ← group header
#           6/27/26 VSU A2600210 A2600210 CONDER ...  15420.51 ← detail row
#                                                     15420.51 ← group subtotal
#   ...
#           Account Totals: Units: 22                677105.62

_DATE_TOKEN = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")
_AMOUNT_TOKEN = re.compile(r"^-?[\d,]+\.\d{2}-?$")
_SEPARATOR_LINE = re.compile(r"^[=\-_*]{10,}$")


def _norm_amount(tok: str) -> str:
    # Some DMS reports print negatives with a trailing minus: "100.00-"
    return f"-{tok[:-1]}" if tok.endswith("-") else tok


def _parse_text_report(page_texts: list[str]) -> dict[str, pd.DataFrame]:
    pages = [[ln.strip() for ln in t.splitlines() if ln.strip()] for t in page_texts]

    # Column header, e.g. "Control Date Jrn Document Reference Description Amount".
    # Fields between Date and the trailing Amount are single tokens in a detail
    # row, except the one right before Amount (the description) which absorbs
    # the remaining, variable-width text.
    ctrl_col, fixed_cols, desc_col, amt_col = "Control", [], "Description", "Amount"
    for lines in pages:
        for ln in lines[:8]:
            toks = ln.split()
            low = [t.lower() for t in toks]
            if len(toks) >= 3 and low[-1] == "amount" and "date" in low:
                di = low.index("date")
                if di > 0:
                    ctrl_col = toks[0]
                between = toks[di + 1:-1]
                if between:
                    fixed_cols, desc_col = between[:-1], between[-1]
                break
        else:
            continue
        break

    name_col, ref_col = f"{ctrl_col} Name", f"{ctrl_col} Reference"
    details: list[dict] = []
    summary: list[dict] = []
    account = ""
    group: dict | None = None

    for lines in pages:
        seps = 0
        for ln in lines:
            if _SEPARATOR_LINE.match(ln):
                seps += 1
                continue
            if seps < 2:            # page-header block (repeated on every page)
                if ln.lower().startswith("account ") and account == "":
                    account = ln.split()[1]
                continue

            toks = ln.split()
            if toks[0].lower() == "account":
                if len(toks) > 1 and toks[1].rstrip(":").lower() == "totals":
                    group = None    # grand-total line — not a data row
                else:
                    account = toks[1]
                continue

            # Bare amount → subtotal of the current group
            if len(toks) == 1 and _AMOUNT_TOKEN.match(toks[0]):
                if group is not None:
                    row = {"Account": account, **group, "Balance": _norm_amount(toks[0])}
                    if summary and summary[-1].get(ctrl_col) == group[ctrl_col]:
                        summary[-1] = row      # keep the last subtotal per group
                    else:
                        summary.append(row)
                continue

            # Date-led line ending in an amount → detail row
            if _DATE_TOKEN.match(toks[0]) and _AMOUNT_TOKEN.match(toks[-1]) and len(toks) >= 2:
                row = {"Account": account, **(group or {}), "Date": toks[0]}
                mid = toks[1:-1]
                for i, c in enumerate(fixed_cols):
                    row[c] = mid[i] if i < len(mid) else ""
                row[desc_col] = " ".join(mid[len(fixed_cols):])
                row[amt_col] = _norm_amount(toks[-1])
                details.append(row)
                continue

            # Anything else starts a new group: control number, name, and an
            # optional trailing reference (VIN / document number).
            ref, rest = "", toks[1:]
            if rest and re.fullmatch(r"[A-Za-z0-9\-]{6,}", rest[-1]) \
                    and any(ch.isdigit() for ch in rest[-1]):
                ref, rest = rest[-1], rest[:-1]
            group = {ctrl_col: toks[0], name_col: " ".join(rest), ref_col: ref}

    if not details:
        return {}

    def _frame(rows: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(rows)
        if "Account" in df.columns and (df["Account"] == "").all():
            df = df.drop(columns="Account")
        return _coerce_numeric(df.fillna(""))

    out = {"Details": _frame(details)}
    if summary:
        out["Summary"] = _frame(summary)
    return out


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "file"
    lower = name.lower()
    try:
        if lower.endswith(".csv"):
            _read_csv_bytes(content)          # validate it parses
            sheets, ext = [CSV_SHEET], "csv"
        elif lower.endswith(".pdf"):
            sheets, ext = list(_read_pdf_tables(content).keys()), "pdf"
        else:
            sheets = pd.ExcelFile(io.BytesIO(content)).sheet_names
            ext = "xlsx"
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            400, "Could not read this file. Upload an Excel workbook (.xlsx/.xls), a CSV (.csv) or a PDF (.pdf)."
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
    df = load_df(file_id, sheet)
    return {"columns": df.columns.tolist(), "rows": len(df), "cols": len(df.columns)}


# ── Internal helpers used by compare router & scheduler ─────────────────────────

def load_df(file_id: str, sheet: str) -> pd.DataFrame:
    content, ext = _require(file_id)
    if ext == "csv":
        return _read_csv_bytes(content)
    if ext == "pdf":
        tables = _read_pdf_tables(content)
        if sheet in tables:
            return tables[sheet]
        raise HTTPException(400, f"Table '{sheet}' not found in this PDF. Available: {', '.join(tables)}")
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
    # If we can't read the schedules we can't know which files are pinned —
    # abort rather than risk deleting a file an enabled schedule depends on.
    try:
        from app.services import schedule_store
        pinned = set()
        for s in schedule_store.get_all():
            pinned.add(s.get("file_axel_id"))
            pinned.add(s.get("file_dms_id"))
    except Exception:
        return 0

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
