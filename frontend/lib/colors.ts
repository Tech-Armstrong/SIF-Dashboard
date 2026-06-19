// Resolves color references coming from the data.
//
// The data uses two kinds of color strings:
//   - token refs like "var(--isif)"  -> resolved via meta.colorTokens
//   - raw hex like "#9b3328"          -> passed through unchanged
//
// We never hardcode a hex that already exists as a token; we look it up in
// meta.colorTokens.

export type ColorTokens = Record<string, string>;

const VAR_RE = /^var\(\s*(--[\w-]+)\s*\)$/;

/**
 * Resolve a ColorRef to a concrete CSS color.
 *
 * If `tokens` is provided, "var(--x)" is mapped to its hex. If not provided,
 * the original string is returned (valid CSS once the tokens are injected as
 * :root custom properties).
 */
export function resolveColor(ref: string | undefined, tokens?: ColorTokens): string {
  if (!ref) return "transparent";
  const m = ref.match(VAR_RE);
  if (!m) return ref; // raw hex or other literal
  const name = m[1];
  if (tokens && name in tokens) return tokens[name];
  return ref; // leave as var() — resolved by :root custom properties
}

/** Build a CSS string of `--token: #hex;` declarations from a tokens map. */
export function tokensToCssVars(tokens: ColorTokens): string {
  return Object.entries(tokens)
    .map(([name, hex]) => `${name}: ${hex};`)
    .join(" ");
}
