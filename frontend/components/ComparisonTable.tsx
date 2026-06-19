import type { CSSProperties } from "react";
import type { SectionCol } from "@/lib/types";
import { Html } from "./Html";

interface ComparisonTableProps {
  cols: SectionCol[];
  /** [rowLabel, col1, col2, ...] — cells align to cols; may contain inline HTML. */
  rows: string[][];
  /** 0-based index into cols of the column to emphasize (selected fund), or null. */
  emphCol?: number | null;
}

export function ComparisonTable({ cols, rows, emphCol = null }: ComparisonTableProps) {
  return (
    <div className="cmp-wrap">
      <table className="cmp">
        <thead>
          <tr>
            <th />
            {cols.map(([short, amc, color], i) => {
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
                {cols.map((_, ci) => {
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
