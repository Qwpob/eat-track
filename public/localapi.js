"use strict";

// Client-side API — replaces the Python server. Routes the same /api/* calls
// used by the pages to the local store + parser, so the whole app runs on the
// device with no backend.
//
// Depends on: foods.js, parser.js, store.js.

// Online lookup (OpenFoodFacts RO) is best-effort: it only runs when the phone
// has internet. On any failure the app falls back to the local database.
const ONLINE_LOOKUP = true;

const _OFF_URL = "https://ro.openfoodfacts.org/cgi/search.pl";
const _OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const _offCache = {};
const _barcodeCache = {};

function _localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function _num(n, ...keys) {
  for (const k of keys) {
    const val = n[k];
    if (val === undefined || val === null || val === "") continue;
    const f = parseFloat(val);
    if (!Number.isNaN(f)) return f;
  }
  return null;
}

function _extractOff(product) {
  const n = product.nutriments || {};
  let cal = _num(n, "energy-kcal_100g", "energy-kcal");
  if (cal === null) {
    const kj = _num(n, "energy_100g", "energy");
    cal = kj !== null ? round1(kj / 4.184) : null;
  }
  if (cal === null) return null;
  return {
    calories: round1(cal),
    protein: round1(_num(n, "proteins_100g", "proteins") || 0),
    carbs: round1(_num(n, "carbohydrates_100g", "carbohydrates") || 0),
    fat: round1(_num(n, "fat_100g", "fat") || 0),
    fiber: round1(_num(n, "fiber_100g", "fiber") || 0),
  };
}

async function offLookup(name) {
  if (!name || !ONLINE_LOOKUP) return null;
  const key = name.trim().toLowerCase();
  if (key in _offCache) return _offCache[key];

  let result = null;
  try {
    const params = new URLSearchParams({
      search_terms: name,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "10",
      lc: "ro",
      cc: "ro",
      sort_by: "unique_scans_n",
      fields: "product_name,product_name_ro,nutriments,nutrition_grades",
    });
    const resp = await fetch(`${_OFF_URL}?${params.toString()}`);
    if (resp.ok) {
      const data = await resp.json();
      const terms = name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      let best = null;
      let bestScore = -1;
      for (const product of data.products || []) {
        const macros = _extractOff(product);
        if (!macros) continue;
        const pname = (product.product_name_ro || product.product_name || "").toLowerCase();
        const score = terms.reduce((s, t) => s + (pname.includes(t) ? 1 : 0), 0);
        if (score > bestScore) {
          best = { macros, pname, product };
          bestScore = score;
        }
        if (terms.length && score === terms.length) break;
      }
      if (best) {
        const display = best.product.product_name_ro || best.product.product_name || name;
        result = {
          ...best.macros,
          name: display.trim().slice(0, 60),
          source: "openfoodfacts",
        };
      }
    }
  } catch (e) {
    result = null; // offline or blocked — fall back to local DB
  }

  _offCache[key] = result;
  return result;
}

// Look a product up by its barcode (EAN/UPC) directly on OpenFoodFacts.
// Returns macros per 100 g + a display name, or null when not found / offline.
async function offLookupBarcode(code) {
  const barcode = String(code || "").replace(/\D/g, "");
  if (!barcode || !ONLINE_LOOKUP) return null;
  if (barcode in _barcodeCache) return _barcodeCache[barcode];

  let result = null;
  try {
    const url = `${_OFF_PRODUCT_URL}/${barcode}.json?fields=product_name,product_name_ro,brands,nutriments`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 1 && data.product) {
        const macros = _extractOff(data.product);
        if (macros) {
          const p = data.product;
          const display = (p.product_name_ro || p.product_name || "").trim();
          const brand = (p.brands || "").split(",")[0].trim();
          const name = (display || brand || `produs ${barcode}`).slice(0, 60);
          result = { ...macros, name, barcode, source: "barcode" };
        }
      }
    }
  } catch (e) {
    result = null; // offline or blocked
  }

  _barcodeCache[barcode] = result;
  return result;
}

async function parseText(text) {
  const resolver = ONLINE_LOOKUP ? offLookup : null;
  const result = await parseMeal(text, resolver);
  result.engine = resolver ? "online" : "local";
  return result;
}

// Drop-in replacement for the old fetch-based api(): same signature, but it
// resolves everything locally instead of hitting a server.
async function api(path, opts) {
  const url = new URL(path, "http://local");
  const method = (opts && opts.method) || "GET";
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  const qs = url.searchParams;
  const p = url.pathname;

  if (method === "GET") {
    if (p === "/api/config") {
      return { engine: ONLINE_LOOKUP ? "online" : "local", vision: false, today: _localToday() };
    }
    if (p === "/api/day") {
      return Store.getDay(qs.get("date") || _localToday());
    }
    if (p === "/api/history") {
      return Store.getHistory(parseInt(qs.get("limit") || "30", 10));
    }
    if (p === "/api/barcode") {
      const product = await offLookupBarcode(qs.get("code") || "");
      return product || { error: "not found" };
    }
    if (p === "/api/goals") {
      return Store.getGoals();
    }
  }

  if (method === "POST") {
    if (p === "/api/parse") {
      const text = (body.text || "").trim();
      if (!text) return { error: "empty text" };
      return parseText(text);
    }
    if (p === "/api/meals") {
      const text = (body.text || "").trim();
      const date = body.date || _localToday();
      if (!text) return { error: "empty text" };
      const parsed = await parseText(text);
      const meal = Store.addMeal(date, text, parsed);
      return { meal, day: Store.getDay(date) };
    }
    if (p === "/api/meals/item") {
      const date = body.date || _localToday();
      const name = (body.name || "").trim();
      const per100 = body.per_100g || {};
      const grams = round1(parseFloat(body.grams));
      if (!name || !(grams > 0)) return { error: "invalid item" };
      const item = {
        food: name,
        grams,
        source: body.source || "manual",
        ...scalePer100(per100, grams),
      };
      const parsed = { items: [item], unmatched: [], totals: sumMacros([item]) };
      const meal = Store.addMeal(date, name, parsed);
      return { meal, day: Store.getDay(date) };
    }
    if (p === "/api/meals/update") {
      const date = body.date || _localToday();
      const id = body.id || "";
      const text = (body.text || "").trim();
      if (!text) return { error: "empty text" };
      const parsed = await parseText(text);
      const meal = Store.updateMeal(date, id, text, parsed);
      if (!meal) return { error: "not found" };
      return { meal, day: Store.getDay(date) };
    }
    if (p === "/api/weight") {
      const date = body.date || _localToday();
      const weight = Store.setWeight(date, body.weight);
      return { weight, day: Store.getDay(date) };
    }
    if (p === "/api/goals") {
      return Store.setGoals(body);
    }
  }

  if (method === "DELETE" && p === "/api/meals") {
    const date = qs.get("date") || _localToday();
    const ok = Store.deleteMeal(date, qs.get("id") || "");
    return { ok, day: Store.getDay(date) };
  }

  return { error: "not found" };
}
