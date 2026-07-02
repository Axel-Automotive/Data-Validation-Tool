from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import break_store

router = APIRouter()


class BreakUpdate(BaseModel):
    status: str | None = None       # open | acknowledged | resolved
    comment: str | None = None
    assignee: str | None = None


@router.get("/")
def list_breaks(client_id: str | None = None, status: str | None = None,
                include_cleared: bool = False):
    return break_store.get_all(client_id=client_id, status=status,
                               include_cleared=include_cleared)


@router.get("/diff")
def run_diff(client_id: str):
    """Run-to-run diff for a client's latest run: new vs cleared breaks."""
    return break_store.run_diff(client_id)


@router.patch("/{break_id}")
def update_break(break_id: str, body: BreakUpdate):
    updated = break_store.update(break_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Break not found")
    return updated
