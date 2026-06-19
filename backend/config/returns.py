"""Period-return calculation + top/bottom ranking over the Blob NAV history.

Given the serverless views (see config.duckdb_session), this computes, for every
fund and a requested period, the return between the fund's LATEST NAV and the NAV
at the start of the window.

Methodology (matches ET Money / Value Research / Google Finance)
----------------------------------------------------------------
Every window is anchored to the fund's OWN latest nav_date — not the calendar
'today', which may be a non-trading or not-yet-published day. That latest NAV is
the END of the window for every fund.

The START NAV is found by snapping toward the window boundary:

  * Trailing periods (1M/3M/6M/1Y/3Y/5Y): the boundary (latest − interval) is
    EXCLUSIVE, so we snap FORWARD to the first NAV STRICTLY AFTER it. A "1M"
    return therefore runs from the NAV just after one month ago to the latest
    NAV — the published convention.

  * YTD: the boundary (Jan 1 of the latest NAV's year) is INCLUSIVE, so we snap
    forward to the first NAV ON OR AFTER it.

Periods
-------
    1M, 3M, 6M, YTD, 1Y      -> absolute return       (nav_now/nav_then - 1)
    3Y, 5Y                   -> annualised CAGR        ((nav_now/nav_then)^(1/yrs) - 1)

A fund only ranks for a period if it has a NAV at/after the start boundary AND
that NAV is strictly before the latest one (i.e. enough history with a real
window). Funds without it are excluded from that period's board. With the
current dataset (2021-06 .. 2026-06) 5Y will usually be empty.

Public API
----------
    PERIODS                          ordered list of period codes
    period_returns(con, period, ...) -> list[dict] sorted best-first
    rankings(con, period, n, ...)    -> {"top": [...], "bottom": [...], meta}
    returns_for_codes(con, codes, periods) -> {scheme_code: {nav, returns,...}}
"""
from __future__ import annotations

from typing import Any

import duckdb

# code -> (SQL interval expression relative to the fund's latest nav_date,
#          years for annualisation or None for absolute return)
# YTD is special-cased (date_trunc) below.
_PERIOD_DEFS: dict[str, tuple[str | None, float | None]] = {
    "1M":  ("INTERVAL 1 MONTH",  None),
    "3M":  ("INTERVAL 3 MONTH",  None),
    "6M":  ("INTERVAL 6 MONTH",  None),
    "YTD": (None,                None),   # handled specially
    "1Y":  ("INTERVAL 1 YEAR",   None),
    "3Y":  ("INTERVAL 3 YEAR",   3.0),
    "5Y":  ("INTERVAL 5 YEAR",   5.0),
}

PERIODS: list[str] = list(_PERIOD_DEFS)


def _start_boundary_expr(period: str) -> str:
    """SQL expression for the window's START boundary, relative to ln.nav_date
    (the fund's own latest NAV date)."""
    if period == "YTD":
        # First day of the latest NAV's calendar year (inclusive boundary).
        return "date_trunc('year', ln.nav_date)"
    interval, _ = _PERIOD_DEFS[period]
    return f"ln.nav_date - {interval}"


def _build_sql(period: str) -> str:
    """Construct the ranking SQL for one period.

    For each fund:
      ln       = its latest NAV (date + value)            -- from latest_nav
      then_nav = the START NAV, found by snapping toward the window boundary:
                   * trailing periods -> first NAV STRICTLY AFTER  (latest - interval)
                   * YTD              -> first NAV ON OR AFTER      Jan 1
    Return is computed only when then_nav exists, is > 0, and its date is
    strictly before the latest NAV date (a real, non-degenerate window).
    Optional :category / :fund_house filters are applied via parameters.
    """
    _, years = _PERIOD_DEFS[period]
    boundary = _start_boundary_expr(period)

    # Trailing windows snap FORWARD past an EXCLUSIVE boundary; YTD's boundary
    # (Jan 1) is INCLUSIVE.
    boundary_cmp = ">=" if period == "YTD" else ">"

    if years is None:
        ret_expr = "ROUND((nav_now / nav_then - 1.0) * 100.0, 2)"
    else:
        ret_expr = (
            f"ROUND((POWER(nav_now / nav_then, 1.0/{years}) - 1.0) * 100.0, 2)"
        )

    return f"""
WITH base AS (
    SELECT
        ln.scheme_code,
        ln.scheme_name,
        ln.fund_house,
        ln.category,
        ln.nav_date            AS as_of_date,
        ln.nav                 AS nav_now,
        {boundary}             AS start_boundary
    FROM latest_nav ln
    WHERE (? IS NULL OR upper(ln.category)   = upper(?))
      AND (? IS NULL OR upper(ln.fund_house) = upper(?))
),
priced AS (
    SELECT
        b.*,
        t.nav      AS nav_then,
        t.nav_date AS then_date
    FROM base b
    LEFT JOIN LATERAL (
        SELECT h.nav, h.nav_date
        FROM nav_history h
        WHERE h.scheme_code = b.scheme_code
          AND h.nav_date {boundary_cmp} b.start_boundary
          AND h.nav_date   < b.as_of_date
        ORDER BY h.nav_date ASC
        LIMIT 1
    ) t ON TRUE
)
SELECT
    scheme_code,
    scheme_name,
    fund_house,
    category,
    as_of_date,
    then_date,
    nav_now,
    nav_then,
    {ret_expr} AS return_pct
FROM priced
WHERE nav_then IS NOT NULL AND nav_then > 0
ORDER BY return_pct DESC
"""


def period_returns(
    con: duckdb.DuckDBPyConnection,
    period: str,
    *,
    category: str | None = None,
    fund_house: str | None = None,
) -> list[dict[str, Any]]:
    """All funds (matching optional filters) with their `period` return,
    best-first. Funds without enough history for the period are omitted."""
    if period not in _PERIOD_DEFS:
        raise ValueError(f"Unknown period {period!r}. Valid: {PERIODS}")

    sql = _build_sql(period)
    params = [category, category, fund_house, fund_house]
    cur = con.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def rankings(
    con: duckdb.DuckDBPyConnection,
    period: str,
    n: int = 10,
    *,
    category: str | None = None,
    fund_house: str | None = None,
) -> dict[str, Any]:
    """Top-N and bottom-N performers for a period.

    `rows` is already sorted best-first, so top = head, bottom = tail reversed
    (worst-first) for a natural 'bottom performers' display.
    """
    rows = period_returns(
        con, period, category=category, fund_house=fund_house
    )
    top = rows[:n]
    bottom = list(reversed(rows[-n:])) if rows else []
    return {
        "period": period,
        "fundsRanked": len(rows),
        "asOf": rows[0]["as_of_date"].isoformat() if rows else None,
        "filters": {"category": category, "fundHouse": fund_house},
        "top": top,
        "bottom": bottom,
    }


def returns_for_codes(
    con: duckdb.DuckDBPyConnection,
    scheme_codes: list[str],
    periods: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Latest NAV + per-period returns for a SPECIFIC set of scheme codes.

    Used to enrich an uploaded portfolio: the dashboard passes the matched
    codes, gets back {scheme_code: {nav, nav_date, returns:{period:pct}}}.
    Codes not present in nav_history are simply absent from the result, so the
    caller can mark them 'no NAV data'.
    """
    if not scheme_codes:
        return {}
    periods = periods or PERIODS
    codes = sorted(set(str(c) for c in scheme_codes if c))

    # Latest NAV per requested code.
    placeholders = ", ".join("?" for _ in codes)
    latest = con.execute(
        f"""
        SELECT scheme_code, scheme_name, fund_house, category, nav_date, nav
        FROM latest_nav
        WHERE scheme_code IN ({placeholders})
        """,
        codes,
    ).fetchall()

    out: dict[str, dict[str, Any]] = {}
    for code, name, house, cat, ndate, nav in latest:
        out[str(code)] = {
            "scheme_code": str(code),
            "scheme_name": name,
            "fund_house": house,
            "category": cat,
            "nav": nav,
            "nav_date": ndate.isoformat() if ndate else None,
            "returns": {},
        }

    # Period returns: reuse the ranking SQL but keep only our codes.
    found = set(out)
    for period in periods:
        for row in period_returns(con, period):
            sc = str(row["scheme_code"])
            if sc in found:
                out[sc]["returns"][period] = row["return_pct"]
    return out
