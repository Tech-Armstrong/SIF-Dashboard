# SIF Research Dashboard

A research dashboard for **SEBI Specialised Investment Funds (SIFs)**. Search a
fund by name, AMC, or category, then browse static, factual information and
compare it against peers in the same category.

This is a **static-knowledge product**. All fund data is read-only and comes
from a single JSON file (`data/funds.json`). There is **no returns engine, no
live NAV/returns tracking, and no performance charts**.

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript — all UI, search, rendering.
- **Backend:** Python FastAPI — thin data access + search/filter only. Loads the
  JSON once at startup and serves it. No database, no returns computation.
- **Data:** `data/funds.json` — the single source of truth (do not edit values).

```
repo/
├─ frontend/      # Next.js 15 app
├─ backend/       # FastAPI app (main.py, search.py, requirements.txt)
└─ data/
   └─ funds.json  # source of truth
```

## Run the backend (FastAPI)

From `backend/`:

```bash
# 1. Create & activate a virtualenv
python -m venv .venv
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the API (http://localhost:8000)
uvicorn main:app --reload --port 8000
```

Endpoints (all `GET`, CORS enabled for `http://localhost:3000`):

| Endpoint | Returns |
|---|---|
| `/api/funds` | the full `fundsIndex` (each entry gets a stable `fundId`) |
| `/api/search?q=...` | ranked fund matches (name/AMC/category) + matched categories |
| `/api/categories` | `[{ id, chip, title, desc }]` |
| `/api/categories/{categoryId}` | the full category object |
| `/api/funds/{fundId}` | the fund's index entry + its `categoryId` |
| `/api/meta` | `meta` (incl. `colorTokens`), `primerHtml`, `wherefits` |

## Run the frontend (Next.js)

From `frontend/`:

```bash
npm install
npm run dev      # http://localhost:3000
```

The frontend reads the backend base URL from `NEXT_PUBLIC_API_BASE`
(default `http://localhost:8000`, set in `frontend/.env.local`).

> Start the backend first so the dashboard can load data and color tokens.

## Notes

- Color strings in the data (e.g. `var(--isif)`) are resolved through
  `meta.colorTokens`, which the frontend injects as `:root` custom properties.
- Cell strings may contain inline `<b>`/`<i>`; the primer is a full HTML string.
  Both are trusted, first-party content and rendered as HTML.
- No returns logic exists anywhere in the repo, by design.
