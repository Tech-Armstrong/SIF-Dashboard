"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MetaResponse } from "@/lib/types";
import type { ColorTokens } from "@/lib/colors";
import { getMeta } from "@/lib/api";

interface MetaContextValue {
  meta: MetaResponse | null;
  tokens: ColorTokens;
  loading: boolean;
}

const MetaContext = createContext<MetaContextValue>({
  meta: null,
  tokens: {},
  loading: true,
});

export function useMeta(): MetaContextValue {
  return useContext(MetaContext);
}

/**
 * Provides meta (colorTokens, primerHtml, wherefits) to the tree.
 *
 * `initial` is the server-fetched meta (used to seed context and avoid a
 * second round-trip). If it is null (e.g. backend was down during SSR), the
 * provider fetches client-side and injects the color tokens onto :root.
 */
export function MetaProvider({
  initial,
  children,
}: {
  initial: MetaResponse | null;
  children: ReactNode;
}) {
  const [meta, setMeta] = useState<MetaResponse | null>(initial);
  const [loading, setLoading] = useState(initial === null);

  useEffect(() => {
    if (meta) return;
    let active = true;
    getMeta()
      .then((m) => {
        if (!active) return;
        setMeta(m);
        // Inject tokens onto :root when seeded client-side.
        const root = document.documentElement;
        for (const [name, hex] of Object.entries(m.meta.colorTokens)) {
          root.style.setProperty(name, hex);
        }
      })
      .catch(() => {
        /* backend unreachable — leave defaults */
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [meta]);

  const value = useMemo<MetaContextValue>(
    () => ({
      meta,
      tokens: meta?.meta.colorTokens ?? {},
      loading,
    }),
    [meta, loading]
  );

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}
