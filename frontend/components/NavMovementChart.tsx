"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  FundNavHistoryResponse,
  FundReturnsResponse,
  NavPeriod,
  NavPoint,
  ReturnPeriod,
} from "@/lib/types";
import {
  getFundNavHistory,
  getFundReturns,
  getMarketIndexes,
  getMarketIndexesHistory,
  type MarketIndexInfo,
  type MarketIndexHistorySeries,
} from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const PERIODS: NavPeriod[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"];

const RETURN_PERIODS: ReturnPeriod[] = ["1M", "3M", "6M", "1Y"];

const MARKET_INDEX_COLORS: Record<string, string> = {
  "NIFTY 50": "#e34948",
  "NIFTY 100": "#eda100",
  "NIFTY 500": "#008300",
  "NIFTY MIDCAP 150": "#4a3aa7",
  "NIFTY SMLCAP 250": "#eb6834",
};

const GROWTH_BASE = 100;

function marketIndexDataKey(symbol: string): string {
  return `idx_${symbol.replace(/\s+/g, "_")}`;
}

function formatReturn(value: number | null): string {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

const fmtNav = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const fmtDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : fmtDate.format(date);
}

function formatChartDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function rebasedIndexValues(
  points: { date: string; close: number }[],
  dates: string[],
  base: number,
): Record<string, number | null> {
  if (points.length === 0 || dates.length === 0) return {};
  const byDate = new Map(points.map((p) => [p.date, p.close]));
  let lastClose: number | null = null;
  let baseClose: number | null = null;
  const out: Record<string, number | null> = {};
  for (const d of dates) {
    const exact = byDate.get(d);
    if (exact != null) lastClose = exact;
    if (lastClose == null) { out[d] = null; continue; }
    if (baseClose == null || baseClose === 0) baseClose = lastClose;
    out[d] = (lastClose / baseClose) * base;
  }
  return out;
}

interface ChartPoint extends NavPoint {
  displayDate: string;
}

function CustomTooltip({
  active,
  payload,
  comparing,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: Record<string, unknown> }>;
  comparing?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartPoint & Record<string, unknown>;
  return (
    <div style={{
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      padding: "8px 12px",
      border: "1px solid #ddd6c8",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      minWidth: 140,
    }}>
      <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#6c757a" }}>
        {formatDate(row.date as string)}
      </p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          style={{
            margin: "2px 0",
            fontSize: "13px",
            fontWeight: 600,
            color: entry.color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {entry.name}: {comparing ? `${entry.value?.toFixed(2)}` : fmtNav.format(entry.value)}
        </p>
      ))}
    </div>
  );
}


export function NavMovementChart({
  fundId,
  accent,
}: {
  fundId: string;
  accent: string;
}) {
  const [period, setPeriod] = useState<NavPeriod>("1Y");
  const [data, setData] = useState<FundNavHistoryResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [returns, setReturns] = useState<FundReturnsResponse | null>(null);

  const [marketIndexes, setMarketIndexes] = useState<MarketIndexInfo[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [marketSeries, setMarketSeries] = useState<MarketIndexHistorySeries[]>([]);
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);

  const comparing = selectedSymbols.length > 0;

  useEffect(() => {
    let active = true;
    getFundReturns(fundId)
      .then((r) => { if (active) setReturns(r); })
      .catch(() => { if (active) setReturns(null); });
    getMarketIndexes()
      .then((r) => { if (active) setMarketIndexes(r.indexes); })
      .catch(() => { if (active) setMarketIndexes([]); });
    return () => { active = false; };
  }, [fundId]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getFundNavHistory(fundId, period)
      .then((response) => {
        if (!active) return;
        setData(response);
        setStatus("ok");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => { active = false; };
  }, [fundId, period]);

  const points: ChartPoint[] = (data?.points ?? []).map((p) => ({
    ...p,
    displayDate: formatChartDate(p.date),
  }));

  const startDate = points.at(0)?.date;

  useEffect(() => {
    if (!startDate || selectedSymbols.length === 0) {
      setMarketSeries([]);
      return;
    }
    let cancelled = false;
    getMarketIndexesHistory(startDate, selectedSymbols)
      .then((res) => { if (!cancelled) setMarketSeries(res.series); })
      .catch(() => { if (!cancelled) setMarketSeries([]); });
    return () => { cancelled = true; };
  }, [startDate, selectedSymbols]);

  const chartData = useMemo((): Record<string, unknown>[] => {
    if (!comparing || points.length === 0) return points as Record<string, unknown>[];

    const dates = points.map((p) => p.date);
    const baseNav = points[0].nav;
    const bySymbol = new Map<string, Record<string, number | null>>();
    for (const series of marketSeries) {
      bySymbol.set(
        series.symbol,
        rebasedIndexValues(series.points, dates, GROWTH_BASE),
      );
    }

    return points.map((point) => {
      const row: Record<string, unknown> = {
        ...point,
        nav: baseNav === 0 ? 0 : (point.nav / baseNav) * GROWTH_BASE,
      };
      for (const series of marketSeries) {
        const values = bySymbol.get(series.symbol);
        row[marketIndexDataKey(series.symbol)] = values?.[point.date] ?? null;
      }
      return row;
    });
  }, [points, comparing, marketSeries]);

  const latest = points.at(-1);

  const allValues = useMemo(() => {
    if (!comparing) return points.map((p) => p.nav);
    const vals: number[] = [];
    for (const row of chartData) {
      const nav = row.nav as number;
      if (nav != null) vals.push(nav);
      for (const series of marketSeries) {
        const v = row[marketIndexDataKey(series.symbol)] as number | null;
        if (v != null) vals.push(v);
      }
    }
    return vals;
  }, [chartData, comparing, marketSeries, points]);

  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 10;
  const padding = (maxVal - minVal) * 0.15 || 0.5;
  const yMin = Math.floor((minVal - padding) * 100) / 100;
  const yMax = Math.ceil((maxVal + padding) * 100) / 100;

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  }

  return (
    <section
      className="nav-chart"
      style={{ "--chart-accent": accent } as CSSProperties}
    >
      <div className="nav-chart__head">
        <div>
          <h2 className="nav-chart__title">
            NAV movement
            {latest ? (
              <span className="nav-chart__title-meta">
                {fmtNav.format(latest.nav)}
                {data?.asOf ? ` · ${formatDate(data.asOf)}` : ""}
              </span>
            ) : null}
          </h2>
          <p className="nav-chart__sub">
            {data?.schemeCode
              ? `SIF code ${data.schemeCode}`
              : "Add sifCode to enable Blob NAV history"}
          </p>
        </div>
        <div className="nav-chart__periods" aria-label="NAV chart period">
          {PERIODS.map((p) => (
            <button
              className={p === period ? "nav-chart__period is-active" : "nav-chart__period"}
              key={p}
              onClick={() => setPeriod(p)}
              type="button"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {returns ? (
        <table className="returns-table">
          <thead>
            <tr>
              {RETURN_PERIODS.map((p) => (
                <th key={p}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {RETURN_PERIODS.map((p) => {
                const v = returns.returns[p];
                const cls =
                  v == null ? "" : v < 0 ? "is-neg" : "is-pos";
                return (
                  <td key={p} className={cls}>
                    {formatReturn(v)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      ) : null}

      {status === "loading" ? (
        <div className="nav-chart__state">Loading NAV history...</div>
      ) : status === "error" ? (
        <div className="nav-chart__state">Could not load NAV history.</div>
      ) : data?.status !== "ok" || points.length === 0 ? (
        <div className="nav-chart__state">
          {data?.message ?? "No NAV history is available for this fund yet."}
        </div>
      ) : (
        <>
          <div className="nav-chart__toolbar">
            <div className="nav-chart__index-select">
              <button
                type="button"
                className="nav-chart__index-btn"
                aria-expanded={marketMenuOpen}
                aria-haspopup="listbox"
                onClick={() => setMarketMenuOpen((o) => !o)}
              >
                {selectedSymbols.length === 0
                  ? "Compare with index"
                  : `${selectedSymbols.length} index${selectedSymbols.length === 1 ? "" : "es"} selected`}
              </button>
              {marketMenuOpen ? (
                <div className="nav-chart__index-menu" role="listbox" aria-multiselectable="true">
                  {marketIndexes.map((item) => {
                    const checked = selectedSymbols.includes(item.symbol);
                    return (
                      <label key={item.symbol} className="nav-chart__index-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSymbol(item.symbol)}
                        />
                        <span
                          className="nav-chart__index-swatch"
                          style={{ background: MARKET_INDEX_COLORS[item.symbol] ?? "#6c757a" }}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                  {selectedSymbols.length > 0 ? (
                    <button
                      type="button"
                      className="nav-chart__index-clear"
                      onClick={() => { setSelectedSymbols([]); setMarketMenuOpen(false); }}
                    >
                      Clear selection
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="nav-chart__plot">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ddd6c8"
                  vertical={false}
                />
                <XAxis
                  dataKey="displayDate"
                  stroke="#9aa2a8"
                  style={{ fontSize: "12px" }}
                  tick={{ fill: "#6c757a" }}
                  minTickGap={40}
                />
                <YAxis
                  stroke="#9aa2a8"
                  style={{ fontSize: "12px" }}
                  tick={{ fill: "#6c757a" }}
                  domain={[yMin, yMax]}
                  allowDataOverflow
                  label={{
                    value: comparing ? "Growth" : "NAV",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#6c757a", fontSize: "12px" },
                  }}
                />
                <Tooltip content={<CustomTooltip comparing={comparing} />} />
                {comparing ? (
                  <Legend
                    content={() => (
                      <div className="nav-chart__legend">
                        <span className="nav-chart__legend-item">
                          <span className="nav-chart__legend-line" style={{ background: accent }} />
                          Fund NAV
                        </span>
                        {marketSeries.map((s) => (
                          <span key={s.symbol} className="nav-chart__legend-item">
                            <span
                              className="nav-chart__legend-line nav-chart__legend-line--dashed"
                              style={{ borderColor: MARKET_INDEX_COLORS[s.symbol] ?? "#6c757a" }}
                            />
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="nav"
                  name="Fund NAV"
                  stroke={`var(--chart-accent, ${accent})`}
                  strokeWidth={2.25}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                />
                {marketSeries.map((series) => (
                  <Line
                    key={series.symbol}
                    type="monotone"
                    dataKey={marketIndexDataKey(series.symbol)}
                    name={series.label}
                    stroke={MARKET_INDEX_COLORS[series.symbol] ?? "#6c757a"}
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                    animationDuration={500}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
