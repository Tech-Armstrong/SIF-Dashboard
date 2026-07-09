import type { Fact } from "@/lib/types";

const HIDDEN_FACT_KEYS = new Set(["Plans", "Options"]);

function valueClass(label: string, value: string): string {
  if (label !== "1Y Change") return "";
  if (value?.includes("-")) return "is-neg";
  if (value?.includes("+")) return "is-pos";
  return "";
}

export function FactsList({
  facts,
  className = "facts",
}: {
  facts: Fact[];
  className?: string;
}) {
  const visible = facts.filter(([k]) => !HIDDEN_FACT_KEYS.has(k));

  return (
    <div className={className}>
      <table className="facts-table">
        <tbody>
          {visible.map(([k, v], i) => (
            <tr key={`${k}-${i}`}>
              <th scope="row">{k}</th>
              <td className={valueClass(k, v)}>
                {v || <span className="dash">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
