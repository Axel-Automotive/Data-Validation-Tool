# AXEL Validator — Research Report & Enhancement Findings

> Prepared for review by Manoj Kumar Bonu. **No code was changed.** This is a
> research + planning artifact. Implementation waits for explicit go-ahead.
> Companion doc: `IMPLEMENTATION_PLAN.md`.

---

## 1. What the tool does today (verified from code)

A FastAPI + React app that reconciles two Excel files (AXEL vs DMS). The engine
(`backend/app/services/excel_service.py`) supports four comparison types, all
saved per-client as reusable **conditions**, runnable on demand, on a schedule,
or emailed:

| Type | What it does | Column control | Source |
|------|--------------|----------------|--------|
| Sheet Difference | Rows in one file missing from the other | ✅ column *pairs* | `excel_service.py:99` |
| Stacked Comparison | Side-by-side match on one key, colour-coded | ⚠️ one key, all columns shown | `excel_service.py:152` |
| Calculation Difference | Numeric delta on a value column | ✅ key + 1 value each | `excel_service.py:255` |
| Custom Rule | Join key + N column checks (numeric/text, ops, tolerance) | ✅ per-check columns | `excel_service.py:366` |

Output is one styled `.xlsx`: a purple **Summary** sheet + one sheet per
condition (`run_all_conditions`, `excel_service.py:501`). Supporting features:
clients, shared conditions, schedules (`scheduler.py`), email (Microsoft 365 /
SMTP), run history, and disk persistence with auto-cleanup.

### Confirmed gaps (relative to your asks and the research)
1. **No row filtering anywhere.** Every comparison runs on all rows. (Your "compare only few rows" need.)
2. **No result-sheet preview.** Users can't see the output layout before running. (Your preview need.)
3. **Cell-level pinpointing is partial.** Custom Rule flags failing *rows* and adds a `Δ` column, but does not highlight the exact failing *cell*. (Your "see specific column and row" need.)
4. **Tolerance is absolute-only**, single value — no percentage, no severity tiers.
5. **1:1 matching only** — `drop_duplicates(key)` silently drops duplicate keys (`excel_service.py:289`, `399`); no many-to-1 / aggregate matching.
6. **Header assumed on row 0** — `parse(sheet)` has no `header=`/`skiprows=` (`files.py:67`); files with title rows above the header break.
7. **No structured run logging / failure alerts** for unattended scheduled runs.

---

## 2. Research findings (24 verified claims, adversarially checked)

Full machine output: workflow `wf_07353062-e53`. Confidence + vote shown.

### Rule builders & matching
- **No-code matching rules are the category standard** (high, 3-0). Define which key/columns join two datasets, exact-or-tolerance per attribute, and **cardinality 1:1 → many:many + adjustment**. Sources: Oracle ARC (primary), Numeric, Ledge.
- **Tolerances should be absolute *or* percentage, with severity tiers** (high, 3-0). DQOps default pattern: Warning 0.0% / Error 1.0% / Fatal user-set. Oracle: "tolerance limit… numerical value or a percentage." Per-account/per-field materiality reduces noise.
- **Group/aggregate matching** (high, 3-0). DQOps groups via GROUP BY and compares column metrics — sum, min, max, mean, null/not-null/distinct counts — between a "tested" and a "reference" (source-of-truth) table. Lets a summarised DMS export reconcile against detailed spreadsheets.
- **Declarative, versionable rules** (high, 3-0). GX (JSON/YAML expectation suites), dbt (generic tests + singular SQL that passes on zero rows), Soda (SodaCL). Reusable suites are the proven model.
- **Fuzzy matching exists but mechanics under-documented** (open question). Used by SolveXia, NetSuite for non-identical keys (VINs, names, part numbers). DataLadder confirms token/edit-distance scoring with thresholds.

### Output / report design
- **Auto-generated human-readable reports with RAG status tied to SLAs** (high, 3-0) — Red=breached, Amber=at-risk, Green=on-track. **Caveat:** colour must be paired with icon/label/% (≈8% colour-blindness). Sources: NeoXam, GX Data Docs.
- **Break/exception reports** sliced by type, age, materiality, assignee, reconciliation; daily break summaries (high, 3-0). NeoXam.
- **Audit trail** logging every action/change/resolution with timestamps + per-break comments, structured + exportable (high, 3-0). NeoXam, Hyperbots.

### Automation
- **Scheduled unattended runs are an established pattern** (high, 3-0). GX-in-Airflow operators; Trintech Adra "daily reconciliations." Validates your scheduler approach.
- **Robust logging + alerting required** (high, 3-0). Structured JSON logs, levels (INFO/WARN/ERROR), timestamps, concrete specifics ("failed to parse 12 records in file X"), and anomaly alerts (job 50% slower than usual, 3 consecutive failures, validation errors over threshold). Source: Milvus + heavy corroboration.

### Differentiators (medium — feature existence confirmed, efficacy is vendor-marketing)
- AI-drafted variance/break explanations (Numeric); auto tie-out & approval within materiality; AI/fuzzy matching + real-time dashboards (SolveXia); deterministic engines auto-handling timing/FX/reversals (Ledge); auto-profiling / auto-test generation (GX ExpectAI).

### Domain validation (medium, 2-1)
- "DMS is a system of record, not a system of truth" — DMS doesn't validate *accuracy* of entered data; figures aggregated from factory reports, banking, F&I, parts, service carry undetected errors. This is exactly the pain daily reconciliation addresses. (Weakest-sourced claim; directionally supports the product.)

### Refuted (3-0, excluded)
- "Dealership accounting departments uniquely lack tooling" — refuted.

### Caveats
Vendor-marketing efficacy claims (AI accuracy) are aspirational, not benchmarked. GX has moved toward Python-authored expectations in Core 1.x. Re-verify specific product features before relying on them.

---

## 3. How findings map to your three asks

| Your ask | Finding that backs it | Plan item |
|----------|----------------------|-----------|
| "Compare only few columns **and rows**" | Row/column filtering is standard in every rule builder | **P1: Row filtering** |
| "How would the resulted sheet look" (preview) | Auto-generated, human-readable result reports; show before run | **P2: Result-sheet preview** |
| "See specific column and row" | Cell-level highlighting + break reports | **P3: Failing-cell highlighting** |

Plus higher-value researched additions (percentage/severity tolerances,
aggregate matching, run logging + alerts, RAG summary) detailed in
`IMPLEMENTATION_PLAN.md`.

---

## 4. Sources (selected, by quality)
- **Primary:** Oracle Account Reconciliation match-rule docs; Astronomer/Airflow GX operators.
- **Vendor/secondary:** DQOps reconciliation checks; Trintech Adra daily reconciliation; NeoXam dashboards/audit-trail; Soda SodaCL; dbt data tests; Great Expectations.
- **Best-practice secondary:** Milvus ETL logging/monitoring; DataLadder fuzzy matching.
- **Domain:** dealershipguy.com (DMS "system of record not truth").
