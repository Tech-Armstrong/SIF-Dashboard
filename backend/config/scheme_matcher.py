"""Match uploaded portfolio scheme names -> standardised schemeCode.

Why this exists
---------------
Uploaded portfolio files identify a fund only by an abbreviated name + AMC
(e.g. "ABSL Large & Mid Cap Fund Reg Gr"). The Blob NAV history is keyed on
schemeCode. The standardised directory (scheme_directory.csv) is the bridge:
3,152 funds, each with schemeCode + full schemeName.

Exact string matching fails (~24%) because the portfolio and the directory often
use *different words* for the same fund ("Axis Bluechip" == "Axis Large Cap").
So we:
  1. NORMALIZE both names (strip plan/option noise, expand AMC + abbreviations).
  2. BLOCK by AMC  -- only compare against directory funds of the same AMC. This
     kills the worst error class (matching across AMCs).
  3. FUZZY score by token overlap (Jaccard) and take the best in the block.
  4. Accept when score >= ACCEPT_THRESHOLD (0.70); otherwise flag for review.

A small manual ALIAS table handles the handful of genuinely-different marketing
names that fuzzy cannot reach.

Public API
----------
    load_directory()                       -> list[DirEntry]
    match_name(amc, scheme)                 -> MatchResult
    match_frame(df)                         -> df + [scheme_code, match_score,
                                                     match_status, matched_name, has_nav]
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from functools import lru_cache

from config.constants import ROOT_DIR
from config.logging_utils import get_logger

log = get_logger("scheme_matcher")

DIRECTORY_CSV = ROOT_DIR / "data" / "scheme_directory.csv"
ALIAS_CSV = ROOT_DIR / "data" / "scheme_aliases.csv"  # optional manual overrides

ACCEPT_THRESHOLD = 0.70   # >= this token-overlap auto-accepts (the measured 77%)
REVIEW_FLOOR = 0.45       # below this we don't even suggest a guess

# ── AMC prefix expansions (portfolio short form -> canonical, lowercased) ──
AMC_EXPAND = {
    "absl": "aditya birla sun life",
    "icici pru": "icici prudential",
    "icici prudential": "icici prudential",
    "bnp": "bnp paribas",
    "pgim": "pgim india",
}

# ── in-name abbreviation expansions (whole word) ──
WORD_EXPAND = {
    "advtg": "advantage", "advantg": "advantage", "adv": "advantage",
    "fin": "financial", "corp": "corporate", "mkt": "market",
    "mmf": "money market", "infra": "infrastructure", "intl": "international",
    "aggr": "aggressive", "hyb": "hybrid", "mly": "monthly", "qly": "quarterly",
    "opp": "opportunities", "pru": "prudential", "retrmnt": "retirement",
    "svc": "services", "mgr": "manager", "cons": "conservative",
}

# ── descriptor noise removed from the token set ──
NOISE = {
    "regular", "reg", "plan", "growth", "gr", "option", "cum", "idcw",
    "payout", "reinvestment", "fund", "scheme", "the", "of", "and", "to",
    "direct", "a", "an",
}

# Spelling unification for compound fund-type terms. The portfolio and the
# directory often differ only by a space ("Largecap" vs "Large Cap",
# "Midcap" vs "Mid Cap", "Bluechip" vs "Blue Chip"); collapse both forms to a
# single token so they score as identical. Applied symmetrically to every name.
_CAP_RE = re.compile(r"\b(large|mid|small|multi|flexi)\s*cap\b")
_BLUECHIP_RE = re.compile(r"\bblue\s*chip\b")

# ── Fund-type signatures (mutually exclusive families). Used as a GUARD: a high
# token-overlap match between two DIFFERENT families (e.g. "Large & Mid Cap" vs
# "Mid Cap") is almost always the wrong fund, so we refuse to auto-accept it.
_TYPE_PATTERNS: dict[str, str] = {
    "largemid": r"large\s*(?:and|&)?\s*mid",   # check before 'large'/'mid'
    "large":    r"large\s*cap|bluechip|frontline",
    "mid":      r"mid\s*cap|midcap",
    "small":    r"small\s*cap",
    "multi":    r"multi\s*cap",
    "flexi":    r"flexi\s*cap",
    "focused":  r"focus",
    "value":    r"\bvalue\b|contra",
    "elss":     r"elss|tax\s*saver",
    "liquid":   r"\bliquid\b",
}


def _fund_types(name: str) -> set[str]:
    """The mutually-exclusive fund-type tags present in a name."""
    n = str(name).lower()
    found = {k for k, pat in _TYPE_PATTERNS.items() if re.search(pat, n)}
    if "largemid" in found:          # "large & mid cap" is its own family
        found -= {"large", "mid"}
    return found


def _type_conflict(a: str, b: str) -> bool:
    """True if both names declare a fund-type but share NONE -> wrong fund."""
    ta, tb = _fund_types(a), _fund_types(b)
    return bool(ta) and bool(tb) and not (ta & tb)


def _normalize(name: str) -> str:
    """Lowercase, de-noise, expand abbreviations -> a clean token string."""
    s = str(name).strip().lower()
    # split no-space joins: "FundGr", "FundGrReg", "Gr Gr"
    s = re.sub(r"(fund)(gr|reg|plan|idcw|cum)", r"\1 \2", s)
    s = re.sub(r"(gr)(reg|plan|gr)", r"\1 \2", s)
    s = s.replace("&", " and ")
    s = _CAP_RE.sub(lambda m: m.group(1) + "cap", s)
    s = _BLUECHIP_RE.sub("bluechip", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)          # drop punctuation (apostrophes etc.)
    s = re.sub(r"\s+", " ", s).strip()

    # AMC prefix expansion (longest prefix first)
    for short in sorted(AMC_EXPAND, key=len, reverse=True):
        if s == short or s.startswith(short + " "):
            s = AMC_EXPAND[short] + s[len(short):]
            break
    return s


def _tokens(name: str) -> frozenset[str]:
    out: list[str] = []
    for t in _normalize(name).split():
        out.extend(WORD_EXPAND.get(t, t).split())
    return frozenset(t for t in out if t not in NOISE)


def _amc_key(amc: str) -> frozenset[str]:
    """Normalized AMC token set used for blocking. 'Aditya Birla Sun Life
    Mutual Fund' -> {aditya, birla, sun, life}; 'Mutual Fund' words dropped."""
    s = _normalize(amc)
    drop = {"mutual", "asset", "management", "amc", "investments", "trustee", "co"}
    return frozenset(t for t in s.split() if t not in NOISE and t not in drop)


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


@dataclass(frozen=True)
class DirEntry:
    scheme_code: str
    scheme_name: str
    category: str
    has_nav: bool
    name_tokens: frozenset[str]
    amc_tokens: frozenset[str]


@dataclass
class MatchResult:
    scheme_code: str | None
    matched_name: str | None
    score: float
    status: str            # "accepted" | "review" | "unmatched" | "alias"
    has_nav: bool = False
    candidates: list[tuple[str, str, float]] = field(default_factory=list)


@lru_cache(maxsize=1)
def load_directory() -> tuple[DirEntry, ...]:
    if not DIRECTORY_CSV.exists():
        raise RuntimeError(
            f"{DIRECTORY_CSV} not found. Run `python -m config.build_directory`."
        )
    entries: list[DirEntry] = []
    with DIRECTORY_CSV.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = row["scheme_name"]
            # The directory name carries its own AMC words; reuse name tokens
            # for the AMC block (first ~3 tokens dominate the AMC identity).
            ntok = _tokens(name)
            entries.append(DirEntry(
                scheme_code=row["scheme_code"],
                scheme_name=name,
                category=row.get("category", ""),
                has_nav=row.get("has_nav", "0") in ("1", "1.0", "True", "true"),
                name_tokens=ntok,
                amc_tokens=_amc_key(name),
            ))
    log.info("Loaded %d directory entries", len(entries))
    return tuple(entries)


@lru_cache(maxsize=1)
def _load_aliases() -> dict[str, str]:
    """Manual overrides: normalized portfolio name -> scheme_code.
    Optional file; missing is fine."""
    aliases: dict[str, str] = {}
    if ALIAS_CSV.exists():
        with ALIAS_CSV.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                key = _normalize(row["portfolio_name"])
                aliases[key] = str(row["scheme_code"]).strip()
    return aliases


def match_name(amc: str, scheme: str) -> MatchResult:
    """Match one (amc, scheme) to a directory schemeCode."""
    directory = load_directory()
    by_code = {e.scheme_code: e for e in directory}

    # 0. manual alias short-circuit
    aliases = _load_aliases()
    akey = _normalize(scheme)
    if akey in aliases:
        code = aliases[akey]
        e = by_code.get(code)
        return MatchResult(code, e.scheme_name if e else None, 1.0, "alias",
                           has_nav=bool(e and e.has_nav))

    p_name = _tokens(scheme)
    p_amc = _amc_key(amc) if amc else frozenset()

    # 1. AMC blocking: keep directory entries sharing >=1 AMC token. If the
    #    portfolio AMC is blank/unknown, fall back to the whole directory.
    if p_amc:
        block = [e for e in directory if e.amc_tokens & p_amc]
        if not block:
            block = list(directory)
    else:
        block = list(directory)

    # 2. fuzzy score within the block
    scored = sorted(
        ((_jaccard(p_name, e.name_tokens), e) for e in block),
        key=lambda x: x[0], reverse=True,
    )
    if not scored:
        return MatchResult(None, None, 0.0, "unmatched")

    best_score, best = scored[0]
    candidates = [(e.scheme_code, e.scheme_name, round(s, 3))
                  for s, e in scored[:3] if s >= REVIEW_FLOOR]

    if best_score >= ACCEPT_THRESHOLD:
        # Guard: a high overlap between two different fund-type families
        # (e.g. "Large & Mid Cap" vs "Mid Cap") is the wrong fund -> review.
        status = "review" if _type_conflict(scheme, best.scheme_name) else "accepted"
    elif best_score >= REVIEW_FLOOR:
        status = "review"
    else:
        return MatchResult(None, None, round(best_score, 3), "unmatched",
                           candidates=candidates)

    return MatchResult(
        scheme_code=best.scheme_code if status == "accepted" else None,
        matched_name=best.scheme_name,
        score=round(best_score, 3),
        status=status,
        has_nav=best.has_nav if status == "accepted" else False,
        candidates=candidates,
    )


def match_frame(df):
    """Add match columns to a parsed portfolio DataFrame (needs 'scheme';
    'amc' used for blocking when present). Returns a new DataFrame."""
    import pandas as pd

    amc_col = df["amc"] if "amc" in df.columns else pd.Series([""] * len(df))
    results = [match_name(str(a or ""), str(s or ""))
               for a, s in zip(amc_col, df["scheme"])]
    out = df.copy()
    out["scheme_code"] = [r.scheme_code for r in results]
    out["match_score"] = [r.score for r in results]
    out["match_status"] = [r.status for r in results]
    out["matched_name"] = [r.matched_name for r in results]
    out["has_nav"] = [r.has_nav for r in results]
    return out
