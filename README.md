# AXEL Validator

A data‑validation tool for reconciling AXEL company spreadsheets against DMS
(dealer management system) exports. Upload two files (**Excel `.xlsx/.xls` or
`.csv`**) — or pull the AXEL side live from a database/API — define reusable
validation **conditions** per client, run them on demand, schedule them to run
automatically, and email the resulting report.

---

## Features

- **Comparison types**
  - **Sheet Difference** — rows present in one file but missing in the other
  - **Stacked Comparison** — records matched side‑by‑side on a shared key
  - **Calculation Difference** — numeric delta between value columns
  - **Custom Rule** — a no‑code rule builder (join key + column checks with
    numeric/text operators and tolerances)
- **Clients & conditions** — save validation rules per client and run them all at once
- **Shared conditions** — rules that apply to every client, run before each client's
  own conditions (managed via `/api/shared-conditions`)
- **AXEL data sources (per-client SQL or API)** — instead of uploading an AXEL
  `.xlsx`, a client can pull its AXEL side live from its **own** SQL Server / Azure
  SQL database (a read-only SELECT query) **or** from an HTTP **API** endpoint
  ("one query = one report"). The `.xlsx` upload remains a fully supported option,
  chosen per run via a toggle on the AXEL side.
  - **API sources**: configure a base URL + auth (Bearer token, API-key header,
    query-param key, or none), then save endpoints (GET/POST) with `:name` params
    and a JSON path to the row array. Single-response only (no pagination yet).
  - Manage a client's DB connection and report queries under **Settings → AXEL Data
    Source** (with a live **Preview** that loads columns + a sample). On the
    **Dashboard**, switch the AXEL side to **Data source** and pick a query to run.
  - Per-client DB credentials are entered in the app and stored **encrypted at rest**
    (never in git-tracked `clients.json`); only read-only SELECT queries are allowed.
  - **Schedules can use a data source too** — a scheduled run pulls the AXEL side
    live from the DB/API (fixed params per schedule), so unattended runs need no
    fresh upload.
  - _Not yet: API pagination, dynamic/relative date params, result caching._
- **Email reports** — send the combined Excel report to a saved recipient list,
  with an editable subject (Microsoft 365 / SMTP)
- **Schedules** — run a client's validations automatically (e.g. weekdays at 8am)
  and email the report, unattended. The AXEL side can be an uploaded file **or** a
  live DB query (see AXEL data sources below)
- **Run history** — every run logged with downloadable reports
- **Reports persist to disk** and old artifacts are cleaned up automatically

---

## Project layout

```
backend/    FastAPI app (app/), data store (data/), tests (tests/)
frontend/   React + Vite + Tailwind UI (src/)
start.sh    Launch backend + frontend together for local dev
```

Application data (clients, conditions, schedules, runs, AXEL queries/connections)
is stored in a **database via SQLAlchemy** — a local **SQLite** file
(`backend/data/axel_validator.db`) by default, or any DB via the `DATABASE_URL`
env var (e.g. Azure SQL / PostgreSQL). Uploaded files and generated reports still
live on disk under `backend/data/files/` and `backend/data/results/`.

> **First-boot migration:** if legacy `backend/data/*.json` stores exist, they are
> imported into the database on startup and renamed to `*.json.bak` (kept as a
> backup). This is automatic and idempotent.

---

## Local development

Prerequisites: Python 3.11+, Node 18+.

```bash
# 1. Backend deps (one time)
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 2. Frontend deps (one time)
cd frontend && npm install && cd ..

# 3. Run both (backend :8000, frontend :5173)
./start.sh
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

### Tests

```bash
.venv/bin/python -m pytest backend/tests/ -q
```

---

## Email configuration

Email is optional. To enable it, copy the example env file and fill it in:

```bash
cp backend/.env.example backend/.env
```

```ini
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=you@axelautomotive.com
SMTP_PASSWORD=your-app-password    # M365 + MFA requires an app password
SMTP_FROM=                          # defaults to SMTP_USER
SMTP_FROM_NAME=AXEL Validator
```

Notes for Microsoft 365:
- Use an **app password** if the mailbox has MFA.
- **SMTP AUTH** must be enabled for the mailbox (a tenant admin setting).
- Verify with **Settings → Send test email**.

`backend/.env` is git‑ignored and never committed.

---

## Production (single container)

A multi‑stage `Dockerfile` builds the frontend and serves it from the backend
(same origin — no CORS/proxy needed).

```bash
docker build -t axel-validator .
docker run -p 8000:8000 \
  --env-file backend/.env \
  -v "$(pwd)/backend/data:/app/backend/data" \
  axel-validator
```

Open http://localhost:8000. The `-v` mount persists clients, schedules, runs,
files, and reports across restarts.

> The scheduler runs inside the backend process, so the container must stay up
> for schedules to fire. Schedule times use the container's local timezone.

## Azure App Service deployment

This repo is configured for the Linux App Service named `data-validator`.
GitHub Actions builds `frontend/dist`, tests the backend, and deploys the whole
app with the Azure publish profile.

Add the publish profile in GitHub:

1. Azure Portal -> App Service `data-validator` -> Download publish profile.
2. GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret.
3. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
4. Value: paste the entire publish profile XML.

Set these Azure App Service settings:

```ini
SCM_DO_BUILD_DURING_DEPLOYMENT=false
ENABLE_ORYX_BUILD=false
PORT=8000
WEBSITES_PORT=8000
PYTHONPATH=/home/site/wwwroot/python_packages/lib/site-packages:/home/site/wwwroot/backend
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=you@axelautomotive.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=
SMTP_FROM_NAME=AXEL Validator
```

Only the SMTP settings are app-specific secrets; omit them if email is not being
used yet. Set the App Service startup command to:

```bash
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

If the root URL opens as a browser "JSON View" with a FastAPI response instead
of the React website, the frontend build was not deployed. The GitHub Actions
workflow in `.github/workflows/main_data-validator.yml` fixes that by building
the Vite frontend before deployment.

Leave `WEBSITE_RUN_FROM_PACKAGE` unset for this app, because it writes uploaded
files and generated reports under `backend/data`.

---

## API (selected)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/clients/` | list / create clients |
| GET/POST | `/api/shared-conditions/` | list / create conditions shared by all clients |
| GET/PUT/DELETE | `/api/clients/{id}/axel-connection` | per-client AXEL DB connection (secrets masked) |
| POST | `/api/clients/{id}/axel-connection/test` | test a client's AXEL DB connection |
| GET/POST | `/api/clients/{id}/axel-queries` | list / create a client's report queries |
| POST | `/api/clients/{id}/axel-queries/{qid}/preview` | run a query (limited) → columns + sample |
| PUT | `/api/clients/{id}/email` | set recipients + subject |
| POST | `/api/compare/run-all` | run all conditions (optional `email: true`) |
| POST | `/api/compare/email/test` | send a test email |
| GET/POST | `/api/schedules/` | list / create schedules |
| POST | `/api/schedules/{id}/run` | run a schedule now |
| GET | `/api/runs/` | run history |
| GET | `/api/compare/download/{id}` | download a report |

Interactive docs: http://localhost:8000/docs
