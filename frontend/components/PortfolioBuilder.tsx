"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  downloadPortfolioPdf,
  getFundNavHistory,
  getFundReturns,
  getFunds,
  getMarketIndexes,
  getMarketIndexesHistory,
  type MarketIndexHistorySeries,
  type MarketIndexInfo,
} from "@/lib/api";
import { resolveColor } from "@/lib/colors";
import { visibleFacts } from "@/lib/facts";
import { FundCard } from "@/components/FundCard";
import { useMeta } from "@/components/MetaProvider";
import { buildPortfolioNavSeries, type PortfolioNavSeries } from "@/lib/portfolioNav";
import type {
  FundIndexEntryWithId,
  FundReturnsResponse,
  PortfolioExportRequest,
  ReturnPeriod,
} from "@/lib/types";

type AllocationMode = "inr" | "percent";

const RETURN_PERIODS: ReturnPeriod[] = ["1M", "3M", "6M", "1Y"];
const SUM_TOLERANCE = 0.01;

// The historical portfolio chart is shown as a rebased growth index that starts
// at this value on the base (least-common) date. Change to 1000 for a base-1000
// series.
const PORTFOLIO_BASE = 100;

const MARKET_INDEX_COLORS: Record<string, string> = {
  "NIFTY 50": "#e34948",
  "NIFTY 100": "#eda100",
  "NIFTY 500": "#008300",
  "NIFTY MIDCAP 150": "#4a3aa7",
  "NIFTY SMLCAP 250": "#eb6834",
};

function marketIndexDataKey(symbol: string): string {
  return `idx_${symbol.replace(/\s+/g, "_")}`;
}

/** Forward-fill closes onto portfolio dates; rebase to PORTFOLIO_BASE at first available close. */
function rebasedIndexValues(
  points: { date: string; close: number }[],
  portfolioDates: string[],
  base: number,
): Record<string, number | null> {
  if (points.length === 0 || portfolioDates.length === 0) return {};

  const byDate = new Map(points.map((p) => [p.date, p.close]));
  let lastClose: number | null = null;
  let baseClose: number | null = null;
  const out: Record<string, number | null> = {};

  for (const d of portfolioDates) {
    const exact = byDate.get(d);
    if (exact != null) lastClose = exact;
    if (lastClose == null) {
      out[d] = null;
      continue;
    }
    if (baseClose == null || baseClose === 0) baseClose = lastClose;
    out[d] = (lastClose / baseClose) * base;
  }
  return out;
}

const fmtIndex = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const fmtPct = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtChartDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "2-digit",
});

function formatChartDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateStr : fmtChartDate.format(date);
}

// Categorical palette assigned in FIXED order (never cycled by rank). These are
// the validated CVD-safe slots (worst adjacent ΔE 24.2, all in the L 0.43–0.77
// band) — harmonious mid-tones rather than a harsh rainbow. Both donuts carry a
// legend, which is the required relief for the three sub-3:1 hues.
const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
] as const;

function fundColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

// Category donut offsets into the same fixed order so the two charts stay
// distinguishable while sharing one coherent palette.
function categoryColor(index: number): string {
  return CATEGORICAL_PALETTE[(index + 1) % CATEGORICAL_PALETTE.length];
}

function parseNumericInput(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function returnClass(v: number | null): string {
  if (v == null) return "";
  if (v > 0) return "is-pos";
  if (v < 0) return "is-neg";
  return "";
}

function tooltipLabel(value: unknown, payload: unknown): [string, string] {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  const item = payload as { payload?: { percent?: number; name?: string } } | undefined;
  const percent = item?.payload?.percent ?? 0;
  const name = item?.payload?.name ?? "";
  return [`${fmtCurrency.format(numeric)} (${fmtPct.format(percent)}%)`, name];
}

export function PortfolioBuilder() {
  const { tokens } = useMeta();
  const [clientName, setClientName] = useState("");
  const [totalAmount, setTotalAmount] = useState<number | "">("");
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("inr");
  const [funds, setFunds] = useState<FundIndexEntryWithId[]>([]);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [fundsError, setFundsError] = useState(false);

  const [fundQuery, setFundQuery] = useState("");
  const [selectedFundIds, setSelectedFundIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const [showPreview, setShowPreview] = useState(false);
  const [returnsByFundId, setReturnsByFundId] = useState<Record<string, FundReturnsResponse | null>>({});
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [portfolioSeries, setPortfolioSeries] = useState<PortfolioNavSeries | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState("");

  const [marketIndexes, setMarketIndexes] = useState<MarketIndexInfo[]>([]);
  const [selectedMarketSymbols, setSelectedMarketSymbols] = useState<string[]>([]);
  const [marketSeries, setMarketSeries] = useState<MarketIndexHistorySeries[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);

  useEffect(() => {
    getFunds()
      .then((rows) => {
        setFunds(rows);
        setFundsError(false);
      })
      .catch(() => setFundsError(true))
      .finally(() => setLoadingFunds(false));

    getMarketIndexes()
      .then((res) => setMarketIndexes(res.indexes))
      .catch(() => setMarketIndexes([]));
  }, []);

  useEffect(() => {
    const baseDate = portfolioSeries?.baseDate;
    if (!baseDate || selectedMarketSymbols.length === 0) {
      setMarketSeries([]);
      setMarketLoading(false);
      return;
    }

    let cancelled = false;
    setMarketLoading(true);
    getMarketIndexesHistory(baseDate, selectedMarketSymbols)
      .then((res) => {
        if (!cancelled) setMarketSeries(res.series);
      })
      .catch(() => {
        if (!cancelled) setMarketSeries([]);
      })
      .finally(() => {
        if (!cancelled) setMarketLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [portfolioSeries?.baseDate, selectedMarketSymbols]);

  const fundsById = useMemo(
    () => new Map(funds.map((f) => [f.fundId, f])),
    [funds],
  );

  const selectedFunds = useMemo(
    () => selectedFundIds.map((id) => fundsById.get(id)).filter(Boolean) as FundIndexEntryWithId[],
    [selectedFundIds, fundsById],
  );

  const filteredFunds = useMemo(() => {
    const q = fundQuery.trim().toLowerCase();
    if (!q) return funds;
    return funds.filter((f) =>
      `${f.name} ${f.amc} ${f.category}`.toLowerCase().includes(q),
    );
  }, [fundQuery, funds]);

  const total = typeof totalAmount === "number" ? totalAmount : 0;

  const allocationRows = useMemo(() => {
    return selectedFunds.map((fund) => {
      const unitValue = allocations[fund.fundId] ?? 0;
      const amount = allocationMode === "inr" ? unitValue : (total * unitValue) / 100;
      const percent = total > 0 ? (amount / total) * 100 : 0;
      return {
        fund,
        unitValue,
        amount,
        percent,
      };
    });
  }, [selectedFunds, allocations, allocationMode, total]);

  const sumUnits = useMemo(
    () => allocationRows.reduce((acc, row) => acc + row.unitValue, 0),
    [allocationRows],
  );

  const sumAmount = useMemo(
    () => allocationRows.reduce((acc, row) => acc + row.amount, 0),
    [allocationRows],
  );

  const sumPercent = useMemo(
    () => allocationRows.reduce((acc, row) => acc + row.percent, 0),
    [allocationRows],
  );

  const hasSelection = selectedFundIds.length > 0;
  const sumTarget = allocationMode === "inr" ? total : 100;
  const sumActual = allocationMode === "inr" ? sumUnits : sumUnits;
  const sumValid = Math.abs(sumActual - sumTarget) <= SUM_TOLERANCE;

  const validationError = (() => {
    if (!clientName.trim()) return "Client name is required.";
    if (!(total > 0)) return "Total amount must be greater than 0.";
    if (!hasSelection) return "Select at least one fund.";
    if (!sumValid) {
      return allocationMode === "inr"
        ? `Allocated amount must equal total (${fmtCurrency.format(total)}).`
        : "Allocated percentage must total 100.00%.";
    }
    return "";
  })();

  const isValid = validationError.length === 0;

  const portfolioChartData = useMemo(() => {
    const portfolioPoints = (portfolioSeries?.points ?? []).map((p) => ({
      ...p,
      base: p.index * PORTFOLIO_BASE,
      displayDate: formatChartDate(p.date),
    }));
    if (portfolioPoints.length === 0 || marketSeries.length === 0) {
      return portfolioPoints;
    }

    const dates = portfolioPoints.map((p) => p.date);
    const bySymbol = new Map<string, Record<string, number | null>>();
    for (const series of marketSeries) {
      bySymbol.set(
        series.symbol,
        rebasedIndexValues(series.points, dates, PORTFOLIO_BASE),
      );
    }

    return portfolioPoints.map((point) => {
      const row: Record<string, string | number | null> = { ...point };
      for (const series of marketSeries) {
        const values = bySymbol.get(series.symbol);
        row[marketIndexDataKey(series.symbol)] = values?.[point.date] ?? null;
      }
      return row;
    });
  }, [portfolioSeries, marketSeries]);

  function toggleMarketSymbol(symbol: string): void {
    setSelectedMarketSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  }

  const fundDonutData = allocationRows
    .filter((r) => r.amount > 0)
    .map((r, i) => ({
      key: r.fund.fundId,
      name: r.fund.name,
      value: r.amount,
      percent: r.percent,
      color: fundColor(i),
    }));

  const categoryDonutData = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of allocationRows) {
      const key = row.fund.category;
      grouped.set(key, (grouped.get(key) ?? 0) + row.amount);
    }
    return Array.from(grouped.entries())
      .filter(([, amount]) => amount > 0)
      .map(([category, amount], i) => ({
        key: category,
        name: category,
        value: amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
        color: categoryColor(i),
      }));
  }, [allocationRows, total]);

  function hidePreviewArtifacts(): void {
    setShowPreview(false);
    setReturnsByFundId({});
    setPortfolioSeries(null);
    setExportError("");
  }

  function toggleFund(fundId: string, checked: boolean): void {
    hidePreviewArtifacts();
    setSelectedFundIds((prev) => {
      if (checked) {
        if (prev.includes(fundId)) return prev;
        return [...prev, fundId];
      }
      return prev.filter((id) => id !== fundId);
    });
    setAllocations((prev) => {
      if (checked) return prev;
      const next = { ...prev };
      delete next[fundId];
      return next;
    });
  }

  function changeAllocation(fundId: string, raw: string): void {
    hidePreviewArtifacts();
    if (raw.trim() === "") {
      setAllocations((prev) => {
        const next = { ...prev };
        delete next[fundId];
        return next;
      });
      return;
    }
    const value = parseNumericInput(raw);
    setAllocations((prev) => ({ ...prev, [fundId]: value }));
  }

  function changeMode(nextMode: AllocationMode): void {
    if (nextMode === allocationMode) return;
    hidePreviewArtifacts();
    if (!(total > 0)) {
      const cleared: Record<string, number> = {};
      for (const id of selectedFundIds) cleared[id] = 0;
      setAllocations(cleared);
      setAllocationMode(nextMode);
      return;
    }

    const converted: Record<string, number> = {};
    for (const id of selectedFundIds) {
      const current = allocations[id] ?? 0;
      converted[id] =
        allocationMode === "inr" ? (current / total) * 100 : (current / 100) * total;
    }
    setAllocations(converted);
    setAllocationMode(nextMode);
  }

  function resetAll(): void {
    setClientName("");
    setTotalAmount("");
    setAllocationMode("inr");
    setFundQuery("");
    setSelectedFundIds([]);
    setAllocations({});
    setShowPreview(false);
    setReturnsByFundId({});
    setReturnsLoading(false);
    setPortfolioSeries(null);
    setSeriesLoading(false);
    setExportingPdf(false);
    setExportError("");
  }

  async function previewPortfolio(): Promise<void> {
    if (!isValid) return;
    setShowPreview(true);
    if (selectedFunds.length === 0) return;

    // Allocation fraction per fund, captured now so the async build uses the
    // values that were valid at preview time.
    const weightByFundId = new Map(
      allocationRows.map((row) => [
        row.fund.fundId,
        total > 0 ? row.amount / total : 0,
      ]),
    );
    const capturedTotal = total;

    setReturnsLoading(true);
    setSeriesLoading(true);

    // Trailing returns (unchanged) and full NAV history run in parallel.
    const returnsPromise = Promise.all(
      selectedFunds.map(async (fund) => {
        try {
          const res = await getFundReturns(fund.fundId);
          return [fund.fundId, res] as const;
        } catch {
          return [fund.fundId, null] as const;
        }
      }),
    );

    const navPromise = Promise.all(
      selectedFunds.map(async (fund) => {
        try {
          // "ALL" so the least-common date is found over each fund's full history.
          const res = await getFundNavHistory(fund.fundId, "ALL");
          return {
            fundId: fund.fundId,
            weight: weightByFundId.get(fund.fundId) ?? 0,
            points: res.status === "ok" ? res.points : [],
          };
        } catch {
          return { fundId: fund.fundId, weight: weightByFundId.get(fund.fundId) ?? 0, points: [] };
        }
      }),
    );

    const [returnsEntries, navInputs] = await Promise.all([
      returnsPromise,
      navPromise,
    ]);

    setReturnsByFundId(Object.fromEntries(returnsEntries));
    setReturnsLoading(false);

    setPortfolioSeries(buildPortfolioNavSeries(navInputs, capturedTotal));
    setSeriesLoading(false);
  }

  async function exportPortfolioPdf(): Promise<void> {
    if (!showPreview || previewLoading) return;

    setExportError("");
    setExportingPdf(true);

    const payload: PortfolioExportRequest = {
      clientName,
      totalAmount: total,
      portfolioBase: PORTFOLIO_BASE,
      funds: allocationRows.map((row) => {
        const response = returnsByFundId[row.fund.fundId];
        return {
          fundId: row.fund.fundId,
          name: row.fund.name,
          amc: row.fund.amc,
          category: row.fund.category,
          amount: row.amount,
          percent: row.percent,
          facts: visibleFacts(row.fund.facts),
          accentColor: resolveColor(row.fund.accent, tokens),
          returns: {
            "1M": response?.returns?.["1M"] ?? null,
            "3M": response?.returns?.["3M"] ?? null,
            "6M": response?.returns?.["6M"] ?? null,
            "1Y": response?.returns?.["1Y"] ?? null,
          },
        };
      }),
      portfolioSeries:
        portfolioSeries && portfolioChartData.length > 0
          ? {
              baseDate: portfolioSeries.baseDate,
              totalReturnPct: portfolioSeries.totalReturnPct,
              currentValue: Number(
                portfolioChartData[portfolioChartData.length - 1].value ?? 0,
              ),
              excludedFundCount: portfolioSeries.excludedFundIds.length,
              points: portfolioSeries.points,
            }
          : null,
      marketIndexes: marketSeries
        .filter((series) => series.points.length > 0)
        .map((series) => ({
          symbol: series.symbol,
          label: series.label,
          color: MARKET_INDEX_COLORS[series.symbol] ?? null,
          points: series.points,
        })),
    };

    try {
      const blob = await downloadPortfolioPdf(payload);
      const slug =
        clientName
          .trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .toLowerCase() || "portfolio";
      const fileName = `${slug}-portfolio-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Portfolio PDF export failed:", err);
      setExportError("Could not export PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  const previewLoading = returnsLoading || seriesLoading;

  return (
    <section className="portfolio-builder">
      <div className="portfolio-builder__head">
        <h1>Create portfolio</h1>
        <p>Build an allocation across selected SIF funds and preview distribution + returns.</p>
      </div>

      <div className="portfolio-grid2">
        <label className="portfolio-field">
          <span>Client name</span>
          <input
            value={clientName}
            onChange={(e) => {
              hidePreviewArtifacts();
              setClientName(e.target.value);
            }}
            placeholder="Enter client name"
          />
        </label>

        <label className="portfolio-field">
          <span>Total amount (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={totalAmount}
            onChange={(e) => {
              hidePreviewArtifacts();
              const next = e.target.value;
              setTotalAmount(next === "" ? "" : parseNumericInput(next));
            }}
            placeholder="0.00"
          />
        </label>
      </div>

      <div className="portfolio-picker">
        <label className="portfolio-field">
          <span>Select funds</span>
          <input
            value={fundQuery}
            onChange={(e) => setFundQuery(e.target.value)}
            placeholder="Search by fund name, AMC, or category"
          />
        </label>
        <div className="portfolio-picker__list">
          {loadingFunds ? (
            <div className="portfolio-empty">Loading funds...</div>
          ) : fundsError ? (
            <div className="portfolio-empty portfolio-empty--error">
              Could not load funds from backend.
            </div>
          ) : filteredFunds.length === 0 ? (
            <div className="portfolio-empty">No matching funds.</div>
          ) : (
            filteredFunds.map((fund) => {
              const checked = selectedFundIds.includes(fund.fundId);
              return (
                <label key={fund.fundId} className="portfolio-picker__item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleFund(fund.fundId, e.target.checked)}
                  />
                  <span className="portfolio-picker__item-main">
                    <span>{fund.name}</span>
                    <small>{fund.amc}</small>
                  </span>
                  <span className="chip chip--soft">{fund.category}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {selectedFunds.length > 0 ? (
        <div className="portfolio-selected">
          {allocationRows.map((row) => (
            <button
              key={row.fund.fundId}
              type="button"
              className="portfolio-chip"
              onClick={() => toggleFund(row.fund.fundId, false)}
              title="Remove fund"
            >
              {row.fund.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="portfolio-mode">
        <span>Allocate by</span>
        <button
          type="button"
          className={`detail-tabs__btn${allocationMode === "inr" ? " is-active" : ""}`}
          onClick={() => changeMode("inr")}
        >
          Amount (₹)
        </button>
        <button
          type="button"
          className={`detail-tabs__btn${allocationMode === "percent" ? " is-active" : ""}`}
          onClick={() => changeMode("percent")}
        >
          Percentage (%)
        </button>
      </div>

      <div className="cmp-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Fund</th>
              <th>{allocationMode === "inr" ? "Amount (₹)" : "Percent (%)"}</th>
              <th>{allocationMode === "inr" ? "Percent (%)" : "Amount (₹)"}</th>
            </tr>
          </thead>
          <tbody>
            {allocationRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="portfolio-empty">
                  Select at least one fund to allocate.
                </td>
              </tr>
            ) : (
              allocationRows.map((row) => (
                <tr key={row.fund.fundId}>
                  <td>
                    <div className="portfolio-fundcell">
                      <strong>{row.fund.name}</strong>
                      <small>{row.fund.amc}</small>
                    </div>
                  </td>
                  <td>
                    <input
                      className="portfolio-input-small"
                      type="number"
                      min="0"
                      step="0.01"
                      value={allocations[row.fund.fundId] ?? ""}
                      onChange={(e) => changeAllocation(row.fund.fundId, e.target.value)}
                    />
                  </td>
                  <td>
                    {allocationMode === "inr"
                      ? `${fmtPct.format(row.percent)}%`
                      : fmtCurrency.format(row.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th>
                {allocationMode === "inr"
                  ? fmtCurrency.format(sumUnits)
                  : `${fmtPct.format(sumUnits)}%`}
              </th>
              <th>
                {allocationMode === "inr"
                  ? `${fmtPct.format(sumPercent)}%`
                  : fmtCurrency.format(sumAmount)}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>

      {validationError ? (
        <div className="portfolio-error" role="alert">
          {validationError}
        </div>
      ) : null}

      <div className="portfolio-actions">
        <button type="button" className="btn" onClick={resetAll}>
          Reset
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={previewPortfolio}
          disabled={!isValid}
        >
          Preview portfolio
        </button>
      </div>

      {showPreview ? (
        <div className="portfolio-summary">
          <div className="portfolio-summary__toolbar">
            <button
              type="button"
              className="btn btn--primary"
              onClick={exportPortfolioPdf}
              disabled={exportingPdf || previewLoading}
            >
              {exportingPdf ? "Exporting PDF…" : "Export PDF"}
            </button>
            {exportError ? (
              <p className="portfolio-summary__export-error" role="alert">
                {exportError}
              </p>
            ) : null}
          </div>

          <div className="portfolio-summary__snapshot">
            <h2>Selected funds snapshot</h2>
            <p>
              <strong>Client:</strong> {clientName} · <strong>Portfolio:</strong>{" "}
              {fmtCurrency.format(total)} · <strong>Funds:</strong> {allocationRows.length}
            </p>
            <div className="portfolio-summary__fund-grid">
              {allocationRows.map((row) => (
                <div key={row.fund.fundId} className="portfolio-summary__fund-item">
                  <FundCard
                    name={row.fund.name}
                    amc={row.fund.amc}
                    accent={row.fund.accent}
                    category={row.fund.category}
                    facts={row.fund.facts}
                    href={false}
                  />
                  <div className="portfolio-summary__alloc">
                    <span className="portfolio-summary__alloc-amt">
                      {fmtCurrency.format(row.amount)}
                    </span>
                    <span className="portfolio-summary__alloc-pct">
                      {fmtPct.format(row.percent)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="portfolio-summary__charts">
            <div className="portfolio-chart">
              <h3>Portfolio Allocated Fund Breakdown</h3>
              <div className="portfolio-chart__box">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={fundDonutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={106}
                      strokeWidth={1}
                    >
                      {fundDonutData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, payload) => tooltipLabel(value, payload)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="portfolio-chart">
              <h3>Portfolio Category Breakdown</h3>
              <div className="portfolio-chart__box">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={categoryDonutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={106}
                      strokeWidth={1}
                    >
                      {categoryDonutData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, payload) => tooltipLabel(value, payload)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="portfolio-chart portfolio-chart--wide">
            <div className="portfolio-chart__head">
              <h3>Portfolio Growth</h3>
              {portfolioSeries && portfolioChartData.length > 0 ? (
                <div className="portfolio-index-select">
                  <button
                    type="button"
                    className="portfolio-index-select__btn"
                    aria-expanded={marketMenuOpen}
                    aria-haspopup="listbox"
                    onClick={() => setMarketMenuOpen((open) => !open)}
                  >
                    {selectedMarketSymbols.length === 0
                      ? "Compare indexes"
                      : `${selectedMarketSymbols.length} index${selectedMarketSymbols.length === 1 ? "" : "es"} selected`}
                  </button>
                  {marketMenuOpen ? (
                    <div className="portfolio-index-select__menu" role="listbox" aria-multiselectable="true">
                      {marketIndexes.map((item) => {
                        const checked = selectedMarketSymbols.includes(item.symbol);
                        return (
                          <label key={item.symbol} className="portfolio-index-select__option">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMarketSymbol(item.symbol)}
                            />
                            <span
                              className="portfolio-index-select__swatch"
                              style={{
                                background: MARKET_INDEX_COLORS[item.symbol] ?? "#6c757a",
                              }}
                            />
                            {item.label}
                          </label>
                        );
                      })}
                      {selectedMarketSymbols.length > 0 ? (
                        <button
                          type="button"
                          className="portfolio-index-select__clear"
                          onClick={() => setSelectedMarketSymbols([])}
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {seriesLoading ? (
              <div className="portfolio-empty">Building portfolio history...</div>
            ) : !portfolioSeries || portfolioChartData.length === 0 ? (
              <div className="portfolio-empty">
                Not enough overlapping NAV history to build a portfolio series.
              </div>
            ) : (
              <>
                <p className="portfolio-chart__meta">
                  From{" "}
                  <strong>
                    {portfolioSeries.baseDate
                      ? formatChartDate(portfolioSeries.baseDate)
                      : "-"}
                  </strong>{" "}
                  · Current Portfolio Value{" "}
                  <strong>
                    {fmtCurrency.format(
                      Number(portfolioChartData[portfolioChartData.length - 1].value ?? 0),
                    )}
                  </strong>{" "}
                  · Return{" "}
                  <strong className={returnClass(portfolioSeries.totalReturnPct)}>
                    {portfolioSeries.totalReturnPct == null
                      ? "-"
                      : `${fmtPct.format(portfolioSeries.totalReturnPct)}%`}
                  </strong>
                  {marketLoading ? " · Loading indexes…" : null}
                </p>
                {portfolioSeries.excludedFundIds.length > 0 ? (
                  <p className="portfolio-chart__note">
                    {portfolioSeries.excludedFundIds.length} fund(s) excluded — no
                    NAV history available.
                  </p>
                ) : null}
                <div className="portfolio-chart__box">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                      data={portfolioChartData}
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
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => fmtIndex.format(Number(v))}
                        width={64}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          value == null ? "-" : fmtIndex.format(Number(value)),
                          name === "base" ? `Portfolio (base ${PORTFOLIO_BASE})` : String(name),
                        ]}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="base"
                        name="Portfolio"
                        stroke="hsl(210 68% 46%)"
                        strokeWidth={2.25}
                        dot={false}
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
          </div>

          <div>
            <h3>Fund returns</h3>
            {returnsLoading ? <div className="portfolio-empty">Loading returns...</div> : null}
            <div className="cmp-wrap">
              <table className="returns-table portfolio-returns-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Category</th>
                    <th>Allocated ₹</th>
                    <th>Allocation %</th>
                    {RETURN_PERIODS.map((period) => (
                      <th key={period}>{period}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocationRows.map((row) => {
                    const response = returnsByFundId[row.fund.fundId];
                    return (
                      <tr key={row.fund.fundId}>
                        <td>{row.fund.name}</td>
                        <td>{row.fund.category}</td>
                        <td>{fmtCurrency.format(row.amount)}</td>
                        <td>{fmtPct.format(row.percent)}</td>
                        {RETURN_PERIODS.map((period) => {
                          const v = response?.returns?.[period] ?? null;
                          return (
                            <td key={period} className={returnClass(v)}>
                              {v == null ? "-" : `${fmtPct.format(v)}%`}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
