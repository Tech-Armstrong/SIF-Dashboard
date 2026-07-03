import type { Extras } from "@/lib/types";
import { ComparisonTable } from "./ComparisonTable";
import { Html } from "./Html";

/** Renders the Sector Rotation `extras` blocks faithfully (qualitative/strategy
 *  content — not returns). */
export function ExtrasRenderer({ extras }: { extras: Extras }) {
  const { alloc, model, dispersion, advantages, phases, compare, insight } = extras;

  return (
    <>
      {/* alloc */}
      <div className="extra-block">
        <h2 className="extra-block__title">{alloc.title}</h2>
        {alloc.small ? <p className="extra-block__desc">{alloc.small}</p> : null}
        <div>
          {alloc.rows.map(([label, risk, min, max], i) => (
            <div className="range-row" key={i}>
              <span>{label}</span>
              <span className="range-tag">{risk}</span>
              <span>
                <span className="range-track">
                  <span
                    className="range-fill"
                    style={{ left: `${min}%`, width: `${Math.max(max - min, 1)}%` }}
                  />
                </span>
                <span className="range-tag">
                  {min}%–{max}%
                </span>
              </span>
            </div>
          ))}
        </div>
        {alloc.note ? <p className="stack__note">{alloc.note}</p> : null}
      </div>

      {/* model */}
      <div className="extra-block">
        <h2 className="extra-block__title">{model.title}</h2>
        {model.desc ? <p className="extra-block__desc">{model.desc}</p> : null}
        <div className="scenario-grid">
          {model.scenarios.map((s, i) => (
            <div className="scenario" key={i}>
              <div className="scenario__bars">
                {Array.from({ length: s.longs }).map((_, k) => (
                  <span className="scenario__pip scenario__pip--long" key={`l${k}`} />
                ))}
                {Array.from({ length: s.shorts }).map((_, k) => (
                  <span className="scenario__pip scenario__pip--short" key={`s${k}`} />
                ))}
              </div>
              <div className="adv__t">{s.n}</div>
              <div className="adv__d">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* dispersion */}
      <div className="extra-block">
        <h2 className="extra-block__title">{dispersion.title}</h2>
        {dispersion.desc ? <p className="extra-block__desc">{dispersion.desc}</p> : null}
        <ComparisonTable
          cols={[
            ["Best sector", "", "var(--pos)"],
            ["Best %", "", "var(--pos)"],
            ["Worst sector", "", "var(--neg)"],
            ["Worst %", "", "var(--neg)"],
            ["Gap", "", "var(--gold)"],
          ]}
          rows={dispersion.rows.map(([period, bn, bv, wn, wv, gap]) => [
            period,
            bn,
            `${bv}%`,
            wn,
            `${wv}%`,
            `${gap}%`,
          ])}
        />
      </div>

      {/* advantages */}
      <div className="extra-block">
        <h2 className="extra-block__title">Key Advantages</h2>
        <div className="adv-grid">
          {advantages.map((a, i) => (
            <div className="adv" key={i}>
              <div className="adv__t">{a.t}</div>
              <div className="adv__d">{a.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* phases */}
      <div className="extra-block">
        <h2 className="extra-block__title">{phases.title}</h2>
        {phases.desc ? <p className="extra-block__desc">{phases.desc}</p> : null}
        <ComparisonTable
          cols={[
            ["qsif SIF strategy", "", "var(--qsif)"],
            ["Long-only quant equity", "", "var(--line-strong)"],
          ]}
          rows={phases.rows}
        />
      </div>

      {/* compare */}
      <div className="extra-block">
        <h2 className="extra-block__title">{compare.title}</h2>
        {compare.desc ? <p className="extra-block__desc">{compare.desc}</p> : null}
        <ComparisonTable
          cols={compare.cols.slice(1).map((c) => [c, "", "var(--line-strong)"])}
          rows={compare.rows}
        />
      </div>

      {/* insight */}
      <div className="insight">
        <h2 className="insight__h">{insight.h}</h2>
        {insight.p.map((para, i) => (
          <Html as="p" key={i} html={para} />
        ))}
      </div>
    </>
  );
}
