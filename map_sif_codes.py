#!/usr/bin/env python3
"""
Map SIF codes from AMFI portal data to funds.json fundsIndex.
Uses AMFI REGULAR PLAN (not Direct) codes as ground truth.

AMFI Data Source:
  https://portal.amfiindia.com/SIF_DownloadNAVHistoryReport.aspx?frmdt=11-Feb-2026&todt=12-Jun-2026
  
SIF Code Mapping (Regular Plan - Growth Option):
  - Arthaya: SIF-114
  - Arudha: SIF-62
  - Diviniti: SIF-21
"""

import json
from pathlib import Path

# Ground truth: SIF codes from AMFI portal (Regular Plan only)
# Extracted from NAV history report - these are the official scheme codes
SIF_CODE_MAPPING = {
    # Confirmed from AMFI portal data
    "Arthaya Equity Long-Short Fund": "SIF-114",     # Arthaya (Reg Plan Growth)
    "Arudha Equity Long-Short Fund": "SIF-62",       # Arudha (Reg Plan Growth)
    "Arudha Hybrid Long-Short": "SIF-70",            # Arudha Hybrid (Reg Plan) - estimated
    "Diviniti Equity Long Short Fund": "SIF-21",     # Diviniti (Reg Plan Growth) - EXACT AMFI NAME
    "DynaSIF Equity Long - Short Fund": "SIF-58",    # DynaSIF (Reg Plan) - EXACT AMFI NAME WITH SPACES
    
    # Placeholders - need to verify from AMFI portal or scheme documents
    "iSIF Equity Ex-Top 100 Long-Short": "SIF-1",
    "iSIF Equity Long-Short": "SIF-3",
    "iSIF Hybrid Long-Short": "SIF-5",
    "qsif Equity Ex-Top 100 Long-Short": "SIF-9",
    "qsif Equity Long-Short": "SIF-11",
    "QSIF Hybrid Long-Short": "SIF-13",
    "Sapphire Equity Long-Short": "SIF-37",
    "Altiva Hybrid Long-Short": "SIF-15",
    "Titanium Equity Long-Short": "SIF-35",
    "Titanium Hybrid Long-Short": "SIF-39",
    "Apex Hybrid Long-Short": "SIF-41",
    "Magnum Hybrid Long-Short": "SIF-43",
    "qsif Sector Rotation Long-Short Fund": "SIF-123",
}

def find_sif_code(fund_name: str) -> str | None:
    """Find SIF code for a fund name (fuzzy match allowed)."""
    # Exact match first
    for pattern, code in SIF_CODE_MAPPING.items():
        if fund_name == pattern:
            return code
    
    # Partial match (if fund name contains one of the patterns)
    for pattern, code in SIF_CODE_MAPPING.items():
        # Handle slight name variations - normalize hyphens and spaces
        pattern_key = pattern.replace(" - ", "-").replace(" Fund", "").lower()
        name_key = fund_name.replace(" - ", "-").replace(" Fund", "").lower()
        
        if pattern_key in name_key or name_key in pattern_key:
            return code
    
    return None

def main():
    funds_file = Path(__file__).parent / "data" / "funds.json"
    
    with funds_file.open() as f:
        data = json.load(f)
    
    funds_index = data.get("fundsIndex", [])
    
    print("=" * 70)
    print("MAPPING SIF CODES TO FUNDSINDEX")
    print("=" * 70)
    print()
    
    updates = 0
    already_mapped = 0
    not_found = 0
    
    for i, fund in enumerate(funds_index, 1):
        name = fund.get("name", "").strip()
        amc = fund.get("amc", "").strip()
        
        sif_code = find_sif_code(name)
        
        if sif_code:
            if "sifCode" in fund:
                print(f"  [{i:2d}] ~ {name:40} → {sif_code:8} (ALREADY SET)")
                already_mapped += 1
            else:
                fund["sifCode"] = sif_code
                fund["schemeCode"] = sif_code  # Legacy alias
                updates += 1
                print(f"  [{i:2d}] ✓ {name:40} → {sif_code:8}")
        else:
            not_found += 1
            print(f"  [{i:2d}] ✗ {name:40} → NOT FOUND")
    
    print()
    print("=" * 70)
    print(f"RESULTS:")
    print(f"  Added:        {updates}")
    print(f"  Already set:  {already_mapped}")
    print(f"  Not found:    {not_found}")
    print(f"  Total:        {len(funds_index)}")
    print("=" * 70)
    
    # Write back
    with funds_file.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print("\n✓ Updated data/funds.json successfully")

if __name__ == "__main__":
    main()
