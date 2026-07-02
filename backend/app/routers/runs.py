from fastapi import APIRouter

from app.services import runs_store

router = APIRouter()


@router.get("/")
def list_runs():
    return runs_store.get_all()


@router.get("/trends")
def condition_trends(client_id: str | None = None):
    """Per-condition rate history over time + regression flags."""
    return runs_store.condition_trends(client_id)
