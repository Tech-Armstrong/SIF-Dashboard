/** Fact / comparison-row keys hidden across the dashboard UI. */
export const HIDDEN_FACT_KEYS = new Set([
  "Plans",
  "Options",
  "AUM",
  "Fund Size (AUM)",
  "NAV (Reg)",
]);

export function isHiddenFactKey(key: string): boolean {
  return HIDDEN_FACT_KEYS.has(key);
}

/** Facts shown on fund cards and exported to PDF (same filter as the UI). */
export function visibleFacts(facts: [string, string][]): [string, string][] {
  return facts.filter(([key]) => !isHiddenFactKey(key));
}

export function factValue(facts: [string, string][], key: string): string | null {
  const row = facts.find(([factKey]) => factKey === key);
  return row?.[1] ?? null;
}
