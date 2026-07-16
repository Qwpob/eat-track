"use strict";

// Objectives page logic (obiective.html). Depends on common.js.
// Computes daily targets from basic, well-established fitness formulas:
//   BMR  — Mifflin-St Jeor
//   TDEE — BMR x activity factor
//   Macros — protein/fat per kg of bodyweight, carbs fill the rest,
//            fiber ~14 g / 1000 kcal.

const PROFILE_KEY = "eattrack_profile";

const GOAL_PLANS = {
  // calFactor applied to TDEE; protein & fat in g per kg bodyweight.
  lose: { label: "Slăbire", calFactor: 0.8, proteinPerKg: 2.0, fatPerKg: 0.8 },
  maintain: { label: "Menținere", calFactor: 1.0, proteinPerKg: 1.8, fatPerKg: 1.0 },
  gain: { label: "Creștere masă", calFactor: 1.12, proteinPerKg: 2.0, fatPerKg: 1.0 },
};

// Human figure shown next to the calculator, per activity factor.
const ACTIVITY = {
  "1.2": { emoji: "🧑‍💻", label: "Sedentar", level: 1 },
  "1.375": { emoji: "🚶", label: "Activitate ușoară", level: 2 },
  "1.55": { emoji: "🏃", label: "Activitate moderată", level: 3 },
  "1.725": { emoji: "🏋️", label: "Activitate intensă", level: 4 },
  "1.9": { emoji: "💪", label: "Foarte intensă", level: 5 },
};

// Basic, well-known diet styles. Percentages are share of total calories
// as carbohydrates / protein / fat (must sum to 100).
const DIETS = [
  { id: "balanced", emoji: "🥗", name: "Echilibrată", carb: 45, protein: 25, fat: 30,
    desc: "Distribuție clasică, ușor de menținut pe termen lung." },
  { id: "lowcarb", emoji: "🥑", name: "Low-carb", carb: 25, protein: 35, fat: 40,
    desc: "Mai puțini carbohidrați, sațietate crescută — bună pentru slăbit." },
  { id: "keto", emoji: "🧀", name: "Keto", carb: 5, protein: 25, fat: 70,
    desc: "Foarte puțini carbohidrați; corpul folosește grăsimile ca energie." },
  { id: "highprotein", emoji: "🍗", name: "Bogată în proteine", carb: 35, protein: 40, fat: 25,
    desc: "Protejează masa musculară în timpul deficitului caloric." },
  { id: "mediterranean", emoji: "🫒", name: "Mediteraneană", carb: 50, protein: 20, fat: 30,
    desc: "Legume, pește, ulei de măsline — echilibrată și sănătoasă." },
];

// Informational weight-loss methods (no macro change).
const METHODS = [
  { emoji: "⏱️", name: "Post intermitent 16:8", desc: "Mănânci într-un interval de 8h, postești 16h — ajută la controlul poftelor." },
  { emoji: "📉", name: "Deficit caloric ~500 kcal", desc: "Ritm sănătos: ~0.5 kg slăbit pe săptămână." },
  { emoji: "💧", name: "Hidratare & fibre", desc: "Apa și legumele cresc sațietatea și reduc aportul total." },
];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ---- sliders ----------------------------------------------------------
function updateOutput(input) {
  const out = document.querySelector(`.slider-val[data-for="${input.name}"]`);
  if (out) out.textContent = input.value;
}

function fillGoalsForm(goals) {
  const form = $("#goals-form");
  MACROS.forEach((m) => {
    const input = form.elements[m.key];
    if (!input) return;
    input.value = clamp(Math.round(goals[m.key] || 0), Number(input.min), Number(input.max));
    updateOutput(input);
  });
}

async function saveGoals(e) {
  e.preventDefault();
  const form = $("#goals-form");
  const payload = {};
  MACROS.forEach((m) => {
    payload[m.key] = parseFloat(form.elements[m.key].value) || 0;
  });
  await api("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const status = $("#goals-status");
  status.textContent = "Salvat ✓";
  setTimeout(() => (status.textContent = ""), 1500);
}

// ---- calculator -------------------------------------------------------
function updateFigure() {
  const val = $("#calc-form").elements.activity.value;
  const a = ACTIVITY[val] || ACTIVITY["1.55"];
  $("#figure-body").textContent = a.emoji;
  $("#figure-label").textContent = a.label;
  let bars = "";
  for (let i = 1; i <= 5; i++) bars += `<span class="fbar ${i <= a.level ? "on" : ""}"></span>`;
  $("#figure-bars").innerHTML = bars;
}

function readProfile() {
  const f = $("#calc-form");
  return {
    gender: f.elements.gender.value,
    age: parseFloat(f.elements.age.value) || 0,
    height: parseFloat(f.elements.height.value) || 0,
    weight: parseFloat(f.elements.weight.value) || 0,
    steps: parseFloat(f.elements.steps.value) || 0,
    activity: parseFloat(f.elements.activity.value) || 1.2,
    goal: f.elements.goal.value,
  };
}

function computePlan(p) {
  // Mifflin-St Jeor BMR
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  const bmr = p.gender === "female" ? base - 161 : base + 5;
  // Daily steps add NEAT calories on top of the training activity factor.
  const stepCals = Math.round(p.steps * 0.0005 * p.weight);
  const tdee = bmr * p.activity + stepCals;

  const plan = GOAL_PLANS[p.goal] || GOAL_PLANS.maintain;
  const calories = Math.round(tdee * plan.calFactor);

  const protein = Math.round(plan.proteinPerKg * p.weight);
  const fat = Math.round(plan.fatPerKg * p.weight);
  const carbsKcal = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(carbsKcal / 4));
  const fiber = Math.round((calories / 1000) * 14);

  return {
    bmr: Math.round(bmr),
    stepCals,
    tdee: Math.round(tdee),
    calories,
    protein,
    carbs,
    fat,
    fiber,
  };
}

function calcSubmit(e) {
  e.preventDefault();
  const p = readProfile();
  if (p.weight <= 0 || p.height <= 0 || p.age <= 0) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));

  const plan = computePlan(p);
  fillGoalsForm(plan);

  const goalLabel = (GOAL_PLANS[p.goal] || GOAL_PLANS.maintain).label;
  const box = $("#calc-result");
  box.hidden = false;
  box.innerHTML = `
    <div>Metabolism bazal (BMR): <b>${plan.bmr}</b> kcal · Consum zilnic (TDEE): <b>${plan.tdee}</b> kcal</div>
    <div>👟 ${p.steps} pași/zi → <b>+${plan.stepCals}</b> kcal incluse în TDEE</div>
    <div>Plan <b>${goalLabel}</b>: 🔥 <b>${plan.calories}</b> kcal ·
      🥩 <b>${plan.protein}</b> g · 🍞 <b>${plan.carbs}</b> g ·
      🧈 <b>${plan.fat}</b> g · 🌾 <b>${plan.fiber}</b> g</div>
    <div class="muted">Valorile au fost trecute în slidere. Ajustează-le și apasă „Salvează obiective”.</div>`;
}

// ---- diets ------------------------------------------------------------
function currentCalories() {
  const c = parseFloat($("#goals-form").elements.calories.value) || 0;
  return c > 0 ? c : 2000;
}

function applyDiet(d) {
  const cal = currentCalories();
  const protein = Math.round((cal * d.protein) / 100 / 4);
  const fat = Math.round((cal * d.fat) / 100 / 9);
  const carbs = Math.round((cal * d.carb) / 100 / 4);
  const fiber = Math.round((cal / 1000) * 14);
  fillGoalsForm({ calories: cal, protein, carbs, fat, fiber });
  document.querySelectorAll(".diet-tile").forEach((t) => {
    t.classList.toggle("active", t.dataset.id === d.id);
  });
}

function renderDiets() {
  const box = $("#diet-list");
  box.innerHTML = DIETS.map(
    (d) => `
    <button type="button" class="diet-tile" data-id="${d.id}">
      <span class="diet-emoji">${d.emoji}</span>
      <span class="diet-name">${d.name}</span>
      <span class="diet-split">${d.carb} / ${d.protein} / ${d.fat} %</span>
      <span class="diet-desc">${d.desc}</span>
    </button>`
  ).join("");
  box.querySelectorAll(".diet-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = DIETS.find((x) => x.id === btn.dataset.id);
      if (d) applyDiet(d);
    });
  });
}

function renderMethods() {
  $("#method-list").innerHTML = METHODS.map(
    (m) => `
    <div class="method-item">
      <span class="method-emoji">${m.emoji}</span>
      <div><b>${m.name}</b><div class="muted">${m.desc}</div></div>
    </div>`
  ).join("");
}

function loadProfile() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
  } catch (err) {
    saved = null;
  }
  if (!saved) return;
  const f = $("#calc-form");
  if (saved.gender) f.elements.gender.value = saved.gender;
  if (saved.age) f.elements.age.value = saved.age;
  if (saved.height) f.elements.height.value = saved.height;
  if (saved.weight) f.elements.weight.value = saved.weight;
  if (saved.steps != null) f.elements.steps.value = saved.steps;
  if (saved.activity) f.elements.activity.value = saved.activity;
  if (saved.goal) f.elements.goal.value = saved.goal;
}

async function prefillWeight() {
  // If no saved profile yet, seed the weight from the latest recorded value.
  if (localStorage.getItem(PROFILE_KEY)) return;
  try {
    const hist = await api("/api/history?limit=366");
    const withWeight = hist.days.find((d) => d.weight != null);
    if (withWeight) $("#calc-form").elements.weight.value = withWeight.weight;
  } catch (err) {
    /* ignore */
  }
}

async function init() {
  await initCommon(() => {});
  loadProfile();
  await prefillWeight();
  updateFigure();
  renderDiets();
  renderMethods();

  const goals = await api("/api/goals");
  fillGoalsForm(goals);

  $("#goals-form").querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => updateOutput(input));
  });
  $("#goals-form").addEventListener("submit", saveGoals);
  $("#calc-form").addEventListener("submit", calcSubmit);
  $("#calc-form").elements.activity.addEventListener("change", updateFigure);
}

init();
