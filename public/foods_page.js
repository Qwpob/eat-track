"use strict";

// Foods page logic (alimente.html). Lets the user add products to the local
// database so the meal parser recognizes them. Depends on common.js.

function renderFoods(foods) {
  const box = $("#food-list");
  if (!foods.length) {
    box.innerHTML = '<div class="empty">🥫 Niciun produs adăugat încă.</div>';
    return;
  }
  box.innerHTML = foods
    .map((f) => {
      const macros = MACROS.map(
        (m) => `<span class="food-macro">${m.emoji} ${fmt(f[m.key])}${
          m.key === "calories" ? "" : " g"
        }</span>`
      ).join("");
      return `<div class="food-row">
        <div class="food-row-main">
          <span class="food-row-name">${escapeHtml(f.name)}</span>
          <span class="hint">/ 100 g</span>
        </div>
        <div class="food-row-macros">${macros}</div>
        <button class="del" type="button" data-name="${escapeHtml(f.name)}">🗑️</button>
      </div>`;
    })
    .join("");

  box.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", () => deleteFood(btn.dataset.name));
  });
}

async function loadFoods() {
  const res = await api("/api/foods");
  renderFoods(res.foods || []);
}

async function saveFood(e) {
  e.preventDefault();
  const status = $("#food-status");
  const name = $("#food-name").value.trim();
  const calories = parseFloat($("#food-calories").value.replace(",", "."));
  if (!name || Number.isNaN(calories)) {
    status.textContent = "Completează numele și caloriile.";
    return;
  }
  const num = (id) => parseFloat($(id).value.replace(",", ".")) || 0;
  const res = await api("/api/foods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      calories,
      protein: num("#food-protein"),
      carbs: num("#food-carbs"),
      fat: num("#food-fat"),
      fiber: num("#food-fiber"),
    }),
  });
  if (res.error) {
    status.textContent = "Nu am putut salva produsul.";
    return;
  }
  $("#food-form").reset();
  $("#food-code").value = "";
  status.textContent = "Salvat ✓";
  setTimeout(() => (status.textContent = ""), 1500);
  renderFoods(res.foods || []);
}

async function deleteFood(name) {
  const res = await api(`/api/foods?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  renderFoods(res.foods || []);
}

async function lookupFoodCode() {
  const status = $("#food-lookup-status");
  const code = $("#food-code").value.replace(/\D/g, "");
  if (!code) {
    status.textContent = "Scrie un cod de bare.";
    return;
  }
  status.textContent = `Caut produsul (${code})…`;
  try {
    const res = await api(`/api/barcode?code=${encodeURIComponent(code)}`);
    if (res.error) {
      status.textContent = "Produsul nu a fost găsit. Completează manual valorile.";
      return;
    }
    $("#food-name").value = res.name || "";
    $("#food-calories").value = res.calories != null ? res.calories : "";
    $("#food-protein").value = res.protein != null ? res.protein : "";
    $("#food-carbs").value = res.carbs != null ? res.carbs : "";
    $("#food-fat").value = res.fat != null ? res.fat : "";
    $("#food-fiber").value = res.fiber != null ? res.fiber : "";
    status.textContent = "Găsit ✓ — verifică valorile și salvează.";
  } catch (e) {
    status.textContent = "Eroare la căutare. Verifică conexiunea la internet.";
  }
}

async function init() {
  await initCommon(loadFoods);
  $("#food-form").addEventListener("submit", saveFood);
  $("#food-lookup").addEventListener("click", lookupFoodCode);
  $("#food-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupFoodCode();
    }
  });
  loadFoods();
}

init();
