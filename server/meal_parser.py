"""Natural-language meal parser for Eat_Track.

Turns free text like:
    "azi am mancat 200g salam, 100g cascaval, 250g paine si 2 oua"
into structured items with matched foods and computed macros.

Strategy (local, offline):
  1. Strip filler words ("azi am mancat", "am baut", ...).
  2. Split the sentence into chunks on commas / "si" / "+".
  3. For each chunk extract quantity + unit, then match the remaining
     text against the FOODS table (diacritics-insensitive, fuzzy).

An optional LLM backend can be plugged in later (see llm.py); this module
is the default and always-available path.
"""

import difflib
import re
import unicodedata

from food_db import FOODS, PIECE_GRAMS, macros_for, scale_per100

# Words we drop before parsing so they don't pollute food matching.
_FILLER = [
    "azi am mancat", "azi am baut", "am mancat", "am baut", "azi", "ieri",
    "la pranz", "la cina", "la micul dejun", "dimineata", "seara",
    "aproximativ", "cam", "vreo", "niste", "un pic de", "o portie de",
    "cu", "si inca",
]

# unit -> grams multiplier (per 1 unit)
_UNITS_G = {
    "kg": 1000, "kilograme": 1000, "kilogram": 1000,
    "g": 1, "gr": 1, "grame": 1, "gram": 1,
    "mg": 0.001,
    "l": 1000, "litru": 1000, "litri": 1000,
    "ml": 1,
    "lingura": 15, "linguri": 15, "lg": 15,
    "lingurita": 5, "lingurite": 5,
    "cana": 240, "cani": 240, "pahar": 200, "pahare": 200,
}
# units counted as pieces (need PIECE_GRAMS)
_UNITS_PIECE = {"buc", "bucata", "bucati", "bucăți", "felie", "felii", "portie", "portii"}

_NUM_WORDS = {
    "o": 1, "un": 1, "doua": 2, "doi": 2, "trei": 3, "patru": 4,
    "cinci": 5, "sase": 6, "sapte": 7, "opt": 8, "noua": 9, "zece": 10,
}


def _strip_diacritics(text):
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _norm(text):
    text = _strip_diacritics(text.lower())
    text = text.replace(",", ".") if re.match(r"^\d+,\d+$", text.strip()) else text
    return re.sub(r"\s+", " ", text).strip()


# Pre-normalized index of food names, longest first for greedy matching.
_FOOD_KEYS = sorted((_norm(k) for k in FOODS), key=len, reverse=True)
_NORM_TO_ORIG = {}
for _orig in FOODS:
    _NORM_TO_ORIG.setdefault(_norm(_orig), _orig)


def _split_chunks(text):
    """Split on commas / "si" / "+" / "&", but NOT inside parentheses.

    This keeps grouped foods like "salata(castraveti, rosii, ceapa)" together
    as a single chunk so it can be expanded later.
    """
    parts = []
    buf = ""
    depth = 0
    for tok in re.split(r"(\(|\)|,|\+|&|\bsi\b)", text):
        if tok == "(":
            depth += 1
            buf += tok
        elif tok == ")":
            depth = max(0, depth - 1)
            buf += tok
        elif depth == 0 and (tok in (",", "+", "&") or tok == "si"):
            if buf.strip():
                parts.append(buf.strip())
            buf = ""
        else:
            buf += tok
    if buf.strip():
        parts.append(buf.strip())
    return parts


def _extract_quantity(chunk):
    """Return (kind, value, leftover_text).

    kind is one of: "grams" (value already in grams), "pieces" (explicit
    piece/slice unit), "count" (bare number, unit ambiguous) or None.
    """
    tokens = chunk.split()
    if not tokens:
        return None, None, chunk

    qty = None
    unit = None
    idx = 0

    # numeric like "200g", "250 g", "1.5 kg", "2buc"
    m = re.match(r"^(\d+(?:[.,]\d+)?)\s*([a-zaâîășț]+)?$", tokens[0])
    if m:
        qty = float(m.group(1).replace(",", "."))
        if m.group(2):
            unit = m.group(2)
        idx = 1
    elif tokens[0] in _NUM_WORDS:
        qty = _NUM_WORDS[tokens[0]]
        idx = 1

    if qty is None:
        return None, None, chunk

    # unit may be a separate token: "2 felii", "200 g"
    if unit is None and idx < len(tokens):
        cand = tokens[idx]
        if cand in _UNITS_G or cand in _UNITS_PIECE:
            unit = cand
            idx += 1

    leftover = " ".join(tokens[idx:]).strip()

    if unit in _UNITS_PIECE:
        return "pieces", qty, leftover
    if unit in _UNITS_G:
        return "grams", qty * _UNITS_G[unit], leftover
    # bare number with no unit -> ambiguous (grams for "150 orez", pieces for "2 oua")
    return "count", qty, leftover


def _match_food(text):
    """Best-effort match of `text` to a FOODS key. Returns original key or None."""
    t = _norm(text)
    if not t:
        return None
    if t in _NORM_TO_ORIG:
        return _NORM_TO_ORIG[t]

    # greedy: longest food name that appears as a phrase in the text
    best = None
    for key in _FOOD_KEYS:
        if re.search(r"\b" + re.escape(key) + r"\b", t):
            best = key
            break
    if best:
        return _NORM_TO_ORIG[best]

    # fuzzy fallback on individual food words
    words = t.split()
    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            phrase = " ".join(words[i:i + n])
            hit = difflib.get_close_matches(phrase, _FOOD_KEYS, n=1, cutoff=0.82)
            if hit:
                return _NORM_TO_ORIG[hit[0]]
    return None


def _build_item(name_text, grams, resolver=None):
    """Match `name_text` locally or via `resolver`, using a fixed gram amount.

    Returns an item dict or None when the food cannot be identified.
    """
    food = _match_food(name_text)
    if food:
        return {"food": food, "grams": grams, **macros_for(food, grams)}
    external = resolver(name_text) if (resolver and name_text) else None
    if external:
        return {
            "food": external.get("name") or name_text,
            "grams": grams,
            "source": external.get("source", "online"),
            **scale_per100(external, grams),
        }
    return None


# Small words that are part of food names / grammar, not brands.
_CONNECTORS = {"de", "cu", "la", "si", "in", "a", "al", "ale", "cu"}


def _extra_words(name_text, food):
    """Words in `name_text` that are not part of the matched `food` name.

    Used to detect a brand / specific variant (e.g. "danone" in
    "iaurt grecesc danone"), which means we should look the exact product up
    online instead of using the generic local value.
    """
    name_tokens = _norm(name_text).split()
    food_tokens = set(_norm(food).split())
    return [
        w for w in name_tokens
        if w not in food_tokens and w not in _CONNECTORS and len(w) > 1
    ]


def _online_grams(kind, qty, name_text):
    """Grams for an online (branded) product. A bare count/piece with no known
    weight is treated as one serving (100 g) instead of 1 gram."""
    piece_g = PIECE_GRAMS.get(_norm(name_text))
    if kind == "grams":
        return round(qty, 1)
    if kind in ("pieces", "count"):
        return round(qty * (piece_g or 100), 1)
    return 100.0


def parse_meal(text, resolver=None):
    """Parse free text into a list of items.

    `resolver` is an optional callable(name) -> per-100g macro dict (with a
    "name" key) used to look up foods that are not in the local FOODS table,
    e.g. an online database like OpenFoodFacts. It is only called for foods
    the local matcher fails to recognize.

    Returns dict: { items: [...], unmatched: [...], totals: {...} }
    Each item: { food, grams, calories, protein, carbs, fat, fiber, source? }
    """
    cleaned = _norm(text)
    for filler in _FILLER:
        cleaned = re.sub(r"\b" + re.escape(filler) + r"\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    items = []
    unmatched = []

    for chunk in _split_chunks(cleaned):
        # Grouped form: "300g salata(castraveti, rosii, ceapa)" splits the
        # total quantity equally among the foods inside the parentheses.
        group = re.search(r"\(([^)]*)\)", chunk)
        if group:
            head = chunk[:group.start()].strip()
            parts = [p.strip() for p in re.split(r",|\bsi\b|\+|&", group.group(1)) if p.strip()]
            if parts:
                kind, qty, _ = _extract_quantity(head)
                total = _resolve_grams(kind, qty, None)
                per = round(total / len(parts), 1)
                for part in parts:
                    item = _build_item(part, per, resolver)
                    if item:
                        items.append(item)
                    else:
                        unmatched.append(part)
                continue

        kind, qty, leftover = _extract_quantity(chunk)
        name_text = leftover if kind is not None else chunk
        food = _match_food(name_text)

        if food:
            # Variant A: if the text carries an extra word (brand / specific
            # variant) beyond the generic food, look the exact product up
            # online. On any doubt (nothing found), fall back to the local
            # table value.
            extra = _extra_words(name_text, food)
            if extra and resolver:
                external = resolver(name_text)
                if external:
                    grams = _online_grams(kind, qty, name_text)
                    items.append({
                        "food": external.get("name") or name_text,
                        "grams": grams,
                        "source": external.get("source", "online"),
                        **scale_per100(external, grams),
                    })
                    continue
            piece_g = PIECE_GRAMS.get(_norm(food))
            grams = _resolve_grams(kind, qty, piece_g)
            items.append({"food": food, "grams": grams, **macros_for(food, grams)})
            continue

        # Not in the local table: try the online/LLM resolver.
        external = resolver(name_text) if (resolver and name_text) else None
        if external:
            grams = _online_grams(kind, qty, name_text)
            display = external.get("name") or name_text
            items.append({
                "food": display,
                "grams": grams,
                "source": external.get("source", "online"),
                **scale_per100(external, grams),
            })
            continue

        unmatched.append(chunk)

    totals = _sum_macros(items)
    return {"items": items, "unmatched": unmatched, "totals": totals}


def _resolve_grams(kind, qty, piece_g):
    """Convert an extracted quantity into grams."""
    if kind == "pieces":
        return round(qty * (piece_g or 100), 1)
    if kind == "count":
        # bare number: pieces for countable foods, else grams
        return round(qty * piece_g if piece_g else qty, 1)
    if kind == "grams":
        return round(qty, 1)
    # no quantity given: 1 piece for countable foods, else 100 g
    if piece_g:
        return round(piece_g, 1)
    return 100.0


def _sum_macros(items):
    keys = ("calories", "protein", "carbs", "fat", "fiber")
    totals = {k: 0.0 for k in keys}
    for it in items:
        for k in keys:
            totals[k] += it.get(k, 0.0)
    return {k: round(v, 1) for k, v in totals.items()}
