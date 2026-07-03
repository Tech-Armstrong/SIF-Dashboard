// Renders trusted, first-party inline HTML (the data contains <b>/<i> in cells,
// and primerHtml is a full trusted HTML string).

import type { ElementType } from "react";

export function Html({
  html,
  as: Tag = "span",
  className,
}: {
  html: string;
  as?: ElementType;
  className?: string;
}) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
