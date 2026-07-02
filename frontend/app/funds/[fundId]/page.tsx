"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category, FundDetailResponse } from "@/lib/types";
import { getCategory, getFund } from "@/lib/api";
import { SectionRenderer } from "@/components/SectionRenderer";
import { ExtrasRenderer } from "@/components/ExtrasRenderer";
import { NavMovementChart } from "@/components/NavMovementChart";
import { FundCompareSelect } from "@/components/FundCompareSelect";
import { FactsList } from "@/components/FactsList";

type DetailTab = "return" | "portfolio" | "peer";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "return", label: "Return" },
  { id: "portfolio", label: "Portfolio" },
  { id: "peer", label: "Peer Comparison" },
];

export default function FundDetailPage({
  params,
}: {
  params: Promise<{ fundId: string }>;
}) {
  const { fundId } = use(params);
  const [fund, setFund] = useState<FundDetailResponse | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [activeTab, setActiveTab] = useState<DetailTab>("return");
  // Column `short`s currently shown in the comparison tables. null until the
  // category loads (then defaults to all columns selected).
  const [selectedShorts, setSelectedShorts] = useState<Set<string> | null>(null);

  useEffect(() => {
    getFund(fundId)
      .then(async (f) => {
        setFund(f);
        const c = await getCategory(f.categoryId);
        setCategory(c);
        // Default: show every fund's column.
        setSelectedShorts(new Set((c.cols ?? []).map((col) => col.short)));
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [fundId]);

  // The current fund's own column short (matched by accent color) — always
  // shown in the tables regardless of the multiselect. Null until loaded.
  const ownShort =
    category?.cols?.find((c) => c.color === fund?.accent)?.short ?? null;

  // Effective set of column shorts to render: the selection plus the locked
  // own column. Null only before the category has loaded.
  // NOTE: hooks must run on every render, so this lives above the early
  // returns below.
  const visibleCols = useMemo(() => {
    if (!selectedShorts) return null;
    const s = new Set(selectedShorts);
    if (ownShort) s.add(ownShort);
    return s;
  }, [selectedShorts, ownShort]);

  if (status === "loading") return <div className="loading">Loading fund…</div>;
  if (status === "error" || !fund)
    return <div className="error-state">Fund not found.</div>;

  // Emphasize this fund's column/panel in the comparison sections.
  const emphColor = fund.accent;
  const peerCount = category?.cols?.length ?? 0;

  const toggleShort = (short: string) =>
    setSelectedShorts((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(short)) next.delete(short);
      else next.add(short);
      return next;
    });

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        {category ? (
          <Link href={`/category/${fund.categoryId}`}>{category.title}</Link>
        ) : (
          <span>{fund.category}</span>
        )}
        <span>/</span>
        <span>{fund.name}</span>
      </div>

      <header className="detail-head" style={{ borderTopColor: fund.accent }}>
        <div className="detail-head__amc">{fund.amc}</div>
        <h1 className="detail-head__name">{fund.name}</h1>
        <div style={{ marginBottom: 14 }}>
          <Link href={`/category/${fund.categoryId}`} className="chip chip--soft">
            {fund.category}
          </Link>
        </div>
        <FactsList
          className="detail-head__facts facts"
          facts={fund.facts.filter(([k]) => k !== "NAV (Reg)")}
        />
      </header>

      <nav className="detail-tabs" role="tablist" aria-label="Fund views">
        {DETAIL_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`detail-tabs__btn${activeTab === id ? " is-active" : ""}`}
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "return" ? (
        <div className="detail-tab-panel" role="tabpanel">
          <NavMovementChart fundId={fundId} accent={fund.accent} />
        </div>
      ) : null}

      {activeTab === "portfolio" ? (
        <div
          className="detail-tab-panel detail-tab-panel--empty"
          role="tabpanel"
        />
      ) : null}

      {activeTab === "peer" ? (
        <div className="detail-tab-panel" role="tabpanel">
          {category && peerCount > 1 ? (
            <FundCompareSelect
              cols={category.cols.map((c) => [c.short, c.amc, c.color])}
              ownColor={emphColor}
              selected={selectedShorts ?? new Set()}
              onToggle={toggleShort}
            />
          ) : null}
          {category?.sections.map((s) => (
            <SectionRenderer
              key={s.id}
              section={s}
              emphColor={emphColor}
              visibleCols={visibleCols}
            />
          ))}
          {category?.extras ? (
            <>
              <h2 className="subhead">Strategy deep-dive</h2>
              <ExtrasRenderer extras={category.extras} />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
