"""JSON-file persistence for Eat_Track.

Everything lives in a single JSON file under ../data/eattrack.json:

    {
      "goals": { "calories": .., "protein": .., "carbs": .., "fat": .., "fiber": .. },
      "days": {
        "2026-07-16": {
          "weight": 78.5,
          "meals": [
            { "id": "..", "time": "13:20", "text": "...",
              "items": [...], "totals": {...} }
          ]
        }
      }
    }

Standard library only — no external deps, mirroring the LOL_stats backend.
"""

import json
import os
import threading
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(HERE, "..", "data"))
DATA_FILE = os.path.join(DATA_DIR, "eattrack.json")

_LOCK = threading.Lock()

DEFAULT_GOALS = {
    "calories": 2000,
    "protein": 120,
    "carbs": 220,
    "fat": 60,
    "fiber": 30,
}

_MACRO_KEYS = ("calories", "protein", "carbs", "fat", "fiber")


def _empty_store():
    return {"goals": dict(DEFAULT_GOALS), "days": {}}


def _load():
    if not os.path.isfile(DATA_FILE):
        return _empty_store()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return _empty_store()
    data.setdefault("goals", dict(DEFAULT_GOALS))
    data.setdefault("days", {})
    return data


def _save(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def _day(data, date):
    return data["days"].setdefault(date, {"weight": None, "meals": []})


def get_goals():
    with _LOCK:
        return _load()["goals"]


def set_goals(new_goals):
    with _LOCK:
        data = _load()
        goals = data["goals"]
        for k in _MACRO_KEYS:
            if k in new_goals and new_goals[k] is not None:
                try:
                    goals[k] = round(float(new_goals[k]), 1)
                except (TypeError, ValueError):
                    pass
        _save(data)
        return goals


def add_meal(date, text, parsed):
    with _LOCK:
        data = _load()
        day = _day(data, date)
        meal = {
            "id": uuid.uuid4().hex[:12],
            "time": time.strftime("%H:%M"),
            "text": text,
            "items": parsed["items"],
            "unmatched": parsed.get("unmatched", []),
            "totals": parsed["totals"],
        }
        day["meals"].append(meal)
        _save(data)
        return meal


def delete_meal(date, meal_id):
    with _LOCK:
        data = _load()
        day = data["days"].get(date)
        if not day:
            return False
        before = len(day["meals"])
        day["meals"] = [m for m in day["meals"] if m["id"] != meal_id]
        changed = len(day["meals"]) != before
        if changed:
            _save(data)
        return changed


def set_weight(date, weight):
    with _LOCK:
        data = _load()
        day = _day(data, date)
        try:
            day["weight"] = round(float(weight), 1)
        except (TypeError, ValueError):
            day["weight"] = None
        _save(data)
        return day["weight"]


def get_day(date):
    with _LOCK:
        data = _load()
        day = data["days"].get(date, {"weight": None, "meals": []})
        totals = _sum_day(day["meals"])
        return {
            "date": date,
            "weight": day.get("weight"),
            "meals": day.get("meals", []),
            "totals": totals,
            "goals": data["goals"],
        }


def get_history(limit=30):
    with _LOCK:
        data = _load()
        rows = []
        for date in sorted(data["days"].keys(), reverse=True)[:limit]:
            day = data["days"][date]
            rows.append({
                "date": date,
                "weight": day.get("weight"),
                "totals": _sum_day(day.get("meals", [])),
                "meals": len(day.get("meals", [])),
            })
        return {"goals": data["goals"], "days": rows}


def _sum_day(meals):
    totals = {k: 0.0 for k in _MACRO_KEYS}
    for meal in meals:
        for k in _MACRO_KEYS:
            totals[k] += meal.get("totals", {}).get(k, 0.0)
    return {k: round(v, 1) for k, v in totals.items()}
