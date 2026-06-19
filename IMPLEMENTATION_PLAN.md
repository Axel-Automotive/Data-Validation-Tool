# AXEL Validator — Implementation Plan

> **Status: AWAITING GO-AHEAD. No code changed yet.** Authored for Manoj's review.
> Each item lists exact files, functions, config shapes, and effort. Items are
> independent — approve all, some, or reorder. Companion: `RESEARCH_REPORT.md`.

Legend: 🟢 small (≤1 file, hours) · 🟡 medium (2–4 files) · 🔴 large (multi-file + UI + tests)

---

## P1 — Per-condition row filtering 🟡  *(your explicit ask; biggest gap)*

**Goal:** restrict any condition to a subset of rows (e.g. `Branch = Downtown`,
`Amount > 0`, or rows 2–500) on either/both files, before comparison.

**Config shape** (stored in the existing flexible `Condition.config` dict —
no model migration needed; `models.py:18`):
```jsonc
"filters": {
  "axel": [ { "col": "Status", "op": "eq",  "value": "Active" },
            { "col": "Amount", "op": "gt",  "value": 0 } ],
  "dms":   [ { "col": "Branch", "op": "in",  "value": ["Downtown","North"] } ],
  "row_range_axel": { "start": 2, "end": 500 },   // 1-based, optional
  "row_range_dms":  null
}
```
Ops: `eq, ne, gt, lt, gte, lte, in, not_in, contains, not_contains, is_blank, not_blank`.
Combined with AND (matches existing Custom Rule semantics).

**Backend changes**
- `excel_service.py`: add `_apply_filters(df, filters, row_range) -> df` helper
  (mirror operator style of `_NUMERIC_OPS` / `_text_op`). Use `_find_col` for
  resolution and `_norm_series` semantics for text.
- `excel_service.py:run_condition` (≈ line 464): apply filters to `df_axel` /
  `df_dms` **once at the top**, before the type dispatch — so all four types
  inherit filtering for free. Pass `config.get("filters", {})`.
- Report the effect: add `"rows_after_filter_a/b"` into each type's `metrics`
  so the Summary sheet shows "N of M rows compared."

**Frontend changes**
- `ConditionEditor.jsx`: add a collapsible "Row filters (optional)" panel above
  the per-type config. Reuse `ColInput` for the column, a `Select` for the op,
  a `TextInput` for the value. One block for AXEL, one for DMS, plus optional
  row-range inputs. Drives `config.filters`.
- No API change — filters ride inside `config`, which already round-trips through
  `clients.py` upsert and `run-condition` / `run-all`.

**Tests:** `backend/tests/` — filter by eq/gt/in, row_range, empty-after-filter
(should surface a clean "0 rows match filter" rather than a misleading 100% match).

---

## P2 — Result-sheet preview in Conditions 🟡  *(your explicit ask)*

**Goal:** show what the output sheet will look like while configuring, before any run.

**Phase A — static layout preview (frontend-only, no backend):**
- New `frontend/src/components/settings/ResultPreview.jsx`. Given `type` +
  `config`, render a sample using the existing `DataTable.jsx` with 2–3 fake rows:
  - `sheet_diff` → two mini-tables `In_A_Not_in_B` / `In_B_Not_in_A` using the
    chosen `col_pairs` as headers.
  - `stacked` → `Source | <key> | PairStatus | …` with the yellow/blue row
    colours rendered (mirror `excel_service.py:217-233`).
  - `calc_diff` → `<key> | val [AXEL] | val [DMS] | Difference`.
  - `custom_rule` → `<key> | … | Check 1: … | Δ1 (…) | Result(Pass/Fail)`, plus a
    note "+ separate Failures tab" (mirror `excel_service.py:425-441`).
- Mount inside `ConditionEditor.jsx` config panel (`ConditionEditor.jsx:359`),
  collapsible "Preview output layout."

**Phase B — live preview on real data (optional, adds backend):**
- `compare.py`: add `POST /compare/preview-condition` taking the in-progress
  config + file/sheet ids, running `run_condition` on `df.head(N)` (N≈20). Return
  only the JSON `preview` block (engine already produces `preview` for every
  type — `excel_service.py:141,244,317,453`); never persist a result file.
- `ConditionEditor.jsx`: "Preview with my data" button → renders returned rows.

**Effort:** Phase A is the quick win and fully covers "how would the resulted
sheet look." Phase B is a nice-to-have.

---

## P3 — Failing-cell highlighting in the output 🟡  *(your explicit ask)*

**Goal:** in Custom Rule output, colour the exact failing cell red and surface its
location, so you jump straight to the problem column+row.

**Backend (`excel_service.py:run_custom_rule`, ≈ line 437):**
- Already imports `openpyxl` styling. After writing `Rule_Results`, post-process
  the workbook (same approach as Stacked, `excel_service.py:217`):
  - For each check `i`, the per-row Pass/Fail is known. Map check `i` →
    its two source columns `<axel_col> [AXEL]` / `<dms_col> [DMS]`.
  - Where a check failed, fill **both** contributing cells red
    (`PatternFill FECACA`) and the row's `Result` cell.
  - Add a `Failing Cells` column listing A1 addresses (e.g. `D47, G47`) per row.
- Add `freeze_panes="A2"` + `auto_filter` to `Rule_Results` (Stacked has these,
  this sheet doesn't).
- Extend to `calc_diff`: highlight `Difference` cells outside tolerance.

**Optional UI:** in the JSON `preview`, add a `failed_cells` list so the on-screen
`DataTable` can tint failing cells too (small `DataTable.jsx` change to accept a
cell-class map).

---

## P4 — Percentage + severity tolerances 🟢→🟡  *(research: Oracle/DQOps standard)*

**Goal:** tolerance as absolute **or** %, with Warning/Error tiers to cut noise.

**Config (per Custom Rule check):**
```jsonc
{ "axel_col": "...", "dms_col": "...", "mode": "numeric", "op": "eq",
  "tolerance": 10, "tolerance_pct": 1.0,        // either/both
  "severity": "error" }                          // "warning" | "error"
```

**Backend (`excel_service.py`):** extend `_NUMERIC_OPS` (line 336) so `eq/ne` also
accept a percentage band: `abs(a-b) <= max(tol, tol_pct/100 * abs(b))`. Add a
`Severity` column and count `warnings` vs `errors` in `metrics`. Reference
behaviour confirmed: Oracle (`numeric value or a percentage`), DQOps (Warn 0% /
Error 1%).

**Frontend:** `CustomRuleForm` (`ConditionEditor.jsx:188`) — add a "% tolerance"
input next to the existing tolerance, and a Warning/Error select.

---

## P5 — Aggregate / column-metric checks 🔴  *(research: DQOps GROUP BY matching)*

**Goal:** reconcile at differing granularity — e.g. "sum of `Amount` per `Branch`
in AXEL == sum in DMS (±tol)", or compare row counts / distinct counts. Handles
the many-to-1 case that current `drop_duplicates` silently discards
(`excel_service.py:289,399`).

**New comparison type `agg_compare`:**
- Config: `{ group_by_axel, group_by_dms, metric: "sum|count|mean|min|max|nunique",
  value_axel, value_dms, tolerance, tolerance_pct }`.
- New `run_agg_compare(df_a, df_b, config)` in `excel_service.py`; register in
  the `run_condition` dispatcher (line 464) and add a `TYPES` entry +
  `AggCompareForm` in `ConditionEditor.jsx:5`.
- Output: per-group `<group> | metric [AXEL] | metric [DMS] | Difference | Result`.

---

## P6 — Structured run logging + failure alerts 🟡  *(research: unattended-run best practice)*

**Goal:** make scheduled (unattended) runs observable; alert on failure/anomaly.

- `scheduler.py` / `runs_store.py`: emit structured JSON log lines per run —
  level, timestamp, client, condition counts, **rows processed**, failures,
  duration. (Milvus pattern: concrete specifics, not "error occurred.")
- Alerting: when a scheduled run errors, or a condition's match-rate drops far
  below its trailing average, send an alert email (reuse `email_service.py`).
  Anomaly rule of thumb from research: 3 consecutive failures, or job 50% slower.
- Surface last run status (already partly in `Schedule.last_status`,
  `models.py:82`) on the Schedules page with RAG colour + icon/label
  (accessibility: never colour-only).

---

## P7 — Header row / sheet-region selection 🟢  *(gap: header assumed row 0)*

**Goal:** support files with title rows above the header.

- `files.py:get_columns` (line 56) and `load_df` (line 65): accept optional
  `header_row` (skiprows) + persist per file/sheet. `parse(sheet, header=header_row)`.
- UI: a "header is on row N" selector in `FileSelectionBar.jsx` when columns look
  wrong (offer a 5-row raw preview to pick the header).

---

## P8 — RAG summary dashboard + audit-friendly report 🟡  *(research: report design)*

- `run_all_conditions` Summary sheet (`excel_service.py:529`): add a **Status**
  column with RAG (Pass/At-risk/Fail) driven by pass-rate thresholds, paired with
  a text label + icon (not colour-only). Add a totals row.
- Add a `Run Info` sheet: timestamp, file names, sheets, row counts, filters
  applied, per-condition outcome — a lightweight audit trail (NeoXam pattern).

---

## Suggested sequencing

1. **P1 row filtering** + **P2A preview** + **P3 cell highlighting** — your three
   direct asks; together they make conditions feel complete. (~1 focused pass.)
2. **P4 tolerances** + **P8 RAG/audit summary** — cheap, high polish.
3. **P6 logging/alerts** — needed before relying on daily unattended runs.
4. **P5 aggregate matching** + **P7 header selection** — larger, do when needed.
5. Later/optional: fuzzy key matching, AI-drafted variance notes (research:
   medium-confidence differentiators; validate value before building).

## Risk / compatibility notes
- All config-only changes (P1, P2, P4) are **backward-compatible** — existing
  saved conditions have no `filters`/new keys and behave exactly as today.
- P5 adds a new `type`; old reports unaffected.
- No data migration required anywhere (`config` is a free-form dict — `models.py:18`).
- Each item ships with `backend/tests/` coverage before it's considered done.
