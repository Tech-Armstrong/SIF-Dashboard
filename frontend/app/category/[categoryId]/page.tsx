"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { Category } from "@/lib/types";
import { getCategory } from "@/lib/api";
import { FundCardWithNav } from "@/components/FundCardWithNav";
import { SectionRenderer } from "@/components/SectionRenderer";
import { ExtrasRenderer } from "@/components/ExtrasRenderer";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getCategory(categoryId)
      .then((c) => {
        setCategory(c);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [categoryId]);

  if (status === "loading") return <div className="loading">Loading category…</div>;
  if (status === "error" || !category)
    return <div className="error-state">Category not found.</div>;

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <span>{category.title}</span>
      </div>

      <header>
        <span className="chip chip--soft">{category.chip}</span>
        <h1 style={{ marginTop: 10 }}>{category.title}</h1>
        <p className="cat-header__desc">{category.desc}</p>
      </header>

      {/* Cards (multi-fund) or single fund */}
      {category.cards && category.cards.length > 0 ? (
        <>
          <h2 className="subhead">Funds at a glance</h2>
          <div className="card-grid">
            {category.cards.map((c, i) => (
              <FundCardWithNav
                key={i}
                name={c.name}
                fundId={c.fundId}
                amc={c.amc}
                accent={c.ac}
                facts={c.facts}
                tags={c.tags}
              />
            ))}
          </div>
        </>
      ) : null}

      {category.single ? (
        <>
          <h2 className="subhead">The fund</h2>
          <div className="card-grid">
            <FundCardWithNav
              name={category.single.name}
              fundId={category.single.fundId}
              amc={category.single.amc}
              accent={category.single.ac}
              facts={category.single.facts}
            />
          </div>
        </>
      ) : null}

      {/* Comparison sections in order */}
      {category.sections.map((s) => (
        <SectionRenderer key={s.id} section={s} />
      ))}

      {/* Sector Rotation extras */}
      {category.extras ? (
        <>
          <h2 className="subhead">Strategy deep-dive</h2>
          <ExtrasRenderer extras={category.extras} />
        </>
      ) : null}
    </>
  );
}
