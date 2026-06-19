// Types mirroring data/funds.json EXACTLY.
// Rows are tuples/arrays as they appear in the JSON (not pre-flattened objects).
// Cell strings may contain inline <b>/<i> HTML — render as trusted HTML.

/** A color reference. Either a token string like "var(--isif)" or a raw hex like "#c0392b". */
export type ColorRef = string;

// ---------- meta ----------

export interface Meta {
  title: string;
  source: string;
  sebiEffective: string;
  minInvestment: string;
  /** Map of token name ("--isif") -> hex ("#c0392b"). */
  colorTokens: Record<string, string>;
}

// ---------- wherefits ----------

export interface WhereFitsTable {
  cols: string[];
  /** First cell is the row header; remaining cells align to cols[1..]. May contain inline HTML. */
  rows: string[][];
  bottom: string;
}

export type WhereFitsKey = "ex" | "aif" | "hybrid";

export type WhereFitsMap = Record<WhereFitsKey, WhereFitsTable>;

// ---------- shared: facts / tags / cards ----------

/** [key, value] */
export type Fact = [string, string];

/** [label, cssClass] e.g. ["LIVE", "tg live"] */
export type Tag = [string, string];

export interface Card {
  ac: ColorRef;
  amc: string;
  name: string;
  fundId?: string;
  facts: Fact[];
  tags: Tag[];
}

/** Sector Rotation single-fund block (no tags). */
export interface SingleFund {
  ac: ColorRef;
  amc: string;
  name: string;
  fundId?: string;
  facts: Fact[];
}

/** Per-category column descriptor: { short, amc, color }. */
export interface CategoryCol {
  short: string;
  amc: string;
  color: ColorRef;
}

// ---------- sections ----------

/** Section table column header: [short, amc, color]. */
export type SectionCol = [string, string, ColorRef];

export interface TableSection {
  id: string;
  title: string;
  type: "table";
  cols: SectionCol[];
  /** [rowLabel, col1, col2, ...]; cells align to cols. Cells may contain inline HTML. */
  rows: string[][];
  note?: string;
}

export interface HoldingsBlock {
  name: string;
  ac: ColorRef;
  total: string;
  /** [holding, weight] */
  rows: [string, string][];
}

export interface Holdings2Section {
  id: string;
  title: string;
  type: "holdings2";
  a: HoldingsBlock;
  b: HoldingsBlock;
}

/** [label, pct, color] — pct is numeric. Presentational stacked bar, NOT a returns chart. */
export type StackSeg = [string, number, string];

export interface StackFund {
  name: string;
  ac: ColorRef;
  seg: StackSeg[];
  note: string;
}

export interface Stack2Section {
  id: string;
  title: string;
  type: "stack2";
  small?: string;
  funds: StackFund[];
  extra: {
    cols: string[];
    rows: string[][];
  };
}

export interface SectorBlock {
  name: string;
  ac: ColorRef;
  /** [sector, weight] */
  rows: [string, string][];
}

export interface Sector2Section {
  id: string;
  title: string;
  type: "sector2";
  a: SectorBlock;
  b: SectorBlock;
  note: string;
}

export interface CalloutItem {
  h: string;
  /** May contain inline HTML. */
  p: string;
}

export interface CalloutsSection {
  id: string;
  title: string;
  type: "callouts";
  items: CalloutItem[];
}

export type Section =
  | TableSection
  | Holdings2Section
  | Stack2Section
  | Sector2Section
  | CalloutsSection;

// ---------- extras (Sector Rotation only) ----------

export interface ExtrasAlloc {
  title: string;
  small: string;
  /** [label, risk, min, max] — min/max numeric. */
  rows: [string, string, number, number][];
  note: string;
}

export interface ExtrasModelScenario {
  n: string;
  l: string;
  longs: number;
  shorts: number;
}

export interface ExtrasModel {
  title: string;
  desc: string;
  scenarios: ExtrasModelScenario[];
}

export interface ExtrasDispersion {
  title: string;
  desc: string;
  /** [period, bestName, bestVal, worstName, worstVal, gap] — numbers are numeric. */
  rows: [string, string, number, string, number, number][];
}

export interface ExtrasAdvantage {
  t: string;
  d: string;
}

export interface ExtrasPhases {
  title: string;
  desc: string;
  /** [phase, sifBehaviour, longOnlyBehaviour] */
  rows: [string, string, string][];
}

export interface ExtrasCompare {
  title: string;
  desc: string;
  cols: string[];
  rows: string[][];
}

export interface ExtrasInsight {
  h: string;
  /** Array of paragraphs; may contain inline HTML. */
  p: string[];
}

export interface Extras {
  alloc: ExtrasAlloc;
  model: ExtrasModel;
  dispersion: ExtrasDispersion;
  advantages: ExtrasAdvantage[];
  phases: ExtrasPhases;
  compare: ExtrasCompare;
  insight: ExtrasInsight;
}

// ---------- category ----------

export interface Category {
  id: string;
  chip: string;
  chipColor: ColorRef;
  title: string;
  desc: string;
  cols: CategoryCol[];
  cards: Card[] | null;
  single: SingleFund | null;
  sections: Section[];
  extras?: Extras;
  wherefits: WhereFitsKey | null;
}

/** Trimmed category descriptor returned by GET /api/categories. */
export interface CategorySummary {
  id: string;
  chip: string;
  title: string;
  desc: string;
}

// ---------- fundsIndex ----------

export interface FundIndexEntry {
  /** Static dashboard SIF code used in /funds/{sifCode}. */
  sifCode?: string;
  name: string;
  amc: string;
  category: string;
  categoryId: string;
  /** Legacy alias for sifCode. */
  schemeCode?: string;
  accent: ColorRef;
  facts: Fact[];
  tags: Tag[];
}

/** Same as FundIndexEntry but augmented by the backend with a stable slug. */
export interface FundIndexEntryWithId extends FundIndexEntry {
  fundId: string;
}

// ---------- search results ----------

export interface CategorySearchResult {
  type: "category";
  id: string;
  title: string;
}

export interface FundSearchResult extends FundIndexEntryWithId {
  type: "fund";
}

export type SearchResult = FundSearchResult | CategorySearchResult;

// ---------- /api/funds/{fundId} ----------

export interface FundDetailResponse extends FundIndexEntryWithId {
  categoryId: string;
}

// ---------- /api/funds/{fundId}/nav-history ----------

export type NavPeriod = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL";

export interface NavPoint {
  date: string;
  nav: number;
}

export interface FundNavHistoryResponse {
  fundId: string;
  period: NavPeriod;
  status: "ok" | "missing_scheme_code" | "no_nav" | "unavailable";
  schemeCode: string | null;
  matchedName: string | null;
  matchStatus: string;
  matchScore: number;
  hasNav: boolean;
  asOf: string | null;
  points: NavPoint[];
  message: string | null;
}

// ---------- /api/meta ----------

export interface MetaResponse {
  meta: Meta;
  primerHtml: string;
  wherefits: WhereFitsMap;
}

// ---------- top-level file shape ----------

export interface FundsFile {
  meta: Meta;
  primerHtml: string;
  wherefits: WhereFitsMap;
  categories: Category[];
  fundsIndex: FundIndexEntry[];
}
