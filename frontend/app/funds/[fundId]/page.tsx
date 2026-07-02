"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category, FundDetailResponse } from "@/lib/types";
import { getCategory, getFund } from "@/lib/api";
import { SectionRenderer } from "@/components/SectionRenderer";
import { ExtrasRenderer } from "@/components/ExtrasRenderer";
import { NavMovementChart } from "@/components/NavMovementChart";
import { FundCompareSelect } from "@/components/FundCompareSelect";

export default function FundDetailPage({
  params,
}: {
  params: Promise<{ fundId: string }>;
}) {
  const { fundId } = use(params);
  const [fund, setFund] = useState<FundDetailResponse | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
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
        <div className="detail-head__facts">
          {fund.facts
            .filter(([k]) => k !== "NAV (Reg)")
            .map(([k, v], i) => (
            <div className="facts__row" key={`${k}-${i}`}>
              <span className="facts__k">{k}</span>
              <span className="facts__v">{v || <span className="dash">—</span>}</span>
            </div>
          ))}
        </div>
      </header>

      <NavMovementChart fundId={fundId} accent={fund.accent} />

      {category && peerCount > 1 ? (
        <>
          <p className="peer-note">
            Compared below against {peerCount - 1} peer
            {peerCount - 1 === 1 ? "" : "s"} in{" "}
            <strong>{category.title}</strong>. This fund&rsquo;s column is
            highlighted.
          </p>
          <FundCompareSelect
            cols={category.cols.map((c) => [c.short, c.amc, c.color])}
            ownColor={emphColor}
            selected={selectedShorts ?? new Set()}
            onToggle={toggleShort}
          />
        </>
      ) : null}

      {/* Comparison sections with this fund's column emphasized */}
      {category?.sections.map((s) => (
        <SectionRenderer
          key={s.id}
          section={s}
          emphColor={emphColor}
          visibleCols={visibleCols}
        />
      ))}

      {/* Sector Rotation extras (single-fund category) */}
      {category?.extras ? (
        <>
          <h2 className="subhead">Strategy deep-dive</h2>
          <ExtrasRenderer extras={category.extras} />
        </>
      ) : null}
    </>
  );
}
