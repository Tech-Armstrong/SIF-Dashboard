# Cursor Task — Build the SIF Research Dashboard (Next.js + Python)

You are the **executor**. Build exactly what is specified below. Do not invent fund data, do not add features outside the scope list, and do not touch returns/performance logic. Work in **additive, surgical diffs**. If something is ambiguous, diagnose against the actual `funds.json` schema before writing code — do not guess.

---

## 1. What we're building

A **research dashboard for SEBI Specialised Investment Funds (SIFs)**. It lets a user **search** for a fund by name, category, or AMC, then **browse static, factual information** about that fund and compare it against peers in the same category.

This is a static-knowledge product. **All fund data is read-only and comes from a single JSON file.** There is **no returns engine, no live NAV/returns tracking, and no performance charts** (see Exclusions).

## 2. Stack & ownership split

- **Frontend:** Next.js 15 (App Router) + TypeScript. Owns all UI, search interactions, and rendering.
- **Backend:** Python **FastAPI**. Owns data access + search/filter only. It is intentionally thin: it loads the JSON once at startup and serves it. No database, no returns computation.
- **Data:** `data/funds.json` (provided — do not regenerate or hand-edit fund values). This is the single source of truth.

```
repo/
├─ frontend/                 # Next.js 15 app
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx            # landing: search bar + category browse + fund grid
│  │  ├─ funds/[fundId]/page.tsx   # single fund detail (+ peer comparison)
│  │  └─ category/[categoryId]/page.tsx  # category comparison view
│  ├─ components/
│  │  ├─ SearchBar.tsx
│  │  ├─ FundCard.tsx
│  │  ├─ ComparisonTable.tsx
│  │  ├─ SifPrimerModal.tsx
│  │  └─ WhereItFits.tsx
│  ├─ lib/api.ts             # typed fetch helpers to the Python backend
│  ├─ lib/types.ts           # TS types mirroring the JSON schema (section below)
│  └─ lib/colors.ts          # resolves "var(--isif)" -> hex via meta.colorTokens
├─ backend/
│  ├─ main.py                # FastAPI app
│  ├─ search.py              # search/filter logic
│  └─ requirements.txt
└─ data/
   └─ funds.json             # PROVIDED — source of truth, do not edit values
```

## 3. The data (read this before writing anything)

`data/funds.json` top-level keys:

- `meta` — title, SEBI effective date, min investment, and **`colorTokens`** (a map of `--isif` → `#c0392b`, etc.). Use this to resolve every `var(--x)` color string the data contains.
- `primerHtml` — a static HTML string ("What is a SIF?") for the primer modal. Render with `dangerouslySetInnerHTML` (it is trusted, first-party content).
- `wherefits` — comparison tables (MF vs SIF vs PMS/AIF), keyed `ex` / `aif` / `hybrid`. Each has `cols`, `rows`, `bottom`.
- `categories` — array of 4 categories. Each has:
  - `id` (slug), `chip`, `chipColor`, `title`, `desc`
  - `cols` — funds compared in the category: `[{ short, amc, color }]`
  - `cards` — at-a-glance fund cards: `[{ ac, amc, name, facts: [[k,v]], tags: [[label, cssClass]] }]`
  - `single` — for the Sector Rotation category (one fund), same shape as a card with extra `facts`
  - `sections` — ordered comparison sections. Each `{ id, title, type, cols, rows, note?, ... }`. Section **`type`** drives layout:
    - `table` — `rows` is `[[rowLabel, col1, col2, ...]]`; first cell is the row header, the rest align to `cols`. Cell strings may contain inline `<b>`/`<i>` HTML — render as trusted HTML.
    - `holdings2` — `{ a, b }` each `{ name, ac, total, rows: [[holding, weight]] }`.
    - `stack2` — `{ funds: [{ name, ac, seg: [[label, pct, color]], note }], extra: { cols, rows } }`. Render as a labelled stacked bar (pure presentational, **not** a returns chart).
    - `sector2` — `{ a, b }` each `{ name, ac, rows: [[sector, weight]] }`, plus `note`.
    - `callouts` — `{ items: [...] }`.
  - `extras` (Sector Rotation only) — structured blocks: `alloc`, `model`, `dispersion`, `advantages`, `phases`, `compare`, `insight`. Render each faithfully; they are qualitative/strategy content, not returns.
  - `wherefits` — a key (`ex`/`aif`/`hybrid`) pointing into the top-level `wherefits` map.
- `fundsIndex` — flat array for search: `[{ name, amc, category, categoryId, accent, facts, tags }]`. **This is what the search bar queries.**

> The performance/returns section (originally section "I", type `chart-and-perftable`) and the live-returns table have already been **removed** from this JSON. Do not re-add them or build anything that consumes returns.

## 4. Scope — BUILD this

1. **Search bar** (primary entry point, on the landing page and persistent in the header):
   - Free-text search over `fundsIndex` matching **fund name**, **AMC**, and **category** (case-insensitive, substring/fuzzy-ish — simple normalized `includes` is fine; rank exact-prefix matches first).
   - Results show as a dropdown/list of matching funds (name + AMC + category chip). Selecting one routes to that fund's detail page.
   - Searching a category term should also surface a "View category" result that routes to the category view.
   - Search runs against the **Python backend** endpoint (below), not client-only, so the backend has a real job.
2. **Landing page:** the search bar, a "What is a SIF?" button opening the primer modal (`primerHtml`), category tiles (4 categories with chip/title/desc), and a grid of all fund cards grouped by category.
3. **Category view** (`/category/[categoryId]`): the category header (chip/desc), the fund cards, the `sections` rendered in order by `type`, and the relevant `WhereItFits` table.
4. **Fund detail view** (`/funds/[fundId]`): the selected fund's card/facts/tags up top, then the category's comparison sections **with the selected fund's column emphasized** so the user reads it in peer context.
5. **SIF primer modal** from `primerHtml`.
6. **Visual direction:** reproduce the source's editorial/print aesthetic — **Fraunces** (serif headings) + **Archivo** (sans body), the paper/ink palette and gold accent from `meta.colorTokens`, fund-accent top-borders on cards, dashed row separators, sticky table headers. Keep it clean and document-like, not dashboard-y.

## 5. Scope — DO NOT build (hard exclusions)

- ❌ **No live returns tracker tab** (the original "p5" tab) — do not port it in any form.
- ❌ **No returns logic of any kind:** no fetching live returns, no parsing/normalizing return strings, no return computation, no bar-fill return animations, no `chart-and-perftable` rendering, no caching/localStorage of returns.
- ❌ **No mock or placeholder fund data.** If a field is missing in `funds.json`, render nothing / a neutral dash — never fabricate a value.
- ❌ No auth, no DB, no analytics, no extra pages beyond those listed.

## 6. Backend contract (FastAPI, thin)

Load `data/funds.json` once at startup into memory. Endpoints:

- `GET /api/funds` → `fundsIndex`
- `GET /api/search?q=...` → filtered + ranked subset of `fundsIndex` (name/amc/category match) **plus** any matched categories as `{ type: "category", id, title }`
- `GET /api/categories` → list of `{ id, chip, title, desc }`
- `GET /api/categories/{categoryId}` → the full category object
- `GET /api/funds/{fundId}` → the fund's index entry + its `categoryId` so the frontend can pull the category for peer comparison. (Derive a stable `fundId` slug from the fund name; do this consistently on both ends.)
- `GET /api/meta` → `meta` (incl. `colorTokens`), `primerHtml`, `wherefits`

Enable CORS for the Next.js dev origin. No returns endpoints.

## 7. Constraints & working style

- **Additive & surgical.** Don't refactor or rename things outside this task. Small, reviewable diffs.
- **Diagnose before rewriting.** If a render looks wrong, trace it to the actual JSON shape first; fix the specific cause, don't rewrite the renderer.
- **Faithful to the data.** Types in `lib/types.ts` must mirror the JSON exactly (rows are tuples/arrays, not pre-flattened objects). Inline `<b>`/`<i>` in cell strings is expected — render as trusted HTML.
- **Resolve colors** through `meta.colorTokens`; never hardcode hex that's already a token.
- Provide a short **README** with run commands for both `frontend/` and `backend/`.

## 8. Definition of done

- `funds.json` is the only data source; nothing fabricated; grep the repo for any returns logic and confirm there is none.
- Search works across name/AMC/category via the backend and routes correctly.
- All 4 categories render every section by `type` without errors, including the Sector Rotation `extras` and the single-fund layout.
- Fund detail emphasizes the selected fund's column in the comparison tables.
- Primer modal and WhereItFits tables render.
- The look matches the source aesthetic (fonts, palette, accents).

---

**Start by:** (1) reading `data/funds.json` end-to-end, (2) writing `lib/types.ts` to match it exactly, (3) standing up the FastAPI endpoints against the real file, then (4) building the pages. Show me the types and the backend before building the full UI.
