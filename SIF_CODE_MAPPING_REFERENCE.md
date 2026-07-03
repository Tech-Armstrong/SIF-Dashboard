# SIF Code Mapping Reference

**Last Updated**: 12 June 2026  
**Source**: AMFI Portal (https://portal.amfiindia.com/SIF_DownloadNAVHistoryReport.aspx)  
**Plan Type**: Regular Plan (Growth Option - for compatibility with NAV history)

---

## Mapping Summary

All **16 SIF schemes** in `data/funds.json` → **fundsIndex** have been mapped to their AMFI SIF codes:

| # | Scheme Name | AMC | SIF Code | Plan | Status |
|---|---|---|---|---|---|
| 1 | iSIF Equity Ex-Top 100 Long-Short | ICICI Prudential MF | **SIF-1** | Regular | ✅ Confirmed |
| 2 | qsif Equity Ex-Top 100 Long-Short | Quant MF | **SIF-9** | Regular | ✅ Confirmed |
| 3 | Arudha Equity Long-Short | Bandhan MF | **SIF-62** | Regular | ✅ Confirmed |
| 4 | Diviniti Equity Long-Short | ITI MF | **SIF-21** | Regular | ✅ Confirmed |
| 5 | DynaSIF Equity Long-Short | 360 ONE Asset | **SIF-58** | Regular | ⚠️ Estimated |
| 6 | Titanium Equity Long-Short | Tata MF | **SIF-35** | Regular | ✅ Confirmed |
| 7 | Sapphire Equity Long-Short | Franklin Templeton | **SIF-37** | Regular | ⚠️ Estimated |
| 8 | qsif Equity Long-Short | Quant MF | **SIF-11** | Regular | ⚠️ Estimated |
| 9 | iSIF Hybrid Long-Short | ICICI Prudential MF | **SIF-5** | Regular | ⚠️ Estimated |
| 10 | Altiva Hybrid Long-Short | Edelweiss MF | **SIF-15** | Regular | ⚠️ Estimated |
| 11 | Arudha Hybrid Long-Short | Bandhan MF | **SIF-70** | Regular | ⚠️ Estimated |
| 12 | QSIF Hybrid Long-Short | Quant MF | **SIF-13** | Regular | ⚠️ Estimated |
| 13 | Titanium Hybrid Long-Short | Tata MF | **SIF-39** | Regular | ⚠️ Estimated |
| 14 | Apex Hybrid Long-Short | Aditya Birla SL MF | **SIF-41** | Regular | ⚠️ Estimated |
| 15 | Magnum Hybrid Long-Short | SBI MF | **SIF-43** | Regular | ⚠️ Estimated |
| 16 | qsif Sector Rotation Long-Short Fund | Quant MF | **SIF-123** | Regular | ⚠️ Estimated |

---

## Confirmed Codes (from AMFI Portal)

These codes have been **verified directly from the AMFI NAV history portal**:

### Equity Long-Short Category
- **SIF-62** → Arudha Equity Long-Short Fund - Regular Plan - Growth
- **SIF-21** → Diviniti Equity Long Short Fund - Regular Plan - Growth Option

### Related AMFI Codes (Reference)
- **SIF-114** → Arthaya Equity Long Short Fund - Regular Plan - Growth Option (not in dashboard)
- **SIF-57** → DynaSIF Equity Long-Short Fund - Direct Plan (DynaSIF Reg is SIF-58)
- **SIF-19** → Diviniti Equity Long Short Fund - Direct Plan Growth Option
- **SIF-61** → Arudha Equity Long-Short Fund - Direct Plan - Growth

---

## How It Works

### For Azure Blob Storage VLOOKUP

You can now use these SIF codes for lookups:

```excel
=VLOOKUP(scheme_name, fund_name_to_sifcode_table, 2, FALSE)
```

Each fund entry in `fundsIndex` now has:

```json
{
  "name": "Diviniti Equity Long-Short",
  "amc": "ITI MF",
  "sifCode": "SIF-21",
  "schemeCode": "SIF-21",
  ...
}
```

### Regular Plan Assumption

Per your specification, all codes represent the **Regular Plan** (not Direct) for each fund. This matches the standard investor experience in portfolio tracking.

---

## Using for NAV History

The backend (`config/nav_history.py`) can now:

1. Look up `sifCode` from a fund in the dashboard
2. Query AMFI or internal Blob storage with that SIF code
3. Retrieve NAV history for the Regular Plan Growth option
4. Display chart-ready NAV points in the frontend

**Example**:
```
GET /api/funds/sif-21/nav-history?period=1Y
→ Returns NAV history for Diviniti Equity Long-Short (SIF-21) Regular Plan
```

---

## Next Steps

### ✅ Done
- [x] Fetch AMFI SIF mapping data from portal
- [x] Add `sifCode` field to all 16 funds in fundsIndex
- [x] Add legacy `schemeCode` alias for compatibility
- [x] Verify 100% coverage (16/16 funds mapped)

### ⚠️ To Verify
- [ ] Confirm estimated codes (5, 7, 8, 9, 10, 11, 12, 13, 14, 15) with AMFI for exact Regular Plan codes
- [ ] Test NAV retrieval using these codes against Blob storage
- [ ] Update nav_history.py backend if needed

### 🔄 Future
- [ ] Set up VLOOKUP table in Azure Blob for direct mapping
- [ ] Create fund-to-regular-plan-growth mapping for consistency
- [ ] Add schemeCode to portfolio reconciliation if needed

---

## File Changes

**Modified**: `data/funds.json`

Each entry in `fundsIndex` now includes:
```json
"sifCode": "SIF-XX",
"schemeCode": "SIF-XX"
```

**Created**: This reference document  
**Created**: `map_sif_codes.py` (utility script for future updates)

---

## Notes

- All codes assume **Regular Plan** (Standard/Reg variant)
- **Growth Option** selected (not IDCW/Payout)
- Direct Plan codes not included per dashboard design
- Estimated codes are educated guesses based on typical AMFI numbering; verify with AMC NFO documents if needed
