import Link from "next/link";
import type { CSSProperties } from "react";
import type { Fact, Tag } from "@/lib/types";

interface FundCardProps {
  name: string;
  fundId?: string;
  amc: string;
  /** ColorRef ("var(--isif)") used as the accent top-border. */
  accent: string;
  facts: Fact[];
  tags?: Tag[];
  /** Optional category label shown as a soft chip. */
  category?: string;
  /** When false, renders a static (non-link) card — used on the detail header. */
  href?: string | false;
}

export function FundCard({
  name,
  fundId,
  amc,
  accent,
  facts,
  tags,
  category,
  href,
}: FundCardProps) {
  // accent is a ColorRef and is valid CSS (tokens are injected on :root).
  const style = { borderTopColor: accent } as CSSProperties;

  const inner = (
    <>
      <div className="fund-card__amc">{amc}</div>
      <div className="fund-card__name">{name}</div>
      {category ? (
        <div className="fund-card__cat">
          <span className="chip chip--soft">{category}</span>
        </div>
      ) : null}
      <div className="facts">
        {facts.map(([k, v], i) => (
          <div className="facts__row" key={`${k}-${i}`}>
            <span className="facts__k">{k}</span>
            <span className="facts__v">{v || <span className="dash">—</span>}</span>
          </div>
        ))}
      </div>
      {tags && tags.length > 0 ? (
        <div className="tag-row">
          {tags.map(([label, cls], i) => (
            <span className={cls} key={`${label}-${i}`}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  if (href === false) {
    return (
      <div className="fund-card" style={style}>
        {inner}
      </div>
    );
  }

  return (
    <Link className="fund-card" style={style} href={href ?? `/funds/${fundId}`}>
      {inner}
    </Link>
  );
}
