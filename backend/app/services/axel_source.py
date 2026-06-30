"""Execute a client's AXEL report query and return a pandas DataFrame.

Phase 1 supports DB sources (SQL Server / Azure SQL via pymssql). Queries are
user-authored, so this enforces SELECT-only at the app layer in addition to the
read-only DB account that operators must configure (the real guardrail).

Heavy deps (SQLAlchemy, pymssql) are imported lazily so the app keeps running
for file-only clients that never configure a DB source.
"""
from __future__ import annotations

import re

import pandas as pd
from fastapi import HTTPException

# Engines are expensive to build and hold a connection pool; cache one per
# client, keyed by a signature of the connection config so updates rebuild it.
_engines: dict[str, tuple[str, object]] = {}

DEFAULT_ROW_LIMIT = 50_000
PREVIEW_ROW_LIMIT = 100
QUERY_TIMEOUT_S = 30

# Statements/keywords that must never appear in user-authored SELECT queries.
# Defense in depth — the read-only DB login is the primary protection.
_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|CREATE|GRANT|REVOKE|"
    r"EXEC|EXECUTE|SP_|XP_|INTO|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE)\b",
    re.IGNORECASE,
)


# ── SQL validation ──────────────────────────────────────────────────────────

def validate_sql(sql: str) -> str:
    """Return cleaned SQL or raise HTTPException(400) if not a safe single SELECT."""
    import sqlparse

    cleaned = (sql or "").strip().rstrip(";").strip()
    if not cleaned:
        raise HTTPException(400, "Query SQL is empty.")

    statements = [s for s in sqlparse.parse(cleaned) if str(s).strip()]
    if len(statements) != 1:
        raise HTTPException(400, "Only a single SELECT statement is allowed.")

    stmt = statements[0]
    stmt_type = stmt.get_type()
    is_select = stmt_type == "SELECT" or re.match(r"(?is)^\s*WITH\b.*\bSELECT\b", cleaned)
    if not is_select:
        raise HTTPException(400, f"Only SELECT queries are allowed (got {stmt_type}).")

    if _FORBIDDEN.search(cleaned):
        raise HTTPException(400, "Query contains a disallowed keyword. Only read-only SELECTs are permitted.")

    return cleaned


# ── Engine / connection ──────────────────────────────────────────────────────

def _signature(conn: dict) -> str:
    return "|".join(str(conn.get(k, "")) for k in ("host", "port", "database", "username", "password"))


def _engine_for(client_id: str, conn: dict):
    from sqlalchemy import create_engine
    from sqlalchemy.engine import URL

    sig = _signature(conn)
    cached = _engines.get(client_id)
    if cached and cached[0] == sig:
        return cached[1]
    if cached:
        try:
            cached[1].dispose()
        except Exception:
            pass

    url = URL.create(
        "mssql+pymssql",
        username=conn.get("username"),
        password=conn.get("password"),
        host=conn.get("host"),
        port=int(conn.get("port") or 1433),
        database=conn.get("database"),
    )
    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"timeout": QUERY_TIMEOUT_S, "login_timeout": 10},
    )
    _engines[client_id] = (sig, engine)
    return engine


def invalidate(client_id: str) -> None:
    """Drop a cached engine (call after a client's connection changes)."""
    cached = _engines.pop(client_id, None)
    if cached:
        try:
            cached[1].dispose()
        except Exception:
            pass


# ── Execution ─────────────────────────────────────────────────────────────────

def _bind_params(query: dict, params: dict | None) -> dict:
    """Coerce supplied values against the query's declared params (only declared
    names are bound, preventing stray inputs)."""
    declared = {p["name"]: p for p in query.get("params", [])}
    out: dict = {}
    params = params or {}
    for name, spec in declared.items():
        val = params.get(name, spec.get("default"))
        if val in (None, "") and spec.get("required"):
            raise HTTPException(400, f"Missing required parameter: {name}")
        if val in (None, ""):
            out[name] = None
            continue
        ptype = spec.get("type", "text")
        try:
            if ptype == "int":
                out[name] = int(val)
            elif ptype == "float":
                out[name] = float(val)
            else:  # text, date — bound as strings; the driver/DB casts dates.
                out[name] = str(val)
        except (TypeError, ValueError):
            raise HTTPException(400, f"Parameter {name} is not a valid {ptype}.")
    return out


def run_query(client_id: str, conn: dict, query: dict, params: dict | None = None,
              limit: int | None = None) -> pd.DataFrame:
    """Run a client's query against its DB and return up to `limit` rows."""
    if conn is None:
        raise HTTPException(400, "No AXEL connection configured for this client.")
    if (query.get("source_kind") or "db") != "db":
        raise HTTPException(400, "Only DB sources are supported in this version.")
    if (query.get("db_mode") or "sql") != "sql":
        raise HTTPException(400, "Only SQL (SELECT) queries are supported in this version.")

    from sqlalchemy import text

    sql = validate_sql(query.get("sql", ""))
    bound = _bind_params(query, params)
    cap = limit or query.get("row_limit") or DEFAULT_ROW_LIMIT

    try:
        engine = _engine_for(client_id, conn)   # may fail if the driver is missing
        with engine.connect() as c:
            result = c.execute(text(sql), bound)
            cols = list(result.keys())
            rows = result.fetchmany(int(cap))
    except HTTPException:
        raise
    except ModuleNotFoundError:
        raise HTTPException(503, "SQL Server driver (pymssql) is not installed on the server.")
    except Exception as e:
        raise HTTPException(502, f"AXEL query failed: {e}")

    return pd.DataFrame(rows, columns=cols)


def preview(client_id: str, conn: dict, query: dict, params: dict | None = None) -> dict:
    """Small run used by the UI to fetch columns + a sample for building rules."""
    df = run_query(client_id, conn, query, params, limit=PREVIEW_ROW_LIMIT)
    return {
        "columns": df.columns.tolist(),
        "rows": len(df),
        "cols": len(df.columns),
        "sample": df.head(20).astype(object).where(pd.notnull(df.head(20)), None).to_dict("records"),
    }


def test_connection(client_id: str, conn: dict) -> dict:
    """Attempt a trivial query to verify a client's connection works."""
    from sqlalchemy import text
    try:
        engine = _engine_for(client_id, conn)
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return {"ok": True, "message": "Connection successful."}
    except Exception as e:
        return {"ok": False, "message": str(e)}
