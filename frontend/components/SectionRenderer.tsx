import type { CSSProperties } from "react";
import type {
  Holdings2Section,
  Sector2Section,
  Section,
  Stack2Section,
  CalloutsSection,
} from "@/lib/types";
import { ComparisonTable } from "./ComparisonTable";
import { Html } from "./Html";
import { isHiddenFactKey } from "@/lib/facts";

/**
 * Renders one comparison section by its `type`.
 *
 * `emphColor` is the selected fund's accent ColorRef (on the detail view) used
 * to emphasize its column / panel. Null on the category view.
 */
export function SectionRenderer({
  section,
  emphColor = null,
  visibleCols = null,
}: {
  section: Section;
  emphColor?: string | null;
  /** Set of column `short` names to show in table sections (null = all). */
  visibleCols?: Set<string> | null;
}) {
  return (
    <section>
      <h2 className="section-label">
        <span className="section-label__id">{section.id}</span>
        {section.title}
      </h2>
      <SectionBody
        section={section}
        emphColor={emphColor}
        visibleCols={visibleCols}
      />
    </section>
  );
}

function SectionBody({
  section,
  emphColor,
  visibleCols,
}: {
  section: Section;
  emphColor: string | null;
  visibleCols: Set<string> | null;
}) {
  switch (section.type) {
    case "table": {
      const emphCol = emphColor
        ? section.cols.findIndex((c) => c[2] === emphColor)
        : -1;
      return (
        <>
          {section.note ? <p className="section-note">{section.note}</p> : null}
          <ComparisonTable
            cols={section.cols}
            rows={section.rows.filter((row) => !isHiddenFactKey(row[0]))}
            emphCol={emphCol >= 0 ? emphCol : null}
            visibleCols={visibleCols}
          />
        </>
      );
    }
    case "holdings2":
      return <Holdings2 section={section} emphColor={emphColor} />;
    case "stack2":
      return <Stack2 section={section} emphColor={emphColor} />;
    case "sector2":
      return <Sector2 section={section} emphColor={emphColor} />;
    case "callouts":
      return <Callouts section={section} />;
    default:
      return null;
  }
}

function Panel({
  name,
  ac,
  total,
  rows,
  emph,
}: {
  name: string;
  ac: string;
  total?: string;
  rows: [string, string][];
  emph: boolean;
}) {
  const style = { borderTopColor: ac } as CSSProperties;
  return (
    <div className="panel" style={style}>
      <div className="panel__title">
        {name}
        {emph ? <span className="emph-flag"> · Selected</span> : null}
      </div>
      {total ? <div className="panel__total">Total: {total}</div> : null}
      <ul className="kvlist">
        {rows.map(([k, v], i) => (
          <li key={`${k}-${i}`}>
            <span>{k}</span>
            <span className="v">{v || <span className="dash">—</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Holdings2({
  section,
  emphColor,
}: {
  section: Holdings2Section;
  emphColor: string | null;
}) {
  return (
    <div className="duo">
      <Panel
        name={section.a.name}
        ac={section.a.ac}
        total={section.a.total}
        rows={section.a.rows}
        emph={emphColor === section.a.ac}
      />
      <Panel
        name={section.b.name}
        ac={section.b.ac}
        total={section.b.total}
        rows={section.b.rows}
        emph={emphColor === section.b.ac}
      />
    </div>
  );
}

function Sector2({
  section,
  emphColor,
}: {
  section: Sector2Section;
  emphColor: string | null;
}) {
  return (
    <>
      <div className="duo">
        <Panel
          name={section.a.name}
          ac={section.a.ac}
          rows={section.a.rows}
          emph={emphColor === section.a.ac}
        />
        <Panel
          name={section.b.name}
          ac={section.b.ac}
          rows={section.b.rows}
          emph={emphColor === section.b.ac}
        />
      </div>
      {section.note ? <p className="stack__note">{section.note}</p> : null}
    </>
  );
}

function Stack2({
  section,
  emphColor,
}: {
  section: Stack2Section;
  emphColor: string | null;
}) {
  return (
    <>
      {section.small ? <p className="section-note">{section.small}</p> : null}
      <div className="stack">
        {section.funds.map((f, fi) => {
          const emph = emphColor === f.ac;
          const total = f.seg.reduce((s, [, pct]) => s + pct, 0);
          return (
            <div
              className="stack__row"
              key={fi}
              style={emph ? { outline: `2px solid ${f.ac}`, outlineOffset: 4, borderRadius: 8 } : undefined}
            >
              <div className="stack__label">
                <span className="stack__name" style={{ color: f.ac }}>
                  {f.name}
                  {emph ? <span className="emph-flag"> · Selected</span> : null}
                </span>
              </div>
              <div className="stack__bar">
                {f.seg.map(([label, pct, color], si) => (
                  <div
                    key={si}
                    className="stack__seg"
                    style={{
                      width: `${total > 0 ? (pct / total) * 100 : 0}%`,
                      background: color,
                    }}
                    title={`${label}: ${pct}%`}
                  >
                    {pct >= 8 ? `${label} ${pct}%` : ""}
                  </div>
                ))}
              </div>
              <div className="stack__legend">
                {f.seg.map(([label, pct, color], si) => (
                  <span key={si}>
                    <span className="swatch" style={{ background: color }} />
                    {label} · {pct}%
                  </span>
                ))}
              </div>
              {f.note ? <div className="stack__note">{f.note}</div> : null}
            </div>
          );
        })}
      </div>
      {section.extra ? (
        <ComparisonTable
          cols={section.extra.cols.slice(1).map((c) => [c, "", "var(--line-strong)"])}
          rows={section.extra.rows}
        />
      ) : null}
    </>
  );
}

function Callouts({ section }: { section: CalloutsSection }) {
  return (
    <div>
      {section.items.map((item, i) => (
        <div className="callout" key={i}>
          <h3 className="callout__h">
            <Html html={item.h} />
          </h3>
          <Html as="p" className="callout__p" html={item.p} />
        </div>
      ))}
    </div>
  );
}
