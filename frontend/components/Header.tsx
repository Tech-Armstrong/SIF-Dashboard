import Link from "next/link";
import { InternalNavLinks } from "./InternalNavLinks";
import { SearchBar } from "./SearchBar";

export function Header() {
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
        <InternalNavLinks />
      </div>
    </header>
  );
}
