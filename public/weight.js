"use strict";

// Weight page logic (greutate.html). Depends on common.js.

function renderWeightHistory(historyRows) {
  const box = $("#weight-history");
  const rows = historyRows.filter((r) => r.weight != null); // newest-first
  if (!rows.length) {
    box.innerHTML = '<div class="empty">⚖️ Nicio greutate înregistrată încă.</div>';
    return;
  }
  box.innerHTML = rows
    .map((r, i) => {
      const prev = rows[i + 1]; // next older entry
      let delta = "";
      if (prev) {
        const d = r.weight - prev.weight;
        const sign = d > 0 ? "+" : "";
        const cls = d > 0 ? "up" : d < 0 ? "down" : "";
        delta = `<span class="wt-delta ${cls}">${sign}${fmt(d)} kg</span>`;
      }
      return `<div class="hist-row" data-date="${r.date}">
        <span class="date">${r.date}</span>
        <span class="kcal">${fmt(r.weight)} kg</span>
        ${delta || '<span class="wt-delta"></span>'}
      </div>`;
    })
    .join("");

  box.querySelectorAll(".hist-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.date = row.dataset.date;
      $("#date-input").value = state.date;
      loadDay();
    });
  });
}

function renderWeightChart(historyRows) {
  const canvas = $("#weight-chart");
  const emptyMsg = $("#weight-chart-empty");
  const trendLabel = $("#weight-trend");

  // history is newest-first; keep only days with a weight, oldest-first
  const points = historyRows
    .filter((r) => r.weight != null)
    .map((r) => ({ date: r.date, weight: Number(r.weight) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    trendLabel.textContent = "";
    return;
  }
  canvas.hidden = false;
  emptyMsg.hidden = true;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 20, right: 18, bottom: 34, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const css = getComputedStyle(document.documentElement);
  const cText = css.getPropertyValue("--muted").trim() || "#8b98a5";
  const cBorder = css.getPropertyValue("--border").trim() || "#2b3542";
  const cAccent = css.getPropertyValue("--accent").trim() || "#4ade80";
  const cWarn = css.getPropertyValue("--warn").trim() || "#f59e0b";

  ctx.clearRect(0, 0, W, H);

  const weights = points.map((p) => p.weight);
  let minW = Math.min(...weights);
  let maxW = Math.max(...weights);
  if (minW === maxW) {
    minW -= 1;
    maxW += 1;
  }
  const margin = (maxW - minW) * 0.15;
  minW -= margin;
  maxW += margin;

  const n = points.length;
  const xAt = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (w) => pad.top + (1 - (w - minW) / (maxW - minW)) * plotH;

  // grid + y labels
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = cText;
  ctx.strokeStyle = cBorder;
  ctx.lineWidth = 1;
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const w = minW + (t / ticks) * (maxW - minW);
    const y = yAt(w);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(w.toFixed(1), pad.left - 6, y);
  }

  // x labels (first, middle, last)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelIdx = n <= 3 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  labelIdx.forEach((i) => {
    const d = points[i].date.slice(5); // MM-DD
    ctx.fillText(d, xAt(i), H - pad.bottom + 8);
  });

  // trend line (least squares over index)
  const xs = points.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = weights.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (weights[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  ctx.strokeStyle = cWarn;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(intercept));
  ctx.lineTo(xAt(n - 1), yAt(intercept + slope * (n - 1)));
  ctx.stroke();
  ctx.setLineDash([]);

  // weight line
  ctx.strokeStyle = cAccent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.weight);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = cAccent;
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(p.weight), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // trend summary
  const totalChange = points[n - 1].weight - points[0].weight;
  const arrow = totalChange > 0.05 ? "↑" : totalChange < -0.05 ? "↓" : "→";
  const perDay = slope;
  const dir = perDay > 0.01 ? "în creștere" : perDay < -0.01 ? "în scădere" : "stabilă";
  trendLabel.textContent = `${arrow} ${fmt(Math.abs(totalChange))} kg total · tendință ${dir} (${fmt(
    perDay
  )} kg/zi)`;
}

async function loadDay() {
  const day = await api(`/api/day?date=${state.date}`);
  $("#weight-input").value = day.weight != null ? day.weight : "";
  loadHistory();
}

async function loadHistory() {
  const hist = await api("/api/history?limit=30");
  renderWeightChart(hist.days);
  renderWeightHistory(hist.days);
}

async function saveWeight(e) {
  e.preventDefault();
  const status = $("#weight-status");
  const raw = $("#weight-input").value.trim().replace(",", ".");
  const weight = parseFloat(raw);
  if (Number.isNaN(weight) || weight <= 0) {
    status.textContent = "Introdu o greutate validă";
    return;
  }
  await api("/api/weight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight, date: state.date }),
  });
  status.textContent = "Salvat ✓";
  setTimeout(() => (status.textContent = ""), 1500);
  loadHistory();
}

async function init() {
  await initCommon(loadDay);
  $("#weight-form").addEventListener("submit", saveWeight);
  loadDay();
}

init();
