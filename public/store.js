"use strict";

// Local persistence on the device (ported from server/storage.py).
// Everything is kept in one JSON blob in localStorage, so data lives on the
// phone and the app works fully offline.

const STORE_KEY = "eattrack";

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 120,
  carbs: 220,
  fat: 60,
  fiber: 30,
};

const _MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber"];

function _emptyStore() {
  return { goals: { ...DEFAULT_GOALS }, days: {} };
}

function _load() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch (e) {
    data = null;
  }
  if (!data || typeof data !== "object") data = _emptyStore();
  if (!data.goals) data.goals = { ...DEFAULT_GOALS };
  if (!data.days) data.days = {};
  return data;
}

function _save(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function _day(data, date) {
  if (!data.days[date]) data.days[date] = { weight: null, meals: [] };
  return data.days[date];
}

function _sumDay(meals) {
  const totals = {};
  _MACRO_KEYS.forEach((k) => (totals[k] = 0));
  for (const meal of meals) {
    for (const k of _MACRO_KEYS) totals[k] += (meal.totals || {})[k] || 0;
  }
  _MACRO_KEYS.forEach((k) => (totals[k] = round1(totals[k])));
  return totals;
}

function _newId() {
  return Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

function _nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const Store = {
  getGoals() {
    return _load().goals;
  },

  setGoals(newGoals) {
    const data = _load();
    const goals = data.goals;
    for (const k of _MACRO_KEYS) {
      if (newGoals[k] !== undefined && newGoals[k] !== null) {
        const v = parseFloat(newGoals[k]);
        if (!Number.isNaN(v)) goals[k] = round1(v);
      }
    }
    _save(data);
    return goals;
  },

  addMeal(date, text, parsed) {
    const data = _load();
    const day = _day(data, date);
    const meal = {
      id: _newId(),
      time: _nowTime(),
      text,
      items: parsed.items,
      unmatched: parsed.unmatched || [],
      totals: parsed.totals,
    };
    day.meals.push(meal);
    _save(data);
    return meal;
  },

  deleteMeal(date, mealId) {
    const data = _load();
    const day = data.days[date];
    if (!day) return false;
    const before = day.meals.length;
    day.meals = day.meals.filter((m) => m.id !== mealId);
    const changed = day.meals.length !== before;
    if (changed) _save(data);
    return changed;
  },

  setWeight(date, weight) {
    const data = _load();
    const day = _day(data, date);
    const v = parseFloat(weight);
    day.weight = Number.isNaN(v) ? null : round1(v);
    _save(data);
    return day.weight;
  },

  updateMeal(date, mealId, text, parsed) {
    const data = _load();
    const day = data.days[date];
    if (!day) return null;
    const meal = (day.meals || []).find((m) => m.id === mealId);
    if (!meal) return null;
    meal.text = text;
    meal.items = parsed.items;
    meal.unmatched = parsed.unmatched || [];
    meal.totals = parsed.totals;
    _save(data);
    return meal;
  },

  getDay(date) {
    const data = _load();
    const day = data.days[date] || { weight: null, meals: [] };
    return {
      date,
      weight: day.weight != null ? day.weight : null,
      meals: day.meals || [],
      totals: _sumDay(day.meals || []),
      goals: data.goals,
    };
  },

  getHistory(limit) {
    const data = _load();
    const dates = Object.keys(data.days).sort().reverse().slice(0, limit);
    const days = dates.map((date) => {
      const day = data.days[date];
      return {
        date,
        weight: day.weight != null ? day.weight : null,
        totals: _sumDay(day.meals || []),
        meals: (day.meals || []).length,
      };
    });
    return { goals: data.goals, days };
  },
};
