"use strict";

// Shared helpers used by both pages (Mese + Greutate).

// Register the service worker so the app is installable / works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const MACROS = [
  { key: "calories", label: "Calorii", unit: "kcal", emoji: "🔥" },
  { key: "protein", label: "Proteine", unit: "g", safe: true, emoji: "🥩" },
  { key: "carbs", label: "Carbohidrați", unit: "g", emoji: "🍞" },
  { key: "fat", label: "Grăsimi", unit: "g", emoji: "🧈" },
  { key: "fiber", label: "Fibre", unit: "g", safe: true, emoji: "🌾" },
];

const $ = (sel) => document.querySelector(sel);

const state = {
  date: new Date().toISOString().slice(0, 10),
  goals: null,
};

function fmt(n) {
  return Number(n || 0).toLocaleString("ro-RO", { maximumFractionDigits: 1 });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Sets the engine badge + wires the shared date picker. `onDateChange` runs
// whenever the user picks another day.
async function initCommon(onDateChange) {
  const cfg = await api("/api/config");
  state.date = cfg.today;

  const badge = $("#engine-badge");
  if (badge) {
    badge.hidden = false;
    const labels = { llm: "AI", online: "online", local: "local" };
    badge.textContent = labels[cfg.engine] || cfg.engine;
  }

  const dateInput = $("#date-input");
  if (dateInput) {
    dateInput.value = state.date;
    dateInput.addEventListener("change", () => {
      state.date = dateInput.value;
      onDateChange();
    });
  }
  return cfg;
}
