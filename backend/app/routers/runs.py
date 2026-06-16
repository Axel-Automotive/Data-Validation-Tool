from fastapi import APIRouter

from app.services import runs_store

router = APIRouter()


@router.get("/")
def list_runs():
    return runs_store.get_all()
