"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Category, FundDetailResponse } from "@/lib/types";
import { getCategory, getFund } from "@/lib/api";
import { SectionRenderer } from "@/components/SectionRenderer";
import { ExtrasRenderer } from "@/components/ExtrasRenderer";
import { NavMovementChart } from "@/components/NavMovementChart";

export default function FundDetailPage({
  params,
}: {
  params: Promise<{ fundId: string }>;
}) {
  const { fundId } = use(params);
  const [fund, setFund] = useState<FundDetailResponse | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getFund(fundId)
      .then(async (f) => {
        setFund(f);
        const c = await getCategory(f.categoryId);
        setCategory(c);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [fundId]);

  if (status === "loading") return <div className="loading">Loading fund…</div>;
  if (status === "error" || !fund)
    return <div className="error-state">Fund not found.</div>;

  // Emphasize this fund's column/panel in the comparison sections.
  const emphColor = fund.accent;
  const peerCount = category?.cols?.length ?? 0;

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
          {fund.facts.map(([k, v], i) => (
            <div className="facts__row" key={`${k}-${i}`}>
              <span className="facts__k">{k}</span>
              <span className="facts__v">{v || <span className="dash">—</span>}</span>
            </div>
          ))}
        </div>
        {fund.tags && fund.tags.length > 0 ? (
          <div className="tag-row" style={{ marginTop: 14 }}>
            {fund.tags.map(([label, cls], i) => (
              <span className={cls} key={`${label}-${i}`}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <NavMovementChart fundId={fundId} accent={fund.accent} />

      {category && peerCount > 1 ? (
        <p className="peer-note">
          Compared below against {peerCount - 1} peer
          {peerCount - 1 === 1 ? "" : "s"} in{" "}
          <strong>{category.title}</strong>. This fund&rsquo;s column is
          highlighted.
        </p>
      ) : null}

      {/* Comparison sections with this fund's column emphasized */}
      {category?.sections.map((s) => (
        <SectionRenderer key={s.id} section={s} emphColor={emphColor} />
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
