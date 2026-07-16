"""OpenFoodFacts lookup for Eat_Track.

Searches the Romanian OpenFoodFacts database for a food name and returns its
nutritional values per 100 g. No API key required. Standard library only
(urllib). Results are cached in memory for the process lifetime.

Enabled by default; disable with EATTRACK_ONLINE_LOOKUP=0.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# Romanian OpenFoodFacts variant (prefers products sold in Romania).
SEARCH_URL = "https://ro.openfoodfacts.org/cgi/search.pl"
# A descriptive User-Agent is required by the OpenFoodFacts API.
_UA = "EatTrack/1.0 (personal nutrition tracker)"
_TIMEOUT = 12
_RETRIES = 2
_CACHE = {}


def is_enabled():
    return os.environ.get("EATTRACK_ONLINE_LOOKUP", "1") not in ("0", "false", "False")


def lookup(name):
    """Return per-100g macros for `name`, or None if not found / offline.

    Result shape: { name, calories, protein, carbs, fat, fiber, source }
    """
    if not name or not is_enabled():
        return None

    key = name.strip().lower()
    if key in _CACHE:
        return _CACHE[key]

    result = _query(name)
    _CACHE[key] = result  # cache misses too, to avoid repeated slow calls
    return result


def _query(name):
    params = {
        "search_terms": name,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 10,
        "lc": "ro",              # interface / search language: Romanian
        "cc": "ro",              # country: prefer products sold in Romania
        "sort_by": "unique_scans_n",  # most popular first (better matches)
        "fields": "product_name,product_name_ro,nutriments,nutrition_grades",
    }
    url = SEARCH_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})

    data = None
    for attempt in range(_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            break
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            if attempt + 1 >= _RETRIES:
                return None
            time.sleep(0.6)  # brief backoff for transient rate limits
    if data is None:
        return None

    terms = [t for t in name.lower().split() if len(t) > 2]
    best = None
    best_score = -1
    for product in data.get("products", []):
        macros = _extract(product)
        if not macros:
            continue
        pname = (product.get("product_name_ro") or product.get("product_name") or "").lower()
        # Prefer products whose name actually contains the searched words.
        score = sum(1 for t in terms if t in pname)
        if score > best_score:
            best = (product, macros, pname)
            best_score = score
        if score == len(terms) and terms:
            break  # perfect name match, stop early

    if best is None:
        return None
    product, macros, pname = best
    display = product.get("product_name_ro") or product.get("product_name") or name
    macros["name"] = display.strip()[:60]
    macros["source"] = "openfoodfacts"
    return macros


def _num(nutriments, *keys):
    for k in keys:
        val = nutriments.get(k)
        if val is None or val == "":
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return None


def _extract(product):
    n = product.get("nutriments") or {}
    cal = _num(n, "energy-kcal_100g", "energy-kcal")
    if cal is None:
        # some products only report kJ; convert
        kj = _num(n, "energy_100g", "energy")
        cal = round(kj / 4.184, 1) if kj is not None else None
    if cal is None:
        return None
    return {
        "calories": round(cal, 1),
        "protein": round(_num(n, "proteins_100g", "proteins") or 0, 1),
        "carbs": round(_num(n, "carbohydrates_100g", "carbohydrates") or 0, 1),
        "fat": round(_num(n, "fat_100g", "fat") or 0, 1),
        "fiber": round(_num(n, "fiber_100g", "fiber") or 0, 1),
    }
