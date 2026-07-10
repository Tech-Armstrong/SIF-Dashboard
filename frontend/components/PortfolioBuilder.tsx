"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { getFundReturns, getFunds } from "@/lib/api";
import { FundCard } from "@/components/FundCard";
import type { FundIndexEntryWithId, FundReturnsResponse, ReturnPeriod } from "@/lib/types";

type AllocationMode = "inr" | "percent";

const RETURN_PERIODS: ReturnPeriod[] = ["1M", "3M", "6M", "1Y"];
const SUM_TOLERANCE = 0.01;

const fmtCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const fmtPct = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function categoryColor(index: number): string {
  const hue = (index * 57) % 360;
  return `hsl(${hue} 52% 46%)`;
}

function fundColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue} 68% 46%)`;
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

  useEffect(() => {
    getFunds()
      .then((rows) => {
        setFunds(rows);
        setFundsError(false);
      })
      .catch(() => setFundsError(true))
      .finally(() => setLoadingFunds(false));
  }, []);

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
  }

  async function previewPortfolio(): Promise<void> {
    if (!isValid) return;
    setShowPreview(true);
    if (selectedFunds.length === 0) return;
    setReturnsLoading(true);
    const entries = await Promise.all(
      selectedFunds.map(async (fund) => {
        try {
          const res = await getFundReturns(fund.fundId);
          return [fund.fundId, res] as const;
        } catch {
          return [fund.fundId, null] as const;
        }
      }),
    );
    setReturnsByFundId(Object.fromEntries(entries));
    setReturnsLoading(false);
  }

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
          <div className="portfolio-summary__snapshot">
            <h2>Selected funds snapshot</h2>
            <p>
              <strong>Client:</strong> {clientName} · <strong>Total:</strong>{" "}
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
                    <span>{fmtCurrency.format(row.amount)}</span>
                    <span>{fmtPct.format(row.percent)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="portfolio-summary__charts">
            <div className="portfolio-chart">
              <h3>Selected funds breakdown</h3>
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
              <h3>Category breakdown</h3>
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
                        <td>{fmtPct.format(row.percent)}%</td>
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
