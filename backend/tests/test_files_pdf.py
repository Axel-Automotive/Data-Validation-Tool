"""PDF upload support — table extraction into pseudo-sheets."""
from pathlib import Path

import pandas as pd
import pytest
from fastapi import HTTPException

from app.routers.files import _parse_text_report, _read_pdf_tables

FIXTURE = Path(__file__).parent / "fixtures" / "sample_tables.pdf"


@pytest.fixture(scope="module")
def tables():
    return _read_pdf_tables(FIXTURE.read_bytes())


def test_detects_both_tables(tables):
    assert list(tables.keys()) == ["Table 1", "Table 2"]


def test_multipage_table_merged_on_repeated_header(tables):
    t1 = tables["Table 1"]
    # 60 data rows span two pages; the repeated header must not appear as data.
    assert len(t1) == 60
    assert t1.columns.tolist() == ["Invoice No", "Customer", "Amount", "Status"]
    assert not (t1["Invoice No"] == "Invoice No").any()


def test_numeric_columns_coerced(tables):
    t1, t2 = tables["Table 1"], tables["Table 2"]
    # "1,234.50"-style strings become numbers so calc/rule comparisons work.
    assert pd.api.types.is_numeric_dtype(t1["Amount"])
    assert pd.api.types.is_numeric_dtype(t2["Total"])
    assert t2["Total"].tolist() == [1200, 845]


# ── Line-printer text reports (DMS GL-style, no ruled lines) ────────────────────

PAGE_1 = """\
GL9999R                       Demo Motors, Inc.                   7/01/26 2:56:32
DEMO                          Detail Standard As of 6/26                  Page 1
========================================================================================
Account 205      CONTRACTS IN TRANSIT     Controlled By: Control Number Balance 300.00
Control Date  Jrn Document Reference Description             Amount
========================================================================================
A1001 ALPHA, ANNA                        VIN00000000000001
        6/27/26 VSU A1001 A1001 ALPHA, ANNA   150.00
                                              150.00
B2002 BRAVO, BOB                         VIN00000000000002
        6/26/26 VSU B2002 B2002 BRAVO, BOB    200.00
"""

PAGE_2 = """\
GL9999R                       Demo Motors, Inc.                   7/01/26 2:56:32
DEMO                          Detail Standard As of 6/26                  Page 2
========================================================================================
Account 205      CONTRACTS IN TRANSIT     Controlled By: Control Number Balance 300.00
Control Date  Jrn Document Reference Description             Amount
========================================================================================
        6/26/26 VSU B2002 B2002 BRAVO, BOB/FEE 50.00-
                                              150.00
       Account Totals: Units: 2               300.00
"""


@pytest.fixture(scope="module")
def report():
    return _parse_text_report([PAGE_1, PAGE_2])


def test_text_report_details(report):
    d = report["Details"]
    assert len(d) == 3
    assert d["Control"].tolist() == ["A1001", "B2002", "B2002"]
    # group context carries across the page break; trailing minus → negative
    assert d["Amount"].tolist() == [150.00, 200.00, -50.00]
    assert d["Control Reference"].iloc[0] == "VIN00000000000001"
    assert (d["Account"] == 205).all()


def test_text_report_summary(report):
    s = report["Summary"]
    assert len(s) == 2
    # B2002's subtotal lands on page 2 and replaces nothing — one row per control
    assert s["Balance"].tolist() == [150.00, 150.00]
    # the Account Totals grand-total line is not a data row
    assert not (s["Control"] == "Account").any()


def test_text_report_without_detail_rows_is_empty():
    assert _parse_text_report(["Just a letter.\nNothing tabular here."]) == {}


def test_pdf_without_tables_raises_400():
    # Minimal valid empty PDF (no tables).
    empty = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF"
    )
    with pytest.raises(HTTPException) as exc:
        _read_pdf_tables(empty)
    assert exc.value.status_code == 400
