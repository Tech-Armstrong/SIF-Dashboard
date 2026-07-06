// Typed fetch helpers to the Python (FastAPI) backend.

import type {
  Category,
  CategorySummary,
  FundDetailResponse,
  FundNavHistoryResponse,
  FundReturnsResponse,
  FundIndexEntryWithId,
  MetaResponse,
  NavPeriod,
  SearchResult,
} from "./types";

function resolveApiBase(): string {
  if (typeof window === "undefined" && process.env.API_INTERNAL_BASE) {
    return process.env.API_INTERNAL_BASE;
  }
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
}

export const API_BASE = resolveApiBase();

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    // Always read fresh from the thin backend; no returns caching of any kind.
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

/** Stable slug from a fund name — MUST match backend search.slugify. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getFunds(): Promise<FundIndexEntryWithId[]> {
  return getJSON<FundIndexEntryWithId[]>("/api/funds");
}

export function searchFunds(q: string): Promise<SearchResult[]> {
  return getJSON<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
}

export function getCategories(): Promise<CategorySummary[]> {
  return getJSON<CategorySummary[]>("/api/categories");
}

export function getCategory(categoryId: string): Promise<Category> {
  return getJSON<Category>(`/api/categories/${encodeURIComponent(categoryId)}`);
}

export function getFund(fundId: string): Promise<FundDetailResponse> {
  return getJSON<FundDetailResponse>(`/api/funds/${encodeURIComponent(fundId)}`);
}

export function getFundNavHistory(
  fundId: string,
  period: NavPeriod,
): Promise<FundNavHistoryResponse> {
  return getJSON<FundNavHistoryResponse>(
    `/api/funds/${encodeURIComponent(fundId)}/nav-history?period=${encodeURIComponent(period)}`,
  );
}

export function getFundReturns(fundId: string): Promise<FundReturnsResponse> {
  return getJSON<FundReturnsResponse>(
    `/api/funds/${encodeURIComponent(fundId)}/returns`,
  );
}

export function getMeta(): Promise<MetaResponse> {
  return getJSON<MetaResponse>("/api/meta");
}
