"""Break persistence, carry-forward, clearing, and reopen (Tier 4)."""
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import database  # noqa: E402


@pytest.fixture(autouse=True)
def _memdb():
    """Isolated in-memory DB per test so break state doesn't leak."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    database.engine = eng
    database.SessionLocal = sessionmaker(bind=eng, autoflush=False, autocommit=False)
    database.init_db()
    yield


def _brk(key, break_type="unmatched_axel", cond="Deals"):
    return {"break_type": break_type, "key_label": key, "detail": {},
            "condition_name": cond, "validation_name": "", "type": "calc_diff"}


def _sync(breaks, cond_names=("Deals",)):
    from app.services import break_store
    ran = [(c, "", "calc_diff") for c in cond_names]
    return break_store.sync("c1", "run1", breaks, ran)


def test_new_breaks_then_carry_forward_then_clear():
    from app.services import break_store
    # Run 1: two new breaks.
    d = _sync([_brk("A"), _brk("B")])
    assert d["new"] == 2 and d["open"] == 2

    # Run 2: "A" persists (carried forward, not new), "B" gone → cleared.
    d = _sync([_brk("A")])
    assert d["new"] == 0 and d["cleared"] == 1 and d["open"] == 1
    open_now = break_store.get_all("c1")
    assert [b["key_label"] for b in open_now] == ["A"]
    a = open_now[0]
    assert a["first_seen"] is not None and a["age_days"] == 0


def test_resolved_break_reopens_when_it_recurs():
    from app.services import break_store
    _sync([_brk("A")])
    bid = break_store.get_all("c1")[0]["id"]
    break_store.update(bid, {"status": "resolved", "comment": "duplicate entry"})
    assert break_store.get_all("c1") == []            # resolved hidden from open list

    # It comes back in a later run → reopened.
    d = _sync([_brk("A")])
    assert d["new"] == 0                               # same signature, not new
    reopened = break_store.get_all("c1")
    assert len(reopened) == 1 and reopened[0]["status"] == "open"
    assert reopened[0]["comment"] == "duplicate entry"  # comment preserved


def test_run_diff_reports_new_and_cleared(monkeypatch):
    from app.services import break_store, runs_store
    # Run 1 introduces A and B under run id "run1".
    monkeypatch.setattr(runs_store, "get_all",
                        lambda: [{"id": "run1", "client_id": "c1", "ts": "t1"}])
    break_store.sync("c1", "run1", [_brk("A"), _brk("B")], [("Deals", "", "calc_diff")])
    d = break_store.run_diff("c1")
    assert d["run_id"] == "run1"
    assert {b["key_label"] for b in d["new"]} == {"A", "B"}
    assert d["cleared"] == [] and d["still_open"] == 2

    # Run 2 (id "run2") clears B and adds C.
    monkeypatch.setattr(runs_store, "get_all",
                        lambda: [{"id": "run2", "client_id": "c1", "ts": "t2"},
                                 {"id": "run1", "client_id": "c1", "ts": "t1"}])
    break_store.sync("c1", "run2", [_brk("A"), _brk("C")], [("Deals", "", "calc_diff")])
    d = break_store.run_diff("c1")
    assert d["run_id"] == "run2"
    assert {b["key_label"] for b in d["new"]} == {"C"}        # only C is new in run2
    assert {b["key_label"] for b in d["cleared"]} == {"B"}    # B cleared in run2
    assert d["still_open"] == 2                               # A and C


def test_clearing_scoped_to_conditions_that_ran():
    from app.services import break_store
    # Two conditions each have a break.
    _sync([_brk("A", cond="Deals"), _brk("X", cond="Fees")], cond_names=("Deals", "Fees"))
    assert len(break_store.get_all("c1")) == 2
    # A run of ONLY "Deals" with no breaks clears A but leaves Fees' X untouched.
    d = _sync([], cond_names=("Deals",))
    assert d["cleared"] == 1
    remaining = [b["key_label"] for b in break_store.get_all("c1")]
    assert remaining == ["X"]
