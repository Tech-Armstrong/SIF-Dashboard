"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { FundNavHistoryResponse, NavPeriod, NavPoint } from "@/lib/types";
import { getFundNavHistory } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const PERIODS: NavPeriod[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"];

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

interface ChartPoint extends NavPoint {
  displayDate: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div style={{
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      padding: "8px 12px",
      border: "1px solid #ddd6c8",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    }}>
      <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#6c757a" }}>
        {formatDate(data.date)}
      </p>
      <p style={{ margin: "0", fontSize: "14px", fontWeight: "600", color: "#1a1d21" }}>
        NAV: {fmtNav.format(data.nav)}
      </p>
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
    return () => {
      active = false;
    };
  }, [fundId, period]);

  const points: ChartPoint[] = (data?.points ?? []).map((p) => ({
    ...p,
    displayDate: formatChartDate(p.date),
  }));

  const latest = points.at(-1);
  const first = points.at(0);
  const changePct =
    first && latest && first.nav > 0 ? (latest.nav / first.nav - 1) * 100 : null;

  return (
    <section
      className="nav-chart"
      style={{ "--chart-accent": accent } as CSSProperties}
    >
      <div className="nav-chart__head">
        <div>
          <h2 className="nav-chart__title">NAV movement</h2>
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
          <div className="nav-chart__stats">
            <div>
              <span>Latest NAV</span>
              <strong>{latest ? fmtNav.format(latest.nav) : "-"}</strong>
            </div>
            <div>
              <span>Period change</span>
              <strong className={changePct != null && changePct < 0 ? "is-neg" : "is-pos"}>
                {changePct == null
                  ? "-"
                  : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
              </strong>
            </div>
            <div>
              <span>As of</span>
              <strong>{data.asOf ? formatDate(data.asOf) : "-"}</strong>
            </div>
          </div>

          <div className="nav-chart__plot">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart
                data={points}
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
                />
                <YAxis
                  stroke="#9aa2a8"
                  style={{ fontSize: "12px" }}
                  tick={{ fill: "#6c757a" }}
                  label={{
                    value: "NAV",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#6c757a", fontSize: "12px" },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="nav"
                  stroke={`var(--chart-accent, ${accent})`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="nav-chart__range">
            <span>{first ? formatDate(first.date) : "-"}</span>
            <span>{latest ? formatDate(latest.date) : "-"}</span>
          </div>
        </>
      )}
    </section>
  );
}
