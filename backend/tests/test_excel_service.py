"""Unit tests for the comparison engine — the heart of the product."""
import io
import sys
from pathlib import Path

import pandas as pd
import pytest
from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.excel_service import (  # noqa: E402
    run_sheet_difference, run_calc_difference, run_custom_rule,
    run_all_conditions, run_condition, get_result, _sanitize_sheet,
    _norm_series, _apply_filters,
)
from app.services import email_service  # noqa: E402
from fastapi import HTTPException  # noqa: E402


# ── Sheet difference ───────────────────────────────────────────────────────────

def test_sheet_diff_basic_match():
    a = pd.DataFrame({"K": ["1", "2", "3"]})
    b = pd.DataFrame({"K": ["1", "2", "4"]})
    r = run_sheet_difference(a, b, ["K"], ["K"])
    m = r["metrics"]
    assert m["matched"] == 2
    assert m["only_in_a"] == 1   # "3"
    assert m["only_in_b"] == 1   # "4"


def test_sheet_diff_int_vs_float_keys_match():
    # Same key stored as int in one file and float in the other must match.
    a = pd.DataFrame({"Stock": [1001, 1002, 1003]})
    b = pd.DataFrame({"Stock": [1001.0, 1002.0, 1003.0]})
    r = run_sheet_difference(a, b, ["Stock"], ["Stock"])
    assert r["metrics"]["matched"] == 3
    assert r["metrics"]["only_in_a"] == 0


def test_sheet_diff_unequal_columns_raises_400():
    a = pd.DataFrame({"K": [1], "V": [2]})
    with pytest.raises(HTTPException) as exc:
        run_sheet_difference(a, a, ["K"], ["K", "V"])
    assert exc.value.status_code == 400


# ── Calc difference ─────────────────────────────────────────────────────────────

def test_calc_diff_no_fanout_on_duplicate_keys():
    # Duplicate keys must NOT produce an N×M cartesian explosion.
    a = pd.DataFrame({"K": ["1", "1", "2"], "V": [10, 20, 30]})
    b = pd.DataFrame({"K": ["1", "1", "2"], "V": [5, 5, 5]})
    r = run_calc_difference(a, b, "AXEL", "DMS", "K", "V", "V")
    assert r["metrics"]["matched"] == 2          # not 5
    assert r["metrics"]["excluded_a"] >= 0       # never negative


def test_calc_diff_difference_value():
    a = pd.DataFrame({"K": ["x"], "V": [100]})
    b = pd.DataFrame({"K": ["x"], "V": [70]})
    r = run_calc_difference(a, b, "AXEL", "DMS", "K", "V", "V")
    assert r["metrics"]["matched"] == 1
    assert r["metrics"]["a_gt_b"] == 1


# ── Custom rule ─────────────────────────────────────────────────────────────────

def test_custom_rule_numeric_and_text():
    a = pd.DataFrame({"Deal": ["1", "2", "3"], "G": [100, 200, 300], "S": ["O", "C", "O"]})
    b = pd.DataFrame({"DealNo": ["1", "2", "3"], "R": [100, 205, 300], "S": ["O", "C", "C"]})
    cfg = {
        "key_axel": "Deal", "key_dms": "DealNo",
        "checks": [
            {"axel_col": "G", "dms_col": "R", "mode": "numeric", "op": "eq", "tolerance": 10},
            {"axel_col": "S", "dms_col": "S", "mode": "text", "op": "eq"},
        ],
    }
    r = run_custom_rule(a, b, cfg)
    m = r["metrics"]
    assert m["matched"] == 3
    assert m["passed"] == 2     # deal 3 fails the text check (O vs C)
    assert m["failed"] == 1


def test_custom_rule_requires_key_and_checks():
    a = pd.DataFrame({"K": ["1"]})
    with pytest.raises(HTTPException):
        run_custom_rule(a, a, {"key_axel": "", "checks": []})


# ── Helpers ──────────────────────────────────────────────────────────────────────

def test_sanitize_sheet_strips_newlines():
    assert "\n" not in _sanitize_sheet("Stock\nNo.")
    assert _sanitize_sheet("a/b:c*[d]") and "/" not in _sanitize_sheet("a/b:c*[d]")
    assert _sanitize_sheet("") == "Sheet"


def test_norm_series_handles_float_and_nan():
    s = pd.Series([1001.0, 1002.0, None])
    out = list(_norm_series(s, na=""))
    assert out[0] == "1001" and out[1] == "1002" and out[2] == ""


# ── Combined report ──────────────────────────────────────────────────────────────

def test_run_all_combined_report_full_rows_numeric():
    n = 150
    a = pd.DataFrame({"Deal": [str(i) for i in range(n)], "G": [i for i in range(n)]})
    b = pd.DataFrame({"Deal": [str(i) for i in range(n)], "R": [i for i in range(n)]})
    conds = [{
        "id": "c1", "name": "Rule", "type": "custom_rule", "enabled": True,
        "config": {"key_axel": "Deal", "checks": [
            {"axel_col": "G", "dms_col": "R", "mode": "numeric", "op": "eq", "tolerance": 0}]},
    }]
    rid, results = run_all_conditions(conds, a, b)
    assert results[0]["metrics"]["matched"] == n
    data, _ = get_result(rid)
    wb = load_workbook(io.BytesIO(data))
    ws = next(s for s in wb.worksheets if "Rule" in s.title)
    assert ws.max_row - 1 == n                       # not capped at 100
    assert isinstance(ws.cell(row=2, column=2).value, (int, float))


# ── Row filtering ──────────────────────────────────────────────────────────────

def test_apply_filters_eq_and_numeric():
    df = pd.DataFrame({"Status": ["Active", "Closed", "Active"], "Amount": [10, -5, 20]})
    out = _apply_filters(df, [{"col": "Status", "op": "eq", "value": "Active"}], None)
    assert list(out["Amount"]) == [10, 20]
    out = _apply_filters(df, [{"col": "Amount", "op": "gt", "value": 0}], None)
    assert list(out["Status"]) == ["Active", "Active"]


def test_apply_filters_in_and_blank():
    df = pd.DataFrame({"Branch": ["North", "South", "", "North"]})
    out = _apply_filters(df, [{"col": "Branch", "op": "in", "value": ["North"]}], None)
    assert len(out) == 2
    out = _apply_filters(df, [{"col": "Branch", "op": "not_blank", "value": ""}], None)
    assert len(out) == 3


def test_apply_filters_row_range_is_1_based_inclusive():
    df = pd.DataFrame({"K": list(range(1, 11))})        # 1..10
    out = _apply_filters(df, None, {"start": 2, "end": 5})
    assert list(out["K"]) == [2, 3, 4, 5]


def test_run_condition_applies_filters_before_compare():
    # Only "Active" rows should be compared, so the inactive mismatch is ignored.
    a = pd.DataFrame({"K": ["1", "2", "3"], "S": ["Active", "Active", "Closed"]})
    b = pd.DataFrame({"K": ["1", "2", "9"], "S": ["Active", "Active", "Closed"]})
    cfg = {"col_pairs": [{"axel": "K", "dms": "K"}],
           "filters": {"axel": [{"col": "S", "op": "eq", "value": "Active"}],
                       "dms":  [{"col": "S", "op": "eq", "value": "Active"}]}}
    r = run_condition(a, b, "sheet_diff", cfg)
    assert r["metrics"]["matched"] == 2
    assert r["metrics"]["only_in_a"] == 0      # "3"/"9" filtered out


# ── Failing-cell highlighting ────────────────────────────────────────────────────

def test_custom_rule_highlights_failing_cells():
    a = pd.DataFrame({"Deal": ["1", "2"], "G": [100, 200]})
    b = pd.DataFrame({"Deal": ["1", "2"], "R": [100, 999]})   # deal 2 fails
    cfg = {"key_axel": "Deal", "checks": [
        {"axel_col": "G", "dms_col": "R", "mode": "numeric", "op": "eq", "tolerance": 0}]}
    r = run_custom_rule(a, b, cfg)
    assert "Failing Columns" in r["preview"]["results"]["columns"]
    data, _ = get_result(r["result_id"])
    wb = load_workbook(io.BytesIO(data))
    ws = wb["Rule_Results"]
    # The failing row's source cells must be red-filled; the passing row must not.
    hdr = {c.value: i + 1 for i, c in enumerate(ws[1])}
    def filled(row, name):
        return ws.cell(row=row, column=hdr[name]).fill.fgColor.rgb in ("FFFECACA", "00FECACA")
    assert filled(3, "G [AXEL]") and filled(3, "R [DMS]")     # row 3 = deal 2
    assert not filled(2, "G [AXEL]")                          # row 2 = deal 1 passed


# ── Email helpers ────────────────────────────────────────────────────────────────

def test_clean_recipients_dedupes_and_validates():
    assert email_service.clean_recipients(["A@x.com", "a@x.com", " b@y.com "]) == ["A@x.com", "b@y.com"]
    with pytest.raises(HTTPException):
        email_service.clean_recipients(["notanemail"])
