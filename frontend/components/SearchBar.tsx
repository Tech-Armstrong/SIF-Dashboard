"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/types";
import { searchFunds } from "@/lib/api";

interface SearchBarProps {
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  placeholder = "Search funds by name, AMC, or category…",
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search against the Python backend.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchFunds(term)
        .then((r) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(r: SearchResult) {
    setOpen(false);
    setQ("");
    if (r.type === "category") {
      router.push(`/category/${r.id}`);
    } else {
      router.push(`/funds/${r.fundId}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const funds = results.filter((r) => r.type === "fund");
  const cats = results.filter((r) => r.type === "category");
  const showPanel = open && q.trim().length > 0;

  return (
    <div className="search" ref={boxRef}>
      <input
        className="search__input"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search SIF funds"
        autoComplete="off"
      />
      {showPanel ? (
        <div className="search__panel" role="listbox">
          {loading && results.length === 0 ? (
            <div className="search__empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="search__empty">No matches for “{q.trim()}”.</div>
          ) : (
            <>
              {funds.length > 0 ? <div className="search__group">Funds</div> : null}
              {funds.map((r) => {
                if (r.type !== "fund") return null;
                const idx = results.indexOf(r);
                return (
                  <button
                    type="button"
                    key={r.fundId}
                    className={`search__item${
                      idx === active ? " search__item--active" : ""
                    }`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(r)}
                  >
                    <span
                      className="search__accent"
                      style={{ background: r.accent }}
                    />
                    <span className="search__item-main">
                      <span className="search__item-name">{r.name}</span>
                      <span className="search__item-sub">{r.amc}</span>
                    </span>
                    <span className="chip chip--soft">{r.category}</span>
                  </button>
                );
              })}
              {cats.length > 0 ? (
                <div className="search__group">Categories</div>
              ) : null}
              {cats.map((r) => {
                if (r.type !== "category") return null;
                const idx = results.indexOf(r);
                return (
                  <button
                    type="button"
                    key={r.id}
                    className={`search__item${
                      idx === active ? " search__item--active" : ""
                    }`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(r)}
                  >
                    <span className="search__item-main">
                      <span className="search__item-name">View category · {r.title}</span>
                      <span className="search__item-sub">Compare peers in this category</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
