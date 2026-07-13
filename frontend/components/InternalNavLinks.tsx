"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchInternalSession,
  hasInternalSession,
  internalToolsEnabledInUi,
  onInternalSessionChange,
} from "@/lib/internalAuth";

export function InternalNavLinks() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [showLinks, setShowLinks] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function refresh() {
      const authenticated = await fetchInternalSession();
      setShowLinks(internalToolsEnabledInUi() && (authenticated || hasInternalSession()));
    }

    void refresh();
    return onInternalSessionChange(refresh);
  }, []);

  if (!mounted || pathname.startsWith("/internal/login") || !showLinks) {
    return null;
  }

  return (
    <>
      <nav className="site-header__nav" aria-label="Internal tools">
        <Link href="/screener" className="site-header__nav-link">
          Screener
        </Link>
      </nav>
      <Link href="/portfolio/create" className="site-header__cta">
        Build portfolio
      </Link>
    </>
  );
}
