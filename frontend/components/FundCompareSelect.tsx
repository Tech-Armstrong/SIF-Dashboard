"use client";

import type { CSSProperties } from "react";
import type { SectionCol } from "@/lib/types";

interface FundCompareSelectProps {
  /** All comparable columns for the category: [short, amc, color]. */
  cols: SectionCol[];
  /** Color of the current fund's column — it is locked on (always shown). */
  ownColor: string;
  /** Set of currently-shown column shorts. */
  selected: Set<string>;
  onToggle: (short: string) => void;
}

/**
 * Chip-style multiselect for choosing which funds' columns appear in the
 * comparison tables on a fund detail page. The current fund is always shown
 * (its chip is locked); peers can be toggled on/off.
 */
export function FundCompareSelect({
  cols,
  ownColor,
  selected,
  onToggle,
}: FundCompareSelectProps) {
  return (
    <div className="cmp-select" role="group" aria-label="Funds to compare">
      <span className="cmp-select__label">Compare:</span>
      <div className="cmp-select__chips">
        {cols.map(([short, , color], i) => {
          const isOwn = color === ownColor;
          const on = isOwn || selected.has(short);
          const style = { ["--chip-color" as string]: color } as CSSProperties;
          return (
            <button
              key={`${short}-${i}`}
              type="button"
              className={`cmp-chip${on ? " is-on" : ""}${isOwn ? " is-own" : ""}`}
              style={style}
              aria-pressed={on}
              disabled={isOwn}
              onClick={() => !isOwn && onToggle(short)}
              title={isOwn ? "This fund (always shown)" : undefined}
            >
              {short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
