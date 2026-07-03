import type { ReactNode } from "react";
import type { Fact } from "@/lib/types";

const LEFT_PAIRED_KEYS = ["Inception", "Benchmark"] as const;
const RIGHT_PAIRED_KEYS = ["AUM", "Net equity"] as const;
const PAIRED_KEYS = new Set<string>([...LEFT_PAIRED_KEYS, ...RIGHT_PAIRED_KEYS]);

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="facts__row">
      <span className="facts__k">{label}</span>
      <span
        className={`facts__v ${
          label === "1Y Change" && value?.includes("-") ? "is-neg" : ""
        }${label === "1Y Change" && value?.includes("+") ? "is-pos" : ""}`}
      >
        {value || <span className="dash">—</span>}
      </span>
    </div>
  );
}

function PairedFactsGrid({ facts }: { facts: Fact[] }) {
  const factMap = new Map(facts.map(([k, v]) => [k, v]));
  const left = LEFT_PAIRED_KEYS.filter((k) => factMap.has(k)).map(
    (k) => [k, factMap.get(k)!] as Fact
  );
  const right = RIGHT_PAIRED_KEYS.filter((k) => factMap.has(k)).map(
    (k) => [k, factMap.get(k)!] as Fact
  );
  if (left.length === 0 && right.length === 0) return null;

  return (
    <div className="facts__paired">
      <div className="facts__col">
        {left.map(([k, v], i) => (
          <FactRow key={`${k}-${i}`} label={k} value={v} />
        ))}
      </div>
      <div className="facts__col">
        {right.map(([k, v], i) => (
          <FactRow key={`${k}-${i}`} label={k} value={v} />
        ))}
      </div>
    </div>
  );
}

function renderFacts(facts: Fact[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let pairedRendered = false;
  const hasPaired = facts.some(([k]) => PAIRED_KEYS.has(k));

  facts.forEach(([k, v], i) => {
    if (PAIRED_KEYS.has(k)) {
      if (!pairedRendered && hasPaired) {
        nodes.push(<PairedFactsGrid key="paired" facts={facts} />);
        pairedRendered = true;
      }
      return;
    }
    nodes.push(<FactRow key={`${k}-${i}`} label={k} value={v} />);
  });

  return nodes;
}

export function FactsList({
  facts,
  className = "facts",
}: {
  facts: Fact[];
  className?: string;
}) {
  return <div className={className}>{renderFacts(facts)}</div>;
}
