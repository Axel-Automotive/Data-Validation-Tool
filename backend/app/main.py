from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env (SMTP credentials etc.) before anything reads os.getenv.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.routers import files, compare, clients, schedules
from app.services import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
