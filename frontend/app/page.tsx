"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CategorySummary } from "@/lib/types";
import { getCategories } from "@/lib/api";

export default function LandingPage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    getCategories()
      .then((c) => setCategories(c))
      .catch(() => setError(true));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="hero__eyebrow">SEBI · Effective 1 April 2025</div>
        <h1>Specialised Investment Funds, researched.</h1>
        <p className="hero__lede">
          Search any SIF by name, AMC, or category — then browse factual, static
          information and compare it against its peers. No returns chasing, just
          the facts.
        </p>
      </section>

      {error ? (
        <div className="error-state">
          Could not reach the backend. Start it with{" "}
          <code>uvicorn main:app --reload</code> in <code>backend/</code>.
        </div>
      ) : null}

      <h2 className="subhead">Browse by category</h2>
      <div className="tile-grid">
        {categories.map((c) => (
          <Link key={c.id} href={`/category/${c.id}`} className="tile">
            <span className="chip chip--soft">{c.chip}</span>
            <div className="tile__title">{c.title}</div>
            <p className="tile__desc">{c.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
