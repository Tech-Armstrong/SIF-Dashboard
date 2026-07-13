"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchInternalSession,
  hasInternalSession,
  internalAuthRequired,
} from "@/lib/internalAuth";

const LOGIN_PATH = "/internal/login";

export function InternalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(() => !internalAuthRequired());

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      if (!internalAuthRequired()) {
        if (!cancelled) setAllowed(true);
        return;
      }

      const authenticated = await fetchInternalSession();
      if (cancelled) return;

      if (authenticated || hasInternalSession()) {
        setAllowed(true);
        return;
      }

      const next = encodeURIComponent(window.location.pathname);
      router.replace(`${LOGIN_PATH}?next=${next}`);
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return <div className="portfolio-empty">Checking access...</div>;
  }

  return <>{children}</>;
}
