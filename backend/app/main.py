from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env (SMTP credentials etc.) before anything reads os.getenv.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.database import init_db
from app.db_migrate import run_migration
from app.routers import files, compare, clients, schedules, runs, shared
from app.services import scheduler
from app.services.excel_service import cleanup_old_results
from app.routers.files import cleanup_old_files


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()                   # create tables (SQLite by default; DATABASE_URL to override)
    run_migration()             # import legacy data/*.json on first boot, then back them up
    cleanup_old_results()       # drop result files older than the retention window
    cleanup_old_files()         # drop orphaned uploaded files older than the window
    scheduler.start()           # register all enabled schedules as background jobs
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(title="Data Validator API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clients.router,   prefix="/api/clients",   tags=["Clients"])
app.include_router(files.router,     prefix="/api/files",     tags=["Files"])
app.include_router(compare.router,   prefix="/api/compare",   tags=["Compare"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(runs.router,      prefix="/api/runs",      tags=["Runs"])
app.include_router(shared.router,    prefix="/api/shared-conditions", tags=["Shared"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# In production, serve the built frontend (frontend/dist) from the same origin so
# the API and UI share a host (no CORS / proxy needed). Skipped in dev when the
# Vite dev server is used and no build exists.
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")
