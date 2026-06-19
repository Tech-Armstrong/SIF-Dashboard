#!/usr/bin/env python3
"""
Verify SIF Code → NAV Integration Readiness

Checks:
1. ✅ All 16 funds have sifCode in funds.json
2. ✅ Backend can load funds with sifCode
3. ⚠️  Azure connection string configured
4. ⚠️  Can query nav_history from Blob
5. ⚠️  SIF codes exist in Blob data
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Colors for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"
BOLD = "\033[1m"


def check_funds_json() -> Tuple[bool, List[str]]:
    """Check that all funds have sifCode."""
    funds_file = Path(__file__).parent / "data" / "funds.json"
    
    if not funds_file.exists():
        return False, [f"{RED}✗ data/funds.json not found{RESET}"]
    
    with funds_file.open() as f:
        data = json.load(f)
    
    funds_index = data.get("fundsIndex", [])
    messages = []
    all_have_codes = True
    
    for i, fund in enumerate(funds_index, 1):
        name = fund.get("name", "Unknown")
        sif_code = fund.get("sifCode")
        scheme_code = fund.get("schemeCode")
        
        if sif_code:
            messages.append(f"{GREEN}✓{RESET} [{i:2d}] {name:40} → {sif_code}")
        else:
            messages.append(f"{RED}✗{RESET} [{i:2d}] {name:40} → MISSING sifCode")
            all_have_codes = False
    
    summary = f"\n{BOLD}SIF Code Coverage:{RESET} {sum(1 for f in funds_index if f.get('sifCode'))}/{len(funds_index)} funds"
    messages.append(summary)
    
    return all_have_codes, messages


def check_backend_config() -> Tuple[bool, List[str]]:
    """Check backend configuration."""
    messages = []
    backend_dir = Path(__file__).parent / "backend"
    
    # Check if backend exists
    if not backend_dir.exists():
        return False, [f"{RED}✗ backend/ directory not found{RESET}"]
    
    messages.append(f"{GREEN}✓{RESET} backend/ directory found")
    
    # Check key files
    required_files = [
        "main.py",
        "config/nav_history.py",
        "config/duckdb_session.py",
        "config/constants.py",
    ]
    
    all_exist = True
    for file in required_files:
        path = backend_dir / file
        if path.exists():
            messages.append(f"{GREEN}✓{RESET} {file}")
        else:
            messages.append(f"{RED}✗{RESET} {file} (missing)")
            all_exist = False
    
    # Check for .env file (may not exist locally)
    env_file = backend_dir / ".env"
    if env_file.exists():
        messages.append(f"{GREEN}✓{RESET} .env file found")
    else:
        messages.append(f"{YELLOW}⚠{RESET}  .env file not found (may not need locally)")
    
    return all_exist, messages


def check_azure_connection() -> Tuple[bool, List[str]]:
    """Check if Azure connection string is configured."""
    import os
    
    messages = []
    conn_str = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    
    if conn_str:
        masked = conn_str[:50] + "..." if len(conn_str) > 50 else conn_str
        messages.append(f"{GREEN}✓{RESET} AZURE_STORAGE_CONNECTION_STRING is set")
        messages.append(f"  Value (masked): {masked}")
        return True, messages
    else:
        messages.append(f"{YELLOW}⚠{RESET}  AZURE_STORAGE_CONNECTION_STRING not set")
        messages.append("   Set it in backend/.env or as environment variable")
        messages.append("   Format: DefaultEndpointProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net")
        return False, messages


def check_duckdb_available() -> Tuple[bool, List[str]]:
    """Check if DuckDB with azure extension can be loaded."""
    messages = []
    
    try:
        import duckdb
        messages.append(f"{GREEN}✓{RESET} DuckDB is installed")
        messages.append(f"  Version: {duckdb.__version__}")
        
        # Try to connect (will fail without Azure conn string, but checks DuckDB works)
        try:
            con = duckdb.connect(":memory:")
            con.execute("SELECT 1")
            con.close()
            messages.append(f"{GREEN}✓{RESET} DuckDB in-memory connection works")
            return True, messages
        except Exception as e:
            messages.append(f"{YELLOW}⚠{RESET}  DuckDB connection test failed: {e}")
            return False, messages
    except ImportError:
        messages.append(f"{RED}✗{RESET} DuckDB not installed")
        messages.append("  Install: pip install duckdb")
        return False, messages


def check_blob_connection() -> Tuple[bool, List[str]]:
    """Try to connect to Azure Blob via DuckDB."""
    messages = []
    import os
    
    conn_str = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    if not conn_str:
        messages.append(f"{YELLOW}⚠{RESET}  Cannot test Blob connection (no Azure conn string)")
        return False, messages
    
    try:
        import duckdb
        
        con = duckdb.connect(":memory:")
        con.execute("INSTALL azure;")
        con.execute("LOAD azure;")
        
        escaped = conn_str.replace("'", "''")
        con.execute(f"CREATE SECRET az (TYPE azure, CONNECTION_STRING '{escaped}');")
        
        messages.append(f"{GREEN}✓{RESET} Azure extension loaded and authenticated")
        
        # Try to list container
        try:
            # This is a light touch - just check if we can reference the Blob path
            test_query = """
                SELECT COUNT(*) as count FROM read_parquet(
                    'az://mfnavdata/processed/scheme_master.parquet'
                ) LIMIT 1
            """
            result = con.execute(test_query).fetchone()
            messages.append(f"{GREEN}✓{RESET} Can read scheme_master from Blob")
            messages.append(f"  Schemes in Blob: {result[0]}")
            con.close()
            return True, messages
        except Exception as e:
            messages.append(f"{YELLOW}⚠{RESET}  Cannot read Blob data: {str(e)[:100]}")
            messages.append("  Verify: container name, parquet path, and connection string")
            con.close()
            return False, messages
    except Exception as e:
        messages.append(f"{RED}✗{RESET} Azure integration failed: {e}")
        return False, messages


def check_nav_data_exists() -> Tuple[bool, List[str]]:
    """Check if NAV data exists in Blob for our SIF codes."""
    messages = []
    import os
    
    conn_str = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    if not conn_str:
        messages.append(f"{YELLOW}⚠{RESET}  Cannot test NAV data (no Azure conn string)")
        return False, messages
    
    try:
        import duckdb
        
        sif_codes = ["SIF-21", "SIF-62", "SIF-1", "SIF-9"]  # Sample codes
        
        con = duckdb.connect(":memory:")
        con.execute("INSTALL azure;")
        con.execute("LOAD azure;")
        escaped = conn_str.replace("'", "''")
        con.execute(f"CREATE SECRET az (TYPE azure, CONNECTION_STRING '{escaped}');")
        
        # Create nav_history view
        con.execute("""
            CREATE OR REPLACE VIEW scheme_master AS
            SELECT scheme_code, fund_house, category, scheme_name
            FROM read_parquet('az://mfnavdata/processed/scheme_master.parquet');
            
            CREATE OR REPLACE VIEW nav_history AS
            SELECT
                h.scheme_code,
                h.nav_date::DATE AS nav_date,
                h.nav::DOUBLE AS nav,
                s.fund_house, s.category, s.scheme_name
            FROM read_parquet('az://mfnavdata/processed/nav_history/year=*/data.parquet', hive_partitioning = true) h
            LEFT JOIN scheme_master s USING (scheme_code);
        """)
        
        messages.append(f"{GREEN}✓{RESET} NAV views created successfully")
        
        # Check each SIF code
        found_count = 0
        for code in sif_codes:
            try:
                result = con.execute(
                    "SELECT COUNT(*) FROM nav_history WHERE scheme_code = ?",
                    [code]
                ).fetchone()
                count = result[0] if result else 0
                if count > 0:
                    messages.append(f"  {GREEN}✓{RESET} {code}: {count} NAV records")
                    found_count += 1
                else:
                    messages.append(f"  {YELLOW}✗{RESET} {code}: no data")
            except Exception as e:
                messages.append(f"  {RED}✗{RESET} {code}: error - {str(e)[:50]}")
        
        con.close()
        
        if found_count > 0:
            messages.append(f"\n{BOLD}NAV Data Check:{RESET} {found_count}/{len(sif_codes)} SIF codes have data")
            return True, messages
        else:
            messages.append(f"\n{YELLOW}⚠{RESET}  None of the test SIF codes found in Blob")
            return False, messages
    except Exception as e:
        messages.append(f"{RED}✗{RESET} Error checking NAV data: {e}")
        return False, messages


def main():
    """Run all checks and report status."""
    print(f"\n{BOLD}{'='*70}")
    print(f"SIF CODE → NAV INTEGRATION READINESS CHECK")
    print(f"{'='*70}{RESET}\n")
    
    checks = [
        ("Funds JSON", check_funds_json),
        ("Backend Config", check_backend_config),
        ("Azure Connection String", check_azure_connection),
        ("DuckDB Availability", check_duckdb_available),
        ("Blob Connection", check_blob_connection),
        ("NAV Data Verification", check_nav_data_exists),
    ]
    
    results = []
    for title, check_func in checks:
        print(f"{BOLD}{title}{RESET}")
        print("-" * 70)
        try:
            success, messages = check_func()
            for msg in messages:
                print(f"  {msg}")
            results.append((title, success))
        except Exception as e:
            print(f"  {RED}✗ Check failed with exception: {e}{RESET}")
            results.append((title, False))
        print()
    
    # Summary
    print(f"{BOLD}{'='*70}")
    print(f"SUMMARY{RESET}")
    print(f"{'='*70}")
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for title, success in results:
        status = f"{GREEN}✓{RESET}" if success else f"{RED}✗{RESET}"
        print(f"{status} {title}")
    
    print(f"\n{BOLD}Result: {passed}/{total} checks passed{RESET}\n")
    
    if passed == total:
        print(f"{GREEN}✅ System is ready for NAV integration!{RESET}\n")
        print("Next steps:")
        print("  1. Start backend: cd backend && python -m uvicorn main:app --reload")
        print("  2. Test endpoint: curl http://localhost:8000/api/funds/sif-21/nav-history?period=1Y")
        print("  3. Start frontend: cd frontend && npm run dev")
        print("  4. Open http://localhost:3000 and view a fund's NAV chart\n")
        return 0
    else:
        print(f"{YELLOW}⚠ Some checks failed. See above for details.{RESET}\n")
        if passed >= total - 2:
            print("This is likely due to missing Azure connection string or local environment setup.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
