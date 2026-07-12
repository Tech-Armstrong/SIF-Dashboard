// Historical portfolio-NAV construction from per-fund NAV history.
//
// Methodology (growth-of-1 rebased index):
//   1. Find the "least common date" = the LATEST of every fund's EARLIEST NAV
//      date. From that base date t0 onward, every fund has data.
//   2. Build the union of all trading dates >= t0. For any date where a fund
//      has no published NAV, carry its last known NAV forward (forward-fill).
//   3. Rebase each fund to t0: rebased_i(t) = NAV_i(t) / NAV_i(t0)  (starts at 1).
//   4. Portfolio index(t) = Σ w_i * rebased_i(t), where w_i is the fund's
//      allocation fraction (weights sum to 1). Starts at 1.0 on t0.
//   5. Portfolio value(t) = totalAmount * index(t).

import type { NavPoint } from "./types";

/** One fund's inputs: its NAV series (any order) and its allocation weight. */
export interface PortfolioFundInput {
  fundId: string;
  /** Allocation fraction of the total portfolio (0..1). Weights should sum to 1. */
  weight: number;
  /** NAV points for this fund; may be unsorted and have gaps vs. other funds. */
  points: NavPoint[];
}

/** One point on the combined portfolio series. */
export interface PortfolioNavPoint {
  date: string;
  /** Growth-of-1 index value (1.0 at the base date). */
  index: number;
  /** Portfolio value in ₹ = totalAmount * index. */
  value: number;
}

export interface PortfolioNavSeries {
  /** The least-common (base) date the series is anchored to, or null if none. */
  baseDate: string | null;
  points: PortfolioNavPoint[];
  /** Total return over the series: index(end) / 1 - 1, as a percent. */
  totalReturnPct: number | null;
  /** Funds excluded because they had no NAV points at all. */
  excludedFundIds: string[];
}

/** Sort a fund's points by ascending ISO date (copy — does not mutate input). */
function sortByDate(points: NavPoint[]): NavPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build the historical portfolio NAV series.
 *
 * @param funds        per-fund NAV series + weights (weights are the allocation
 *                     fractions; they are renormalised internally so they sum to
 *                     1 across the funds that actually have data)
 * @param totalAmount  portfolio principal in ₹ used to scale the index to value
 */
export function buildPortfolioNavSeries(
  funds: PortfolioFundInput[],
  totalAmount: number,
): PortfolioNavSeries {
  const empty: PortfolioNavSeries = {
    baseDate: null,
    points: [],
    totalReturnPct: null,
    excludedFundIds: [],
  };

  // Keep only funds that have at least one NAV point and a positive weight.
  const excludedFundIds: string[] = [];
  const usable = funds.filter((f) => {
    if (f.points.length === 0) {
      excludedFundIds.push(f.fundId);
      return false;
    }
    return f.weight > 0;
  });
  if (usable.length === 0) return { ...empty, excludedFundIds };

  // Renormalise weights across the usable funds so they sum to 1. (If some
  // funds were dropped for having no data, the remainder still forms a valid
  // 100% portfolio index.)
  const weightSum = usable.reduce((acc, f) => acc + f.weight, 0);
  if (!(weightSum > 0)) return { ...empty, excludedFundIds };

  const sorted = usable.map((f) => ({
    fundId: f.fundId,
    weight: f.weight / weightSum,
    points: sortByDate(f.points),
  }));

  // (1) Least common date = latest of each fund's earliest date.
  const baseDate = sorted.reduce<string>((latest, f) => {
    const first = f.points[0].date;
    return first > latest ? first : latest;
  }, sorted[0].points[0].date);

  // Base NAV for each fund = its NAV on the base date, forward-filled: the last
  // point with date <= baseDate. Every fund has one because baseDate >= its
  // earliest date by construction.
  const baseNav = new Map<string, number>();
  for (const f of sorted) {
    let nav: number | null = null;
    for (const p of f.points) {
      if (p.date <= baseDate) nav = p.nav;
      else break;
    }
    if (nav == null || nav <= 0) {
      // Degenerate base NAV — cannot rebase this fund; drop it.
      excludedFundIds.push(f.fundId);
    } else {
      baseNav.set(f.fundId, nav);
    }
  }

  const active = sorted.filter((f) => baseNav.has(f.fundId));
  if (active.length === 0) return { ...empty, baseDate, excludedFundIds };

  // Re-renormalise weights again if the base-NAV check dropped any fund.
  const activeWeightSum = active.reduce((acc, f) => acc + f.weight, 0);

  // (2) Union of all trading dates >= baseDate, ascending.
  const dateSet = new Set<string>();
  for (const f of active) {
    for (const p of f.points) {
      if (p.date >= baseDate) dateSet.add(p.date);
    }
  }
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // Forward-fill cursor per fund: walk each fund's points in lockstep with the
  // shared date axis, carrying the last known NAV forward across gaps.
  const cursors = active.map((f) => ({
    fund: f,
    idx: 0,
    lastNav: baseNav.get(f.fundId) as number,
  }));

  const points: PortfolioNavPoint[] = dates.map((date) => {
    let index = 0;
    for (const c of cursors) {
      // Advance this fund's cursor to the latest point with date <= current date.
      while (
        c.idx < c.fund.points.length &&
        c.fund.points[c.idx].date <= date
      ) {
        c.lastNav = c.fund.points[c.idx].nav;
        c.idx += 1;
      }
      const rebased = c.lastNav / (baseNav.get(c.fund.fundId) as number);
      // Weight renormalised over active funds so the index still starts at 1.0.
      index += (c.fund.weight / activeWeightSum) * rebased;
    }
    return { date, index, value: totalAmount * index };
  });

  const totalReturnPct =
    points.length > 0 ? (points[points.length - 1].index - 1) * 100 : null;

  return { baseDate, points, totalReturnPct, excludedFundIds };
}
