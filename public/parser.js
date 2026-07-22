"use strict";

// Natural-language meal parser (ported from server/meal_parser.py).
// Depends on foods.js (FOODS, PIECE_GRAMS, macrosFor, scalePer100).

const _FILLER = [
  "azi am mancat", "azi am baut", "am mancat", "am baut", "azi", "ieri",
  "la pranz", "la cina", "la micul dejun", "dimineata", "seara",
  "aproximativ", "cam", "vreo", "niste", "un pic de", "o portie de",
  "cu", "si inca",
];

const _UNITS_G = {
  kg: 1000, kilograme: 1000, kilogram: 1000,
  g: 1, gr: 1, grame: 1, gram: 1,
  mg: 0.001,
  l: 1000, litru: 1000, litri: 1000,
  ml: 1,
  lingura: 15, linguri: 15, lg: 15,
  lingurita: 5, lingurite: 5,
  cana: 240, cani: 240, pahar: 200, pahare: 200,
};
const _UNITS_PIECE = new Set([
  "buc", "bucata", "bucati", "bucati", "felie", "felii", "portie", "portii",
]);
const _NUM_WORDS = {
  o: 1, un: 1, doua: 2, doi: 2, trei: 3, patru: 4,
  cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
};
const _CONNECTORS = new Set(["de", "cu", "la", "si", "in", "a", "al", "ale"]);

function _stripDiacritics(text) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function _norm(text) {
  let t = _stripDiacritics(String(text).toLowerCase());
  if (/^\d+,\d+$/.test(t.trim())) t = t.replace(",", ".");
  return t.replace(/\s+/g, " ").trim();
}

// Pre-normalized food index, longest first for greedy matching.
const _FOOD_KEYS = Object.keys(FOODS).map(_norm).sort((a, b) => b.length - a.length);
const _NORM_TO_ORIG = {};
for (const orig of Object.keys(FOODS)) {
  const k = _norm(orig);
  if (!(k in _NORM_TO_ORIG)) _NORM_TO_ORIG[k] = orig;
}

// Snapshot of the built-in database, so user-added foods can be layered on
// top (and cleanly removed) without losing the defaults.
const _BASE_FOODS = { ...FOODS };

// Rebuild the lookup indexes from the current FOODS object. Called after the
// custom food list changes.
function rebuildFoodIndex() {
  const keys = Object.keys(FOODS).map(_norm).sort((a, b) => b.length - a.length);
  _FOOD_KEYS.length = 0;
  _FOOD_KEYS.push(...keys);
  for (const k of Object.keys(_NORM_TO_ORIG)) delete _NORM_TO_ORIG[k];
  for (const orig of Object.keys(FOODS)) {
    const k = _norm(orig);
    if (!(k in _NORM_TO_ORIG)) _NORM_TO_ORIG[k] = orig;
  }
}

// Reset FOODS to the built-in defaults and layer the user's custom foods on
// top (per-100 g macros), then rebuild the indexes so the parser matches them.
function applyCustomFoods(list) {
  for (const k of Object.keys(FOODS)) delete FOODS[k];
  Object.assign(FOODS, _BASE_FOODS);
  (list || []).forEach((f) => {
    const name = String((f && f.name) || "").trim();
    if (!name) return;
    FOODS[name] = [
      Number(f.calories) || 0,
      Number(f.protein) || 0,
      Number(f.carbs) || 0,
      Number(f.fat) || 0,
      Number(f.fiber) || 0,
    ];
  });
  rebuildFoodIndex();
}

function _escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Approximate difflib.SequenceMatcher ratio using Levenshtein distance.
function _ratio(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return 1;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

function _closeMatch(phrase, cutoff) {
  let best = null;
  let bestScore = cutoff;
  for (const key of _FOOD_KEYS) {
    const s = _ratio(phrase, key);
    if (s >= bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return best;
}

function _splitChunks(text) {
  const parts = [];
  let buf = "";
  let depth = 0;
  for (const tok of text.split(/(\(|\)|,|\+|&|\bsi\b)/)) {
    if (tok === "(") {
      depth += 1;
      buf += tok;
    } else if (tok === ")") {
      depth = Math.max(0, depth - 1);
      buf += tok;
    } else if (depth === 0 && (tok === "," || tok === "+" || tok === "&" || tok === "si")) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
    } else {
      buf += tok;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function _extractQuantity(chunk) {
  const tokens = chunk.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [null, null, chunk];

  let qty = null;
  let unit = null;
  let idx = 0;

  const m = tokens[0].match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)?$/);
  if (m) {
    qty = parseFloat(m[1].replace(",", "."));
    if (m[2]) unit = m[2];
    idx = 1;
  } else if (tokens[0] in _NUM_WORDS) {
    qty = _NUM_WORDS[tokens[0]];
    idx = 1;
  }

  if (qty === null) return [null, null, chunk];

  if (unit === null && idx < tokens.length) {
    const cand = tokens[idx];
    if (cand in _UNITS_G || _UNITS_PIECE.has(cand)) {
      unit = cand;
      idx += 1;
    }
  }

  const leftover = tokens.slice(idx).join(" ").trim();

  if (_UNITS_PIECE.has(unit)) return ["pieces", qty, leftover];
  if (unit in _UNITS_G) return ["grams", qty * _UNITS_G[unit], leftover];
  return ["count", qty, leftover];
}

function _matchFood(text) {
  const t = _norm(text);
  if (!t) return null;
  if (t in _NORM_TO_ORIG) return _NORM_TO_ORIG[t];

  for (const key of _FOOD_KEYS) {
    if (new RegExp("\\b" + _escapeRe(key) + "\\b").test(t)) {
      return _NORM_TO_ORIG[key];
    }
  }

  const words = t.split(" ");
  for (const n of [3, 2, 1]) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      const hit = _closeMatch(phrase, 0.82);
      if (hit) return _NORM_TO_ORIG[hit];
    }
  }
  return null;
}

function _extraWords(nameText, food) {
  const nameTokens = _norm(nameText).split(" ");
  const foodTokens = new Set(_norm(food).split(" "));
  return nameTokens.filter(
    (w) => !foodTokens.has(w) && !_CONNECTORS.has(w) && w.length > 1
  );
}

function _resolveGrams(kind, qty, pieceG) {
  if (kind === "pieces") return round1(qty * (pieceG || 100));
  if (kind === "count") return round1(pieceG ? qty * pieceG : qty);
  if (kind === "grams") return round1(qty);
  if (pieceG) return round1(pieceG);
  return 100.0;
}

function _onlineGrams(kind, qty, nameText) {
  const pieceG = PIECE_GRAMS[_norm(nameText)];
  if (kind === "grams") return round1(qty);
  if (kind === "pieces" || kind === "count") return round1(qty * (pieceG || 100));
  return 100.0;
}

function sumMacros(items) {
  const keys = ["calories", "protein", "carbs", "fat", "fiber"];
  const totals = {};
  keys.forEach((k) => (totals[k] = 0));
  for (const it of items) {
    for (const k of keys) totals[k] += it[k] || 0;
  }
  keys.forEach((k) => (totals[k] = round1(totals[k])));
  return totals;
}

async function _buildItem(nameText, grams, resolver) {
  const food = _matchFood(nameText);
  if (food) return { food, grams, ...macrosFor(food, grams) };
  const external = resolver && nameText ? await resolver(nameText) : null;
  if (external) {
    return {
      food: external.name || nameText,
      grams,
      source: external.source || "online",
      ...scalePer100(external, grams),
    };
  }
  return null;
}

// resolver: optional async (name) -> { name, calories, ... , source } | null
async function parseMeal(text, resolver) {
  let cleaned = _norm(text);
  for (const filler of _FILLER) {
    cleaned = cleaned.replace(new RegExp("\\b" + _escapeRe(filler) + "\\b", "g"), " ");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const items = [];
  const unmatched = [];

  for (const chunk of _splitChunks(cleaned)) {
    const group = chunk.match(/\(([^)]*)\)/);
    if (group) {
      const head = chunk.slice(0, group.index).trim();
      const parts = group[1]
        .split(/,|\bsi\b|\+|&/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length) {
        const [kind, qty] = _extractQuantity(head);
        const total = _resolveGrams(kind, qty, null);
        const per = round1(total / parts.length);
        for (const part of parts) {
          const item = await _buildItem(part, per, resolver);
          if (item) items.push(item);
          else unmatched.push(part);
        }
        continue;
      }
    }

    const [kind, qty, leftover] = _extractQuantity(chunk);
    const nameText = kind !== null ? leftover : chunk;
    const food = _matchFood(nameText);

    if (food) {
      const extra = _extraWords(nameText, food);
      if (extra.length && resolver) {
        const external = await resolver(nameText);
        if (external) {
          const grams = _onlineGrams(kind, qty, nameText);
          items.push({
            food: external.name || nameText,
            grams,
            source: external.source || "online",
            ...scalePer100(external, grams),
          });
          continue;
        }
      }
      const pieceG = PIECE_GRAMS[_norm(food)];
      const grams = _resolveGrams(kind, qty, pieceG);
      items.push({ food, grams, ...macrosFor(food, grams) });
      continue;
    }

    const external = resolver && nameText ? await resolver(nameText) : null;
    if (external) {
      const grams = _onlineGrams(kind, qty, nameText);
      items.push({
        food: external.name || nameText,
        grams,
        source: external.source || "online",
        ...scalePer100(external, grams),
      });
      continue;
    }

    unmatched.push(chunk);
  }

  return { items, unmatched, totals: sumMacros(items) };
}
