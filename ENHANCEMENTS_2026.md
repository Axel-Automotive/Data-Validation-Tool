# AXEL Validator — Functional Enhancement Roadmap (2026)

> **Status: RESEARCH + PLAN. No code changed.** Scope is *functionality only* —
> no UI redesign or restyling. New capabilities may need a small control added to
> an existing panel, but nothing here changes the look/feel.
> Supersedes the P1–P3 items in `IMPLEMENTATION_PLAN.md` (now shipped).

---

## 0. Current state (verified in code, July 2026)

Since the last plan the app has grown a lot. Confirmed **already implemented**:

| Capability | Where | Status |
|---|---|---|
| Per-condition **row filtering** (eq/ne/gt/lt/in/contains/blank + row range) | `excel_service._apply_filters` | ✅ done (was P1) |
| **Result-sheet preview** | `frontend/.../ResultPreview.jsx` | ✅ done (was P2) |
| **Failing-cell highlighting** + "Failing Columns" col | `excel_service.run_custom_rule` | ✅ done (was P3) |
| CSV + PDF ingestion (incl. line-printer PDF reports) | `files.py` | ✅ done |
| AXEL data source: per-client **SQL / HTTP API** + date macros + param binding | `axel_source.py` | ✅ done |
| DB-backed storage (SQLite→any via `DATABASE_URL`), encrypted creds | `database.py`, `crypto_util.py` | ✅ done |
| Scheduler (cron, `SCHEDULER_TIMEZONE`), email reports, run history | `scheduler.py`, `runs_store.py` | ✅ done |

Four comparison types: **Sheet Difference, Stacked, Calculation Difference,
Custom Rule** (`run_condition`, `excel_service.py:565`).

**Still open** from the old plan: P4 (%/severity tolerances), P5 (aggregate
matching), P6 (structured logging/alerts), P7 (header-row selection), P8 (RAG /
audit sheet). These are folded into the tiers below with fresh, higher-priority
findings on top.

---

> **Progress (2026-07-02):** Tier 1 COMPLETE — T1.1, T1.2, T1.3, T1.4, T1.5 all
> shipped with tests. Next up: Tier 2 (%/severity tolerances, fuzzy) or Tier 3
> (logging/alerts, run-trend, RAG/audit sheet).

## Tier 1 — Reconciliation correctness (highest value)

These are genuine gaps where the tool currently **hides or loses the very data a
reconciliation is meant to surface**. Industry sources agree: unmatched
items/"breaks" are the core deliverable, and 1:many / many:1 matching is table
stakes ([Numeric](https://www.numeric.io/blog/transaction-reconciliation-guide),
[Ledge](https://www.ledge.co/content/the-definitive-guide-to-automated-reconciliation-with-ai),
[ReconArt](https://www.reconart.com/blog/fuzzy-matching-in-financial-reconciliation/)).

### T1.1 — Export the unmatched ("break") items in Calc Difference & Custom Rule 🟢🟡  ★ top pick
**Problem.** `run_calc_difference` (`excel_service.py:359`) and `run_custom_rule`
(`:472`) do an **inner join** and write only the *matched* rows. The unmatched
keys are counted (`excluded_a/b`, `unmatched_a/b`) but **never listed anywhere**.
For a reconciliation tool that's backwards — the unmatched rows are usually the
actual problem (a deal in AXEL missing from DMS, or vice-versa).
Note the inconsistency: Sheet Difference *does* emit `In_A_Not_in_B` /
`In_B_Not_in_A` (`:197`) and Stacked emits `<name>-only` sheets (`:279`) — only
these two types hide it.
**Change.** After the inner merge, also compute left-only / right-only keys and
write `Unmatched_AXEL` and `Unmatched_DMS` sheets (mirror Sheet Difference).
Add them to the on-screen `preview` block too. No config/schema change.
**Value:** high. **Effort:** small–medium, one file.

### T1.2 — Duplicate-key handling: stop silently dropping, offer aggregation 🟡🔴
**Problem.** Both `calc_diff` and `custom_rule` call `drop_duplicates(KEY)`
(`:356/357`, `:465/466`) keeping only the *first* row per key. If AXEL has a key
twice (common: multiple journal lines per deal), the 2nd+ are silently discarded
and the metrics are computed on a subset. This is a correctness/data-loss issue.
**Change (staged):**
- **Stage A (small):** report `duplicate_keys_a/b` in metrics and a
  `Duplicate_Keys` sheet so drops are visible, not silent.
- **Stage B (medium):** per-condition "on duplicate key" strategy —
  `first | sum | mean | max`. For money reconciliation `sum` is usually right.
- **Stage C = T1.3 below** (true many:1 aggregate matching).
**Value:** high. **Effort:** A small, B medium.

### T1.3 — Aggregate / group-by matching (new `agg_compare` type) 🔴
**Problem.** No way to reconcile at different granularity — e.g. *sum of `Amount`
per `Account` in AXEL == sum in the DMS summary line (±tol)*. The PDF DMS report
we now parse is exactly this shape (detail lines + per-control subtotals).
**Change.** New comparison type: config
`{group_by, metric: sum|count|mean|min|max|nunique, value_axel, value_dms,
tolerance, tolerance_pct}`; `run_agg_compare()` in `excel_service.py`; register in
the `run_condition` dispatcher (`:565`) and add a form entry. Output per group:
`<group> | metric[AXEL] | metric[DMS] | Difference | Result`.
**Value:** high (directly serves the DMS-summary-vs-AXEL-detail case).
**Effort:** large.

### T1.4 — Composite (multi-column) join keys 🟡
**Problem.** Every join key is a **single column** (`key_col_a`, `control_col_a`,
`key_axel` — all scalars). Real reconciliation often needs `Date + Account` or
`Deal + LineType`. Today you'd have to pre-concatenate columns by hand.
**Change.** Accept a list of key columns; build a normalized composite key
internally (join `_norm_series` of each part). Backward-compatible: a string key
still works. Touches `calc_diff`, `custom_rule`, `stacked`, `sheet_diff` key
resolution.
**Value:** high. **Effort:** medium.

### T1.5 — Key canonicalization (dates, leading zeros, case, whitespace) 🟡
**Problem.** `_norm_series` (`:82`) normalizes whole-number floats and trims text,
but keys that are **dates in different formats** (`6/27/26` vs `2026-06-27`) or
IDs with **leading zeros** / case differences won't join, producing false breaks.
**Change.** Optional per-key normalization flags: `parse_date`, `strip_leading_zeros`,
`uppercase`, `alnum_only`. Apply in the key-normalization path. Report how many
rows each rule affected so it's auditable.
**Value:** high (kills a big class of false mismatches). **Effort:** medium.

---

> **Progress (2026-07-02):** Tier 2 COMPLETE — T2.1 (%/severity tolerances) and
> T2.2 (fuzzy key matching) shipped with tests.

## Tier 2 — Tolerances & matching depth

### T2.1 — Percentage + severity tolerances 🟢🟡  *(old P4; research-backed)*
Absolute-only today (`_NUMERIC_OPS`, `:398`). Add `tolerance_pct` and a
`severity: warning|error` tier so `eq/ne` pass when
`abs(a-b) <= max(tol, tol_pct/100*abs(b))`; count warnings vs errors separately.
Oracle/DQOps standard. **Effort:** small–medium.

### T2.2 — Fuzzy key matching (names, VINs, part numbers) 🔴
Optional token/edit-distance match with a threshold for keys that don't align
exactly. Explicitly opt-in per condition (fuzzy matching is powerful but can
create false pairs). Confirmed a category standard
([ReconArt](https://www.reconart.com/blog/fuzzy-matching-in-financial-reconciliation/)).
**Effort:** large; do after T1.x land.

---

> **Progress (2026-07-02):** Tier 3 COMPLETE — T3.1, T3.2, T3.3 shipped with tests.

## Tier 3 — Observability & trust for unattended runs

### T3.1 — Structured run logging + failure/anomaly alerts 🟡  *(old P6)*
`scheduler.py` already has a `logging` logger. Emit one structured line per run
(client, #conditions, rows processed, failures, duration). Alert by email when a
scheduled run errors, or when a condition's match-rate drops far below its
trailing average (research rule of thumb: 3 consecutive failures, or job ≥50%
slower). Reuse `email_service`. **Effort:** medium.

### T3.2 — Run trend & regression detection 🟡
`runs_store` already persists per-run summaries. Add an endpoint that returns
match-rate/break-count **over time per condition**, and flag regressions ("Deal
match rate 98%→71% since last run"). This is the "reconciliation health at a
glance" dashboards call for — data/API only, renders in existing run views.
**Effort:** medium.

### T3.3 — RAG summary + Run Info / audit sheet 🟢  *(old P8)*
Add a **Status** column (Pass / At-risk / Fail by pass-rate threshold, with text
label + icon, never colour-only) and a totals row to the Summary sheet
(`run_all_conditions`, `:637`). Add a `Run Info` sheet: timestamp, source files,
sheets, row counts, filters applied, per-condition outcome — a lightweight audit
trail. **Effort:** small.

---

> **Progress (2026-07-02):** Tier 4 COMPLETE. T4.1 break/exception management
> (persist across runs, ageing, status open/ack/resolved, comments, auto-clear,
> reopen; Breaks page; `/api/breaks`). T4.2 run-to-run diff (`/api/breaks/diff`
> + a "Since last run: N new / M cleared" strip on the Breaks page).
>
> **All four tiers of this roadmap are now shipped.** Remaining optional work:
> Tier 5 ingestion (header-row selection, large-file caching, OCR).

## Tier 4 — Reconciliation workflow (differentiator; larger)

### T4.1 — Exception / break management 🔴
Persist individual breaks (from T1.1) with state: `open | resolved | acknowledged`,
a free-text comment, an assignee, and an age. Carry **unresolved** breaks forward
between runs so recurring items are visible and ageing tracked. This is the single
biggest feature separating "diff tool" from "reconciliation platform"
([Kani](https://kanipayments.com/blog/when-reconciliation-breaks-mastering-exception-management/),
[Numeric](https://www.numeric.io/blog/account-reconciliation-software)).
**Effort:** large (new table + endpoints; fits existing DB layer).

### T4.2 — Run-to-run diff ("what changed since yesterday") 🟡🔴
Compare this run's breaks to the previous run for the same condition: **new
breaks**, **cleared breaks**, **still-open**. Powerful for daily runs and depends
only on T1.1 + run persistence. **Effort:** medium–large.

---

## Tier 5 — Ingestion & scale (as needed)

- **T5.1 Header-row / skiprows selection** 🟢 *(old P7)* — files with title rows
  above the header currently mis-parse (`parse(sheet)` assumes row 0). Add an
  optional `header_row` per file/sheet with a 5-row raw preview to pick it.
- **T5.2 Large-file handling** 🟡 — whole file is read into memory and re-parsed
  on every columns/preview/run call. If DMS exports get large, add parsed-frame
  caching keyed by file id, and consider chunked reads. Measure first.
- **T5.3 OCR for scanned PDFs** 🟡 — current PDF path needs extractable text;
  scanned exports return a clear "no text" error. Add optional OCR (Tesseract)
  only if scanned reports are actually in scope.

---

## Suggested sequencing

1. **T1.1 (export unmatched) + T3.3 (RAG/audit sheet)** — small, immediate value;
   T1.1 alone materially improves every calc/rule report.
2. **T1.4 composite keys + T1.5 key canonicalization + T2.1 tolerances** — kill
   the biggest sources of false breaks; mostly config-compatible.
3. **T1.2 duplicate handling → T1.3 aggregate matching** — unlocks DMS-summary vs
   AXEL-detail reconciliation.
4. **T3.1 logging/alerts + T3.2 trend** — make daily unattended runs trustworthy.
5. **T4.1 break management + T4.2 run diff** — the platform-grade differentiators.
6. T5.x and T2.2 fuzzy — when the underlying need is confirmed.

## Compatibility notes
- T1.1, T1.4, T1.5, T2.1, T3.3 ride inside the free-form `Condition.config` dict
  and existing metrics — **backward compatible**, no data migration.
- T1.3 adds a new `type`; T4.1 adds a new table — both additive, old data
  unaffected.
- Every item ships with `backend/tests/` coverage before it's "done."

## Sources
- [Numeric — transaction reconciliation guide](https://www.numeric.io/blog/transaction-reconciliation-guide) ·
  [Numeric — reconciliation software 2026](https://www.numeric.io/blog/account-reconciliation-software)
- [Ledge — automated reconciliation with AI](https://www.ledge.co/content/the-definitive-guide-to-automated-reconciliation-with-ai)
- [ReconArt — fuzzy matching](https://www.reconart.com/blog/fuzzy-matching-in-financial-reconciliation/)
- [Kani — exception management](https://kanipayments.com/blog/when-reconciliation-breaks-mastering-exception-management/)
- [Entries — bank reconciliation exceptions](https://www.tryentries.com/blog/bank-reconciliation-exceptions-framework)
