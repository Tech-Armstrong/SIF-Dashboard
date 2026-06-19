# SIF Code → NAV Chart Integration Guide

**Status**: ✅ Ready to Deploy  
**Date**: 12 June 2026

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Next.js) - Fund Detail Page                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ GET /api/funds/{fundId}/nav-history
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend (FastAPI) - main.py :: get_fund_nav_history()      │
│  • Looks up fund by fundId                                  │
│  • Extracts sifCode from fund entry                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ Pass sifCode to nav_history_for_fund()
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend - nav_history.py :: nav_history_for_fund()          │
│  • Uses sifCode as scheme_code directly                     │
│  • Queries DuckDB/Blob via get_connection()                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ DuckDB query on nav_history view
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Azure Blob Storage - nav_history parquet                    │
│  scheme_code | nav_date   | nav                             │
│  SIF-21      | 2026-06-11 | 906.24                          │
│  SIF-21      | 2026-06-10 | 908.67                          │
│  ...         | ...        | ...                             │
└─────────────────────────────────────────────────────────────┘
                       │ DuckDB returns rows
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend - nav_history.py                                    │
│  • Formats as {date, nav} objects                           │
│  • Returns JSON with period, status, asOf                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON response
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend - renders ApexCharts with NAV points               │
│  • X-axis: dates                                            │
│  • Y-axis: NAV values                                       │
│  • Shows latest NAV (asOf)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup Checklist

### 1️⃣ Backend Configuration

**File**: `backend/.env` (create if not exists)

```bash
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointProtocol=https;AccountName=YOUR_ACCOUNT;AccountKey=YOUR_KEY;EndpointSuffix=core.windows.net

# Or use connection string from Azure Portal
# Storage Account → Access Keys → Connection string
```

**Installation**: Ensure DuckDB azure extension is available

```bash
pip install duckdb>=0.10.0
# The azure extension will auto-install on first use
```

### 2️⃣ Azure Blob Folder Structure

Your `mfnavdata` container must have:

```
mfnavdata/
├── processed/
│   ├── scheme_master.parquet
│   │   Columns: scheme_code, fund_house, category, scheme_name
│   │
│   └── nav_history/
│       ├── year=2024/
│       │   └── data.parquet
│       ├── year=2025/
│       │   └── data.parquet
│       └── year=2026/
│           └── data.parquet
│           Columns: scheme_code, nav_date, nav
```

**Important**: The `scheme_code` values in these parquet files MUST match the `sifCode` values in `data/funds.json`:
- `SIF-21` for Diviniti Equity Long-Short
- `SIF-62` for Arudha Equity Long-Short
- etc.

### 3️⃣ Verify Data Alignment

Create a test script to verify scheme_code matches:

```python
# test_nav_alignment.py
from config.duckdb_session import get_connection

with get_connection() as con:
    # Check if our SIF codes exist in Blob
    sif_codes = ["SIF-21", "SIF-62", "SIF-1", "SIF-9"]
    for code in sif_codes:
        rows = con.execute(
            "SELECT COUNT(*) FROM nav_history WHERE scheme_code = ?",
            [code]
        ).fetchone()
        count = rows[0] if rows else 0
        status = "✅" if count > 0 else "❌"
        print(f"{status} {code}: {count} NAV records")
```

---

## Data Flow

### Endpoint: `GET /api/funds/{fund_id}/nav-history?period=1Y`

#### Request
```bash
curl http://localhost:8000/api/funds/sif-21/nav-history?period=1Y
```

#### Response (Success)
```json
{
  "fundId": "sif-21",
  "period": "1Y",
  "status": "ok",
  "schemeCode": "SIF-21",
  "matchedName": "Diviniti Equity Long-Short",
  "matchStatus": "static_data",
  "matchScore": 1,
  "hasNav": true,
  "asOf": "2026-06-12",
  "points": [
    { "date": "2025-06-12", "nav": 895.23 },
    { "date": "2025-06-13", "nav": 897.45 },
    ...
    { "date": "2026-06-12", "nav": 906.24 }
  ],
  "message": null
}
```

#### Response (Missing Blob Data)
```json
{
  "fundId": "sif-21",
  "period": "1Y",
  "status": "no_nav",
  "schemeCode": "SIF-21",
  "matchedName": "Diviniti Equity-Short",
  "matchStatus": "static_data",
  "matchScore": 1,
  "hasNav": false,
  "asOf": null,
  "points": [],
  "message": "No NAV points were returned for this period."
}
```

---

## Frontend Integration

### Fund Detail Page Component

The frontend already expects this response structure. When rendering:

```tsx
// lib/useFundNavHistory.ts
const response = await fetch(
  `/api/funds/${fundId}/nav-history?period=${period}`
);
const data = await response.json();

if (data.hasNav && data.points.length > 0) {
  // Render chart
  renderChart({
    series: [{
      name: data.matchedName,
      data: data.points.map(p => ({
        x: new Date(p.date),
        y: p.nav
      }))
    }],
    xaxis: { type: 'datetime' },
    yaxis: { title: { text: 'NAV' } }
  });
} else {
  // Show "No data" message
  showMessage(data.message || "NAV data unavailable");
}
```

---

## Testing the Integration

### Step 1: Start Backend with Blob Connection

```bash
cd backend
export AZURE_STORAGE_CONNECTION_STRING="<your_connection_string>"
python -m uvicorn main:app --reload --port 8000
```

### Step 2: Test NAV History Endpoint

```bash
# Test with Diviniti (SIF-21)
curl http://localhost:8000/api/funds/sif-21/nav-history?period=1M

# Test with Arudha (SIF-62)
curl http://localhost:8000/api/funds/sif-62/nav-history?period=3M
```

### Step 3: Check Logs

The backend will log:
- ✅ `nav_history_for_fund: Querying for scheme_code=SIF-21`
- ✅ `Found 252 NAV points for SIF-21 in period 1Y`
- ❌ `No NAV points were returned for this period`

### Step 4: Verify Frontend Display

```bash
cd frontend
npm run dev
# Navigate to http://localhost:3000/funds/sif-21
# Should display NAV chart if Blob data exists
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `missing_scheme_code` | Fund has no `sifCode` | Verify all 16 funds have `sifCode` in funds.json |
| `No NAV points` | SIF code not in Blob | Check if scheme_code values in parquet match SIF codes |
| `unavailable` | Azure Connection String not set | Set `AZURE_STORAGE_CONNECTION_STRING` in backend/.env |
| `Azure extension error` | DuckDB azure not installed | Run `pip install duckdb[azure]>=0.10.0` |
| Empty chart | Blob parquet corrupted | Verify parquet integrity: `duckdb -c "SELECT COUNT(*) FROM read_parquet('...')"`  |

---

## Code Changes Summary

**✅ Already Complete:**
- `data/funds.json` → all 16 funds now have `sifCode`
- `nav_history.py` → already handles sifCode lookup (lines 35-46)
- `duckdb_session.py` → Azure Blob connection ready
- `main.py` → `/api/funds/{fund_id}/nav-history` endpoint ready

**🔄 To Deploy:**
1. Set `AZURE_STORAGE_CONNECTION_STRING` in backend/.env
2. Verify Blob `scheme_code` values match our SIF codes
3. Test endpoints and frontend rendering
4. (Optional) Add monitoring/caching for performance

---

## Performance Considerations

- **DuckDB caching**: Connections are in-memory; each request opens fresh. Consider connection pooling if needed.
- **Blob reads**: DuckDB uses HTTP range requests; only fetches required row-groups/columns
- **Parquet partitioning**: Year partitions are pruned automatically (e.g., 1Y query skips old years)
- **Frontend chart**: Use virtualization for >5000 points

---

## Example: Adding a New Fund

1. Add to `fundsIndex` in `data/funds.json`:
   ```json
   {
     "name": "New Fund Name",
     "amc": "AMC Name",
     "sifCode": "SIF-XXX",  ← Use AMFI code
     ...
   }
   ```

2. Ensure Blob has NAV data:
   ```sql
   SELECT COUNT(*) FROM nav_history WHERE scheme_code = 'SIF-XXX'
   ```

3. Test endpoint:
   ```bash
   curl http://localhost:8000/api/funds/sif-xxx/nav-history?period=1Y
   ```

Done! NAV chart will render automatically.

---

## References

- **AMFI SIF Codes**: `SIF_CODE_MAPPING_REFERENCE.md`
- **DuckDB Azure**: https://duckdb.org/docs/extensions/azure.html
- **Frontend NAV Component**: `frontend/components/FundNavChart.tsx` (if exists)
- **Backend NAV Logic**: `backend/config/nav_history.py`
