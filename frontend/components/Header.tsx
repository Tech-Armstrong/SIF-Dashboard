"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchBar } from "./SearchBar";
import { SifPrimerModal } from "./SifPrimerModal";

export function Header() {
  const [primerOpen, setPrimerOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand">
          <span className="brand__mark">SIF Research</span>
          <span className="brand__sub">Specialised Investment Funds</span>
        </Link>
        <div className="site-header__search">
          <SearchBar />
        </div>
        <button className="btn btn--ghost" onClick={() => setPrimerOpen(true)}>
          What is a SIF?
        </button>
      </div>
      <SifPrimerModal open={primerOpen} onClose={() => setPrimerOpen(false)} />
    </header>
  );
}
