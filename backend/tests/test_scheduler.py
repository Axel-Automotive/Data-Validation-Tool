"""Scheduler observability helpers (T3.1)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import scheduler  # noqa: E402


def test_result_rate_prefers_available_metric():
    assert scheduler._result_rate({"metrics": {"match_rate": 88}}) == 88
    assert scheduler._result_rate({"metrics": {"pass_rate": 50}}) == 50
    assert scheduler._result_rate({"metrics": {}}) is None


def test_avg_rate_ignores_missing():
    conds = [{"metrics": {"match_rate": 80}}, {"metrics": {"pass_rate": 100}}, {"metrics": {}}]
    assert scheduler._avg_rate(conds) == 90.0
    assert scheduler._avg_rate([{"metrics": {}}]) is None


def test_trailing_avg_rate_uses_recent_scheduled_runs(monkeypatch):
    fake_runs = [
        {"client_id": "c1", "kind": "scheduled", "summary": [{"metrics": {"match_rate": 90}}]},
        {"client_id": "c1", "kind": "scheduled", "summary": [{"metrics": {"match_rate": 100}}]},
        {"client_id": "c2", "kind": "scheduled", "summary": [{"metrics": {"match_rate": 10}}]},  # other client
        {"client_id": "c1", "kind": "manual",    "summary": [{"metrics": {"match_rate": 0}}]},   # not scheduled
    ]
    monkeypatch.setattr(scheduler.runs_store, "get_all", lambda: fake_runs)
    assert scheduler._trailing_avg_rate("c1") == 95.0     # (90 + 100) / 2
    assert scheduler._trailing_avg_rate("nobody") is None


def test_run_schedule_missing_is_graceful():
    assert scheduler.run_schedule("no-such-id") == {"ok": False, "status": "Schedule not found"}
