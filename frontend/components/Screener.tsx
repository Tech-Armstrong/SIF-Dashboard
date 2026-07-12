"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCategories, getFundReturns, getFunds } from "@/lib/api";
import { factValue } from "@/lib/facts";
import type {
  CategorySummary,
  FundIndexEntryWithId,
  FundReturnsResponse,
  ReturnPeriod,
} from "@/lib/types";

const RETURN_PERIODS: ReturnPeriod[] = ["1M", "3M", "6M", "1Y"];

type SortKey = "name" | "amc" | "category" | ReturnPeriod;
type SortDir = "asc" | "desc";

const fmtPct = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function returnClass(value: number | null): string {
  if (value == null) return "";
  if (value > 0) return "is-pos";
  if (value < 0) return "is-neg";
  return "";
}

function compareText(a: string, b: string, dir: SortDir): number {
  const result = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function compareNumber(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function Screener() {
  const [funds, setFunds] = useState<FundIndexEntryWithId[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [returnsByFundId, setReturnsByFundId] = useState<
    Record<string, FundReturnsResponse | null>
  >({});
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [amc, setAmc] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingFunds(true);
      setLoadingReturns(true);
      setLoadError(false);

      try {
        const [fundRows, categoryRows] = await Promise.all([getFunds(), getCategories()]);
        if (cancelled) return;

        setFunds(fundRows);
        setCategories(categoryRows);

        const returnsEntries = await Promise.all(
          fundRows.map(async (fund) => {
            try {
              const response = await getFundReturns(fund.fundId);
              return [fund.fundId, response] as const;
            } catch {
              return [fund.fundId, null] as const;
            }
          }),
        );
        if (cancelled) return;

        setReturnsByFundId(Object.fromEntries(returnsEntries));
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) {
          setLoadingFunds(false);
          setLoadingReturns(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const amcOptions = useMemo(() => {
    const values = new Set(funds.map((fund) => fund.amc));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [funds]);

  const filteredFunds = useMemo(() => {
    const q = query.trim().toLowerCase();

    return funds.filter((fund) => {
      if (categoryId !== "all" && fund.categoryId !== categoryId) return false;
      if (amc !== "all" && fund.amc !== amc) return false;
      if (!q) return true;

      const haystack = `${fund.name} ${fund.amc} ${fund.category} ${fund.sifCode ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [funds, query, categoryId, amc]);

  const sortedFunds = useMemo(() => {
    const rows = [...filteredFunds];

    rows.sort((left, right) => {
      if (sortKey === "name") return compareText(left.name, right.name, sortDir);
      if (sortKey === "amc") return compareText(left.amc, right.amc, sortDir);
      if (sortKey === "category") return compareText(left.category, right.category, sortDir);

      const leftReturn = returnsByFundId[left.fundId]?.returns?.[sortKey] ?? null;
      const rightReturn = returnsByFundId[right.fundId]?.returns?.[sortKey] ?? null;
      return compareNumber(leftReturn, rightReturn, sortDir);
    });

    return rows;
  }, [filteredFunds, returnsByFundId, sortKey, sortDir]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "name" || nextKey === "amc" || nextKey === "category" ? "asc" : "desc");
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <section className="screener">
      <div className="screener__head">
        <h1>SIF screener</h1>
        <p>
          Filter the full SIF universe by category and AMC, then compare trailing returns
          across funds.
        </p>
      </div>

      <div className="screener__filters">
        <label className="portfolio-field screener__search">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fund name, AMC, category, or code"
          />
        </label>

        <label className="portfolio-field">
          <span>Category</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.chip}
              </option>
            ))}
          </select>
        </label>

        <label className="portfolio-field">
          <span>AMC</span>
          <select value={amc} onChange={(event) => setAmc(event.target.value)}>
            <option value="all">All AMCs</option>
            {amcOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="screener__meta">
        Showing <strong>{sortedFunds.length}</strong> of <strong>{funds.length}</strong> funds
        {loadingReturns ? " · loading returns..." : null}
      </p>

      {loadError ? (
        <div className="portfolio-empty portfolio-empty--error">
          Could not load screener data from backend.
        </div>
      ) : loadingFunds ? (
        <div className="portfolio-empty">Loading funds...</div>
      ) : sortedFunds.length === 0 ? (
        <div className="portfolio-empty">No funds match the current filters.</div>
      ) : (
        <div className="cmp-wrap screener__table-wrap">
          <table className="screener-table">
            <colgroup>
              <col className="screener-col screener-col--fund" />
              <col className="screener-col screener-col--amc" />
              <col className="screener-col screener-col--category" />
              <col className="screener-col screener-col--inception" />
              {RETURN_PERIODS.map((period) => (
                <col key={period} className="screener-col screener-col--return" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="screener-table__head">
                  <button type="button" className="screener-sort" onClick={() => toggleSort("name")}>
                    Fund{sortIndicator("name")}
                  </button>
                </th>
                <th className="screener-table__head">
                  <button type="button" className="screener-sort" onClick={() => toggleSort("amc")}>
                    AMC{sortIndicator("amc")}
                  </button>
                </th>
                <th className="screener-table__head">
                  <button
                    type="button"
                    className="screener-sort"
                    onClick={() => toggleSort("category")}
                  >
                    Category{sortIndicator("category")}
                  </button>
                </th>
                <th className="screener-table__head screener-table__head--metric">Inception</th>
                {RETURN_PERIODS.map((period) => (
                  <th key={period} className="screener-table__head screener-table__head--metric">
                    <button
                      type="button"
                      className="screener-sort"
                      onClick={() => toggleSort(period)}
                    >
                      {period}
                      {sortIndicator(period)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFunds.map((fund) => {
                const returns = returnsByFundId[fund.fundId]?.returns;
                const inception = factValue(fund.facts, "Inception") ?? "—";

                return (
                  <tr key={fund.fundId}>
                    <td className="screener-table__fund">
                      <Link href={`/funds/${fund.fundId}`} className="screener-fund-link">
                        {fund.name}
                      </Link>
                    </td>
                    <td className="screener-table__amc">{fund.amc}</td>
                    <td className="screener-table__category">{fund.category}</td>
                    <td className="screener-table__inception">{inception}</td>
                    {RETURN_PERIODS.map((period) => {
                      const value = returns?.[period] ?? null;
                      return (
                        <td key={period} className={`screener-table__return ${returnClass(value)}`}>
                          {value == null ? "-" : `${fmtPct.format(value)}%`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
