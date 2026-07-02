import type { CSSProperties } from "react";
import type { SectionCol } from "@/lib/types";
import { Html } from "./Html";

interface ComparisonTableProps {
  cols: SectionCol[];
  /** [rowLabel, col1, col2, ...] — cells align to cols; may contain inline HTML. */
  rows: string[][];
  /** 0-based index into cols of the column to emphasize (selected fund), or null. */
  emphCol?: number | null;
  /**
   * Set of column `short` names to show. When provided, columns whose short is
   * not in the set are hidden (along with their cells). Null/undefined = all.
   */
  visibleCols?: Set<string> | null;
}

export function ComparisonTable({
  cols,
  rows,
  emphCol = null,
  visibleCols = null,
}: ComparisonTableProps) {
  // Indices of the columns to render (preserving original order). When no
  // filter is given, every column is shown.
  const keptIdx = cols
    .map((_, i) => i)
    .filter((i) => visibleCols == null || visibleCols.has(cols[i][0]));

  return (
    <div className="cmp-wrap">
      <table className="cmp">
        <thead>
          <tr>
            <th />
            {keptIdx.map((i) => {
              const [short, amc, color] = cols[i];
              const emph = i === emphCol;
              const style = emph
                ? ({ ["--emph-color" as string]: color } as CSSProperties)
                : undefined;
              return (
                <th key={`${short}-${i}`} className={emph ? "col--emph" : undefined} style={style}>
                  <span className="cmp__colhead" style={{ borderTopColor: color }}>
                    <span className="cmp__colshort">{short}</span>
                    <span className="cmp__colamc">{amc}</span>
                    {emph ? <span className="emph-flag">Selected</span> : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const [label, ...cells] = row;
            return (
              <tr key={ri}>
                <th scope="row">
                  <Html html={label} />
                </th>
                {keptIdx.map((ci) => {
                  const emph = ci === emphCol;
                  const cell = cells[ci];
                  const color = cols[ci]?.[2];
                  const style = emph
                    ? ({ ["--emph-color" as string]: color } as CSSProperties)
                    : undefined;
                  return (
                    <td key={ci} className={emph ? "col--emph" : undefined} style={style}>
                      {cell ? <Html html={cell} /> : <span className="dash">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
