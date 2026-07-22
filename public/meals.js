"use strict";

// Meals page logic (index.html). Depends on common.js.

// Pick an emoji for a food, matched on keywords in its name.
const FOOD_EMOJI = [
  [["piept de pui", "pulpa de pui", "carne de pui", "pui", "curcan"], "🍗"],
  [["salam", "parizer", "crenvursti", "sunca", "bacon", "carne de porc", "carne de vita", "carne tocata", "carne", "slanina"], "🥩"],
  [["somon", "ton", "peste"], "🐟"],
  [["cascaval", "telemea", "mozzarella", "branza", "cas"], "🧀"],
  [["iaurt", "kefir", "sana", "lapte batut", "lapte", "smantana"], "🥛"],
  [["unt"], "🧈"],
  [["ou", "oua"], "🥚"],
  [["paine", "covrigi", "gris", "faina"], "🍞"],
  [["biscuiti"], "🍪"],
  [["cereale", "ovaz"], "🥣"],
  [["orez"], "🍚"],
  [["paste"], "🍝"],
  [["cartof", "cartofi"], "🥔"],
  [["porumb", "mamaliga"], "🌽"],
  [["rosii", "rosie"], "🍅"],
  [["castravete"], "🥒"],
  [["ceapa"], "🧅"],
  [["morcov"], "🥕"],
  [["ardei"], "🫑"],
  [["broccoli"], "🥦"],
  [["spanac", "salata", "varza"], "🥬"],
  [["mazare", "fasole", "naut", "linte"], "🫘"],
  [["ciuperci"], "🍄"],
  [["avocado"], "🥑"],
  [["mar"], "🍎"],
  [["banana"], "🍌"],
  [["portocala"], "🍊"],
  [["struguri"], "🍇"],
  [["capsuni"], "🍓"],
  [["pere", "para"], "🍐"],
  [["piersic"], "🍑"],
  [["pepene"], "🍉"],
  [["cirese", "visine"], "🍒"],
  [["nuci", "migdale", "alune", "seminte", "chia"], "🌰"],
  [["ulei"], "🫒"],
  [["zahar"], "🍬"],
  [["miere"], "🍯"],
  [["ciocolata"], "🍫"],
  [["gem"], "🍯"],
  [["pizza"], "🍕"],
  [["bere"], "🍺"],
  [["vin"], "🍷"],
  [["cola", "suc"], "🥤"],
  [["cafea"], "☕"],
  [["apa"], "💧"],
];

function foodEmoji(name) {
  const n = (name || "").toLowerCase();
  for (const [keys, emoji] of FOOD_EMOJI) {
    for (const k of keys) {
      if (n.includes(k)) return emoji;
    }
  }
  return "🍽️";
}

function itemsTable(items, totals) {
  if (!items || !items.length) {
    return '<div class="empty">Niciun aliment recunoscut.</div>';
  }
  const srcLabels = { openfoodfacts: "online", online: "online", llm: "AI", vision: "foto", barcode: "cod" };
  const rows = items
    .map((it) => {
      const src = it.source
        ? ` <span class="src-tag">${srcLabels[it.source] || it.source}</span>`
        : "";
      return `<tr>
        <td class="tf"><span class="fe">${foodEmoji(it.food)}</span> ${it.grams} g ${escapeHtml(
        it.food
      )}${src}</td>
        <td>${fmt(it.calories)}</td>
        <td>${fmt(it.protein)}</td>
        <td>${fmt(it.carbs)}</td>
        <td>${fmt(it.fat)}</td>
        <td>${fmt(it.fiber)}</td>
      </tr>`;
    })
    .join("");
  const foot = totals
    ? `<tfoot><tr>
        <td class="tf"><b>Total</b></td>
        <td><b>${fmt(totals.calories)}</b></td>
        <td>${fmt(totals.protein)}</td>
        <td>${fmt(totals.carbs)}</td>
        <td>${fmt(totals.fat)}</td>
        <td>${fmt(totals.fiber)}</td>
      </tr></tfoot>`
    : "";
  const head = MACROS.map(
    (m) => `<th title="${m.label}">${m.emoji} ${m.label.charAt(0)}</th>`
  ).join("");
  return `<table class="items-table">
    <thead>
      <tr>
        <th>🍽️ Aliment</th>${head}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    ${foot}
  </table>`;
}

// ---- Real-time preview ------------------------------------------------
function renderPreview(result) {
  const box = $("#preview");
  box.hidden = false;
  const unmatched = result.unmatched && result.unmatched.length
    ? `<div class="unmatched">Nu am recunoscut: ${result.unmatched.join(", ")}</div>`
    : "";
  box.innerHTML = `${itemsTable(result.items, result.totals)}${unmatched}`;
}

function renderProgress(totals, goals) {
  state.goals = goals;
  state.dayTotals = totals;
  $("#progress").innerHTML = MACROS.map((m) => {
    const have = totals[m.key] || 0;
    const goal = goals[m.key] || 0;
    const pct = goal > 0 ? Math.min(100, (have / goal) * 100) : 0;
    const over = goal > 0 && have > goal;
    const pv = Math.max(pct, 0.001);
    return `<div class="prog">
      <span class="label" title="${m.label}">${m.emoji}</span>
      <div class="bar ${m.safe ? "safe" : ""} ${over ? "over" : ""}"><span style="width:${pct}%;--pct:${pv}"></span></div>
      <span class="val">${fmt(have)} / ${fmt(goal)} ${m.unit}</span>
    </div>`;
  }).join("");
}

function renderMeals(meals) {
  const box = $("#meals-list");
  const addTile = `<button type="button" class="add-tile" id="add-tile">
    <span class="add-plus">➕</span>
    <span>Adaugă o masă</span>
  </button>`;

  const cards = meals
    .map((m, idx) => {
      const t = m.totals;
      return `<div class="meal clickable" data-id="${m.id}">
        <div class="meal-head">
          <span class="meal-name">🍽️ Masa ${idx + 1} <span class="time">${m.time}</span></span>
          <button class="del" data-id="${m.id}">🗑️ Șterge</button>
        </div>
        <div class="meal-macros">
          <span><b>${fmt(t.calories)}</b> kcal</span>
          <span>P <b>${fmt(t.protein)}</b></span>
          <span>C <b>${fmt(t.carbs)}</b></span>
          <span>G <b>${fmt(t.fat)}</b></span>
          <span>F <b>${fmt(t.fiber)}</b></span>
        </div>
      </div>`;
    })
    .join("");

  const empty = meals.length
    ? ""
    : '<div class="empty">🍽️ Nicio masă înregistrată azi.</div>';
  box.innerHTML = empty + cards + addTile;

  const at = $("#add-tile");
  if (at) at.addEventListener("click", () => openAddForm(null));

  box.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMeal(btn.dataset.id);
    });
  });

  box.querySelectorAll(".meal.clickable").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".del")) return;
      const m = meals.find((x) => x.id === el.dataset.id);
      if (m) openAddForm(m);
    });
  });
}

// ---- Calendar ---------------------------------------------------------
const calState = { year: null, month: null }; // month is 0-11
let daysWithMeals = {}; // "YYYY-MM-DD" -> { meals, calories }

const MONTH_NAMES = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function renderCalendar() {
  const box = $("#calendar");
  const { year, month } = calState;
  $("#cal-title").textContent = `${MONTH_NAMES[month]} ${year}`;

  const first = new Date(year, month, 1);
  const startCol = (first.getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());

  const wd = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
  let html = wd.map((d) => `<div class="cal-wd">${d}</div>`).join("");
  for (let i = 0; i < startCol; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(year, month, d);
    const info = daysWithMeals[date];
    const cls = ["cal-cell"];
    if (info && info.meals > 0) cls.push("has");
    if (date === state.date) cls.push("selected");
    if (date === today) cls.push("today");
    const dot = info && info.meals > 0 ? '<span class="cal-dot"></span>' : "";
    html += `<div class="${cls.join(" ")}" data-date="${date}">
      <span class="cal-num">${d}</span>${dot}</div>`;
  }
  box.innerHTML = html;

  box.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.date = cell.dataset.date;
      $("#date-input").value = state.date;
      loadDay();
    });
  });
}

function changeMonth(delta) {
  let m = calState.month + delta;
  let y = calState.year;
  if (m < 0) {
    m = 11;
    y -= 1;
  } else if (m > 11) {
    m = 0;
    y += 1;
  }
  calState.month = m;
  calState.year = y;
  renderCalendar();
}

async function loadDay() {
  const day = await api(`/api/day?date=${state.date}`);
  renderProgress(day.totals, day.goals);
  renderMeals(day.meals);
  loadHistory();
}

async function loadHistory() {
  const hist = await api("/api/history?limit=366");
  daysWithMeals = {};
  hist.days.forEach((r) => {
    daysWithMeals[r.date] = { meals: r.meals, calories: r.totals.calories };
  });
  if (calState.year === null) {
    const [yy, mm] = state.date.split("-").map(Number);
    calState.year = yy;
    calState.month = mm - 1;
  }
  renderCalendar();
}

async function previewMeal() {
  const text = $("#meal-input").value.trim();
  if (!text) return;
  const result = await api("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  renderPreview(result);
}

// Debounced live preview while the user is typing.
let livePreviewTimer = null;
function scheduleLivePreview() {
  clearTimeout(livePreviewTimer);
  const text = $("#meal-input").value.trim();
  if (!text) {
    $("#preview").hidden = true;
    return;
  }
  livePreviewTimer = setTimeout(async () => {
    const current = $("#meal-input").value.trim();
    if (!current) {
      $("#preview").hidden = true;
      return;
    }
    try {
      const result = await api("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: current }),
      });
      // Only render if the user hasn't kept typing in the meantime.
      if ($("#meal-input").value.trim() === current) renderPreview(result);
    } catch (err) {
      /* ignore transient parse errors while typing */
    }
  }, 550);
}

// ---- Add / edit meal form (summoned on demand) ------------------------
let editingId = null;

function openAddForm(meal) {
  const card = $("#add-card");
  card.hidden = false;
  editingId = meal ? meal.id : null;
  $("#meal-input").value = meal ? meal.text : "";
  $("#add-title").textContent = meal ? "✏️ Editează masa" : "🍴 Adaugă o masă";
  $("#submit-meal").textContent = meal ? "Salvează" : "Adaugă masa";
  $("#preview").hidden = true;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#meal-input").focus();
  if (meal) scheduleLivePreview();
}

function closeAddForm() {
  editingId = null;
  $("#meal-input").value = "";
  $("#preview").hidden = true;
  $("#add-card").hidden = true;
}

async function submitMeal(e) {
  e.preventDefault();
  const text = $("#meal-input").value.trim();
  if (!text) return;
  if (editingId) {
    await api("/api/meals/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: state.date, id: editingId, text }),
    });
  } else {
    await api("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, date: state.date }),
    });
  }
  closeAddForm();
  loadDay();
}

async function deleteMeal(id) {
  const res = await api(`/api/meals?date=${state.date}&id=${id}`, { method: "DELETE" });
  const day = res.day;
  renderProgress(day.totals, day.goals);
  renderMeals(day.meals);
  loadHistory();
}

// ---- Scanare etichete (AI vision) -------------------------------------
let scanLabel = null;

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function toDataUrl(file) {
  const img = await fileToImage(file);
  const max = 1024;
  let width = img.width;
  let height = img.height;
  if (width > max || height > max) {
    const s = Math.min(max / width, max / height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function scanFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const status = $("#scan-status");
  $("#scan-result").hidden = true;
  status.textContent = "Se citește eticheta…";
  try {
    const image = await toDataUrl(file);
    const res = await api("/api/label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (res.error) {
      status.textContent = "Nu am putut citi eticheta. Încearcă o poză mai clară.";
      return;
    }
    status.textContent = "";
    renderScan(res);
  } catch (err) {
    status.textContent =
      "Nu am putut citi eticheta. Verifică modelul vision și încearcă o poză mai clară.";
  }
}

function renderScan(res) {
  scanLabel = res;
  const rows = MACROS.map(
    (m) => `${m.label}: <b>${fmt(res[m.key])}</b> ${m.unit}`
  ).join(" · ");
  $("#scan-values").innerHTML = `
    <label class="scan-name">Produs
      <input id="scan-name" type="text" value="${escapeHtml(
        res.name || ""
      )}" placeholder="Nume produs" />
    </label>
    <div class="hint">Valori / 100 g: ${rows}</div>`;
  $("#scan-result").hidden = false;
}

async function addScanItem(e) {
  e.preventDefault();
  if (!scanLabel) return;
  const name = ($("#scan-name").value || "").trim() || scanLabel.name || "produs";
  const grams = parseFloat($("#scan-grams").value) || 0;
  if (grams <= 0) return;
  const per_100g = {};
  MACROS.forEach((m) => (per_100g[m.key] = scanLabel[m.key]));
  const res = await api("/api/meals/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: state.date, name, grams, per_100g, source: "vision" }),
  });
  if (res.error) return;
  scanLabel = null;
  $("#scan-result").hidden = true;
  $("#label-file").value = "";
  const day = res.day;
  renderProgress(day.totals, day.goals);
  renderMeals(day.meals);
  loadHistory();
}

// ---- Scanare cod de bare ---------------------------------------------
let bcProduct = null;
let bcStream = null;
let bcDetector = null;
let bcRAF = null;

function bcSupportsCamera() {
  return (
    "BarcodeDetector" in window &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

async function startBarcodeScan() {
  const status = $("#bc-status");
  if (!bcSupportsCamera()) {
    status.textContent = "Camera nu e disponibilă aici. Scrie codul manual mai jos.";
    return;
  }
  try {
    if (!bcDetector) {
      bcDetector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
    }
    bcStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const video = $("#bc-video");
    video.srcObject = bcStream;
    video.hidden = false;
    $("#bc-start").hidden = true;
    $("#bc-stop").hidden = false;
    status.textContent = "Caut codul de bare…";
    await video.play();
    scanLoop();
  } catch (err) {
    status.textContent =
      "Nu am putut porni camera. Verifică permisiunile sau scrie codul manual.";
    stopBarcodeScan();
  }
}

async function scanLoop() {
  const video = $("#bc-video");
  if (!bcStream || !video || video.readyState < 2) {
    bcRAF = requestAnimationFrame(scanLoop);
    return;
  }
  try {
    const codes = await bcDetector.detect(video);
    if (codes && codes.length) {
      const code = codes[0].rawValue;
      stopBarcodeScan();
      await lookupBarcode(code);
      return;
    }
  } catch (e) {
    // ignore per-frame decode errors and keep scanning
  }
  bcRAF = requestAnimationFrame(scanLoop);
}

function stopBarcodeScan() {
  if (bcRAF) cancelAnimationFrame(bcRAF);
  bcRAF = null;
  if (bcStream) {
    bcStream.getTracks().forEach((t) => t.stop());
    bcStream = null;
  }
  const video = $("#bc-video");
  if (video) {
    video.srcObject = null;
    video.hidden = true;
  }
  $("#bc-start").hidden = false;
  $("#bc-stop").hidden = true;
}

async function lookupBarcode(code) {
  const status = $("#bc-status");
  const clean = String(code || "").replace(/\D/g, "");
  if (!clean) {
    status.textContent = "Scrie un cod de bare valid.";
    return;
  }
  status.textContent = `Caut produsul (${clean})…`;
  $("#bc-result").hidden = true;
  try {
    const res = await api(`/api/barcode?code=${encodeURIComponent(clean)}`);
    if (res.error) {
      status.textContent =
        "Produsul nu a fost găsit în baza de date. Încearcă alt cod sau adaugă-l manual.";
      return;
    }
    status.textContent = "";
    renderBarcode(res);
  } catch (e) {
    status.textContent = "Eroare la căutare. Verifică conexiunea la internet.";
  }
}

function renderBarcode(res) {
  bcProduct = res;
  const rows = MACROS.map(
    (m) => `${m.label}: <b>${fmt(res[m.key])}</b> ${m.unit}`
  ).join(" · ");
  $("#bc-values").innerHTML = `
    <label class="scan-name">Produs
      <input id="bc-name" type="text" value="${escapeHtml(
        res.name || ""
      )}" placeholder="Nume produs" />
    </label>
    <div class="hint">Valori / 100 g: ${rows}</div>`;
  $("#bc-result").hidden = false;
}

async function addBarcodeItem(e) {
  e.preventDefault();
  if (!bcProduct) return;
  const name = ($("#bc-name").value || "").trim() || bcProduct.name || "produs";
  const grams = parseFloat($("#bc-grams").value) || 0;
  if (grams <= 0) return;
  const per_100g = {};
  MACROS.forEach((m) => (per_100g[m.key] = bcProduct[m.key]));
  const res = await api("/api/meals/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: state.date, name, grams, per_100g, source: "barcode" }),
  });
  if (res.error) return;
  bcProduct = null;
  $("#bc-result").hidden = true;
  $("#bc-code").value = "";
  $("#bc-status").textContent = "";
  const day = res.day;
  renderProgress(day.totals, day.goals);
  renderMeals(day.meals);
  loadHistory();
}

async function init() {
  const cfg = await initCommon(loadDay);
  $("#meal-form").addEventListener("submit", submitMeal);
  $("#cancel-add").addEventListener("click", closeAddForm);
  $("#meal-input").addEventListener("input", scheduleLivePreview);
  $("#cal-prev").addEventListener("click", () => changeMonth(-1));
  $("#cal-next").addEventListener("click", () => changeMonth(1));
  if (cfg.vision) {
    $("#scan-card").hidden = false;
    $("#label-file").addEventListener("change", scanFile);
    $("#scan-form").addEventListener("submit", addScanItem);
  }
  $("#bc-start").addEventListener("click", startBarcodeScan);
  $("#bc-stop").addEventListener("click", stopBarcodeScan);
  $("#bc-search").addEventListener("click", () => lookupBarcode($("#bc-code").value));
  $("#bc-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode($("#bc-code").value);
    }
  });
  $("#bc-form").addEventListener("submit", addBarcodeItem);
  if (!bcSupportsCamera()) $("#bc-start").hidden = true;
  loadDay();
}

init();
