"""Run trend & regression detection (T3.2)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import runs_store  # noqa: E402


def _run(ts, client_id, name, rate):
    return {"ts": ts, "client_id": client_id, "client_name": "Acme",
            "summary": [{"name": name, "validation_name": "", "type": "calc_diff",
                         "metrics": {"match_rate": rate}, "error": None}]}


def test_condition_trends_flags_regression(monkeypatch):
    # get_all() is newest-first; the latest run drops well below the earlier avg.
    runs = [_run("t3", "c1", "Deal", 60),
            _run("t2", "c1", "Deal", 95),
            _run("t1", "c1", "Deal", 98)]
    monkeypatch.setattr(runs_store, "get_all", lambda: runs)
    trends = runs_store.condition_trends("c1")
    assert len(trends) == 1
    s = trends[0]
    assert s["runs"] == 3
    assert s["latest_rate"] == 60
    assert s["baseline_rate"] == 96.5           # (95 + 98) / 2
    assert s["regression"] is True
    # points are oldest → newest
    assert [p["rate"] for p in s["points"]] == [98, 95, 60]


def test_condition_trends_stable_not_flagged(monkeypatch):
    runs = [_run("t2", "c1", "Deal", 99), _run("t1", "c1", "Deal", 100)]
    monkeypatch.setattr(runs_store, "get_all", lambda: runs)
    assert runs_store.condition_trends("c1")[0]["regression"] is False


def test_condition_trends_filters_by_client(monkeypatch):
    runs = [_run("t1", "c1", "Deal", 90), _run("t1", "c2", "Other", 10)]
    monkeypatch.setattr(runs_store, "get_all", lambda: runs)
    trends = runs_store.condition_trends("c1")
    assert len(trends) == 1 and trends[0]["client_id"] == "c1"
