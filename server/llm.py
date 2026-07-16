"""Optional LLM backend for meal parsing (disabled by default).

If an API key is configured, `llm_parse` asks an OpenAI-compatible chat
endpoint to break a Romanian sentence into foods with their quantity in grams
AND their nutritional values per 100 g (drawing on the model's knowledge of
international food databases). This lets it recognize foods that are not in the
local FOODS table. If a value is missing, it falls back to the local table and
then to the online lookup. On any failure the caller uses the local parser.

Configure via .env (or environment variables):
    EATTRACK_LLM_API_KEY=sk-...
    EATTRACK_LLM_URL=https://api.openai.com/v1/chat/completions   (optional)
    EATTRACK_LLM_MODEL=gpt-4o-mini                                (optional)

Standard library only (urllib) — no pip installs.
"""

import json
import os
import urllib.error
import urllib.request

import nutrition_api
from food_db import macros_for, scale_per100
from meal_parser import _match_food, _sum_macros

DEFAULT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"

_PROMPT = (
    "You are a nutrition assistant. From the user's Romanian sentence, extract "
    "every food with its quantity converted to grams (convert pieces, slices, "
    "spoons, cups to approximate grams). For each food also provide typical "
    "nutritional values PER 100 GRAMS using international food databases. "
    "Respond ONLY with JSON of this exact shape: "
    '{"items":[{"food":"<name>","grams":<number>,"per_100g":'
    '{"calories":<kcal>,"protein":<g>,"carbs":<g>,"fat":<g>,"fiber":<g>}}]}'
)


def is_enabled():
    # Enabled if a cloud API key is set, OR a custom endpoint is configured
    # (e.g. a local Ollama server, which needs no key).
    return bool(os.environ.get("EATTRACK_LLM_API_KEY") or os.environ.get("EATTRACK_LLM_URL"))


def _valid_per100(p):
    if not isinstance(p, dict):
        return None
    try:
        cal = float(p.get("calories"))
    except (TypeError, ValueError):
        return None
    if cal <= 0:
        return None
    out = {"calories": round(cal, 1)}
    for k in ("protein", "carbs", "fat", "fiber"):
        try:
            out[k] = round(float(p.get(k, 0) or 0), 1)
        except (TypeError, ValueError):
            out[k] = 0.0
    return out


def _resolve_item(name, grams):
    """Build an item dict for a food, trying the local table then online."""
    matched = _match_food(name)
    if matched:
        return {"food": matched, "grams": grams, **macros_for(matched, grams)}
    ext = nutrition_api.lookup(name)
    if ext:
        return {
            "food": ext.get("name") or name,
            "grams": grams,
            "source": ext.get("source", "online"),
            **scale_per100(ext, grams),
        }
    return None


def llm_parse(text):
    """Return the same shape as meal_parser.parse_meal, or None on failure."""
    key = os.environ.get("EATTRACK_LLM_API_KEY")
    url = os.environ.get("EATTRACK_LLM_URL", DEFAULT_URL)
    # The default OpenAI endpoint requires a key; a custom URL (Ollama, etc.)
    # may be keyless.
    if not key and url == DEFAULT_URL:
        return None

    model = os.environ.get("EATTRACK_LLM_MODEL", DEFAULT_MODEL)

    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": _PROMPT},
            {"role": "user", "content": text},
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        raw = json.loads(content)
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError):
        return None

    items = []
    unmatched = []
    for entry in raw.get("items", []):
        name = str(entry.get("food", "")).strip()
        try:
            grams = round(float(entry.get("grams", 0)), 1)
        except (TypeError, ValueError):
            grams = 0
        if not name or grams <= 0:
            if name:
                unmatched.append(name)
            continue

        per100 = _valid_per100(entry.get("per_100g"))
        if per100:
            items.append({
                "food": name,
                "grams": grams,
                "source": "llm",
                **scale_per100(per100, grams),
            })
            continue

        resolved = _resolve_item(name, grams)
        if resolved:
            items.append(resolved)
        else:
            unmatched.append(name)

    if not items:
        return None
    return {"items": items, "unmatched": unmatched, "totals": _sum_macros(items)}
