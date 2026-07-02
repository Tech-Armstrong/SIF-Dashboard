#!/usr/bin/env python3
"""
Map SIF codes from the blob scheme_master to funds.json fundsIndex.

Ground truth is the Azure Blob scheme_master table (see
backend/config/duckdb_session.py). Each UI fund is mapped to its Regular
Plan - Growth Option scheme code. Two funds (iSIF Equity Ex-Top 100 and
Sapphire) have no Regular-Growth variant in the blob, so they map to the
Direct - Growth code instead (noted inline). Every code below was verified
to have NAV history present.
"""

import json
from pathlib import Path

# Codes verified against blob scheme_master + nav_history (Regular Plan - Growth
# unless noted). Keys match the UI fund names in data/funds.json fundsIndex.
SIF_CODE_MAPPING = {
    "iSIF Equity Ex-Top 100 Long-Short": "SIF-33",   # Direct Growth (no Regular variant in blob)
    "qsif Equity Ex-Top 100 Long-Short": "SIF-25",
    "Arudha Equity Long-Short": "SIF-62",
    "Diviniti Equity Long-Short": "SIF-21",
    "DynaSIF Equity Long-Short": "SIF-55",
    "Titanium Equity Long-Short": "SIF-102",
    "Sapphire Equity Long-Short": "SIF-95",          # Direct Growth (no Regular variant in blob)
    "qsif Equity Long-Short": "SIF-3",
    "iSIF Hybrid Long-Short": "SIF-35",
    "Altiva Hybrid Long-Short": "SIF-11",
    "Arudha Hybrid Long-Short": "SIF-40",
    "QSIF Hybrid Long-Short": "SIF-7",
    "Titanium Hybrid Long-Short": "SIF-29",
    "Apex Hybrid Long-Short": "SIF-80",
    "Magnum Hybrid Long-Short": "SIF-13",
    "qsif Sector Rotation Long-Short Fund": "SIF-117",
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
    
    added = 0
    corrected = 0
    unchanged = 0
    not_found = 0

    for i, fund in enumerate(funds_index, 1):
        name = fund.get("name", "").strip()
        amc = fund.get("amc", "").strip()

        sif_code = find_sif_code(name)

        if sif_code:
            current = fund.get("sifCode")
            if current == sif_code:
                print(f"  [{i:2d}] ~ {name:40} → {sif_code:8} (unchanged)")
                unchanged += 1
            elif current is None:
                fund["sifCode"] = sif_code
                fund["schemeCode"] = sif_code  # Legacy alias
                added += 1
                print(f"  [{i:2d}] ✓ {name:40} → {sif_code:8} (added)")
            else:
                # Existing code drifted from ground truth — correct it.
                fund["sifCode"] = sif_code
                if "schemeCode" in fund:
                    fund["schemeCode"] = sif_code  # keep legacy alias in sync
                corrected += 1
                print(f"  [{i:2d}] ! {name:40} → {current:8} ⇒ {sif_code:8} (corrected)")
        else:
            not_found += 1
            print(f"  [{i:2d}] ✗ {name:40} → NOT FOUND")

    print()
    print("=" * 70)
    print(f"RESULTS:")
    print(f"  Added:        {added}")
    print(f"  Corrected:    {corrected}")
    print(f"  Unchanged:    {unchanged}")
    print(f"  Not found:    {not_found}")
    print(f"  Total:        {len(funds_index)}")
    print("=" * 70)
    
    # Write back
    with funds_file.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print("\n✓ Updated data/funds.json successfully")

if __name__ == "__main__":
    main()
