"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Fact } from "@/lib/types";
import { getFundNavHistory } from "@/lib/api";

interface FundCardWithNavProps {
  name: string;
  fundId?: string;
  amc: string;
  accent: string;
  facts: Fact[];
  category?: string;
  href?: string | false;
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

export function FundCardWithNav({
  name,
  fundId,
  amc,
  accent,
  facts,
  category,
  href,
}: FundCardWithNavProps) {
  const [navData, setNavData] = useState<{
    nav?: number;
    change?: number;
    date?: string;
  }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fundId) {
      setLoading(false);
      return;
    }

    let active = true;
    getFundNavHistory(fundId, "1Y")
      .then((data) => {
        if (!active) return;
        if (data?.points && data.points.length > 0) {
          const latest = data.points[data.points.length - 1];
          const first = data.points[0];
          const change =
            first && latest && first.nav > 0
              ? ((latest.nav / first.nav - 1) * 100)
              : 0;

          setNavData({
            nav: latest.nav,
            change,
            date: latest.date,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fundId]);

  const style = { borderTopColor: accent } as CSSProperties;

  // Drop the static "NAV (Reg)" — the live "Latest NAV" below supersedes it.
  // (Kept only if the live NAV failed to load, so a card never shows no NAV.)
  const staticFacts =
    navData.nav !== undefined
      ? facts.filter(([k]) => k !== "NAV (Reg)")
      : facts;

  // Combine static facts with dynamic NAV data
  const allFacts: Fact[] = [
    ...staticFacts,
    ...(navData.nav !== undefined
      ? ([
          ["Latest NAV", fmtNav.format(navData.nav)],
          [
            "1Y Change",
            `${
              navData.change && navData.change >= 0 ? "+" : ""
            }${navData.change?.toFixed(2) ?? "-"}%`,
          ],
          [
            "As of",
            navData.date
              ? fmtDate.format(new Date(`${navData.date}T00:00:00`))
              : "-",
          ],
        ] as Fact[])
      : []),
  ];

  const inner = (
    <>
      <div className="fund-card__amc">{amc}</div>
      <div className="fund-card__name">{name}</div>
      {category ? (
        <div className="fund-card__cat">
          <span className="chip chip--soft">{category}</span>
        </div>
      ) : null}
      <div className="facts">
        {allFacts.map(([k, v], i) => (
          <div className="facts__row" key={`${k}-${i}`}>
            <span className="facts__k">{k}</span>
            <span
              className={`facts__v ${
                k === "1Y Change" && v?.includes("-") ? "is-neg" : ""
              }${k === "1Y Change" && v?.includes("+") ? "is-pos" : ""}`}
            >
              {v || <span className="dash">—</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );

  if (href === false) {
    return (
      <div className="fund-card" style={style}>
        {inner}
      </div>
    );
  }

  return (
    <Link className="fund-card" style={style} href={href ?? `/funds/${fundId}`}>
      {inner}
    </Link>
  );
}
