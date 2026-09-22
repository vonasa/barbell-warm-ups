'use strict';

// All weights are in kg. The smallest plate is 1.25 kg, so every total is a multiple of 2.5 kg.
const INCREMENT = 2.5;
const EPS = 1e-9;

// Per-lift settings. All lifts share the same values for now; change them here to vary a lift.
const BASE = {
  bar: 20,               // bar weight
  startWeight: 20,       // weight of the first (unweighted) sets
  startSets: 2,          // number of sets at startWeight
  startReps: 5,          // reps per set at startWeight
  lastPct: 0.925,        // aim for the last warm-up single ~7.5% below the work weight...
  lastMaxPct: 0.95,      // ...but never above 95% of it
  jumpPct: 0.175,        // aim for jumps of ~17.5% of the work weight
  repPattern: [5, 3],    // reps of the first weighted sets
  optionalReps: [3],     // extra sets used only when another single still comes before the last warm-up
};

const LIFTS = {
  squat: { ...BASE, label: 'Squat' },
  press: { ...BASE, label: 'Press' },
  deadlift: { ...BASE, label: 'Deadlift' },
};

// Conversions between kg and whole 2.5 kg units, tolerant of floating-point noise.
const ceilUnits = (kg) => Math.ceil(kg / INCREMENT - EPS);
const floorUnits = (kg) => Math.floor(kg / INCREMENT + EPS);
const nearestUnits = (kg) => Math.round(kg / INCREMENT);
const toKg = (units) => units * INCREMENT;

function repsFor(index, count, cfg) {
  if (index === count - 1) return 1; // the last warm-up is always a single
  if (index < cfg.repPattern.length) return cfg.repPattern[index];
  const optional = index - cfg.repPattern.length;
  if (optional < cfg.optionalReps.length && index < count - 2) return cfg.optionalReps[optional];
  return 1;
}

// Returns { work, rounded, sets: [{ total, perSide, reps, kind }] } or null for invalid input.
function computeWarmups(liftKey, target) {
  const cfg = LIFTS[liftKey];
  if (!cfg || !Number.isFinite(target) || target < cfg.bar) return null;

  const workU = ceilUnits(target);
  const work = toKg(workU);
  const startU = ceilUnits(cfg.startWeight);
  const set = (total, reps, kind) => ({ total, perSide: (total - cfg.bar) / 2, reps, kind });

  const sets = [];
  for (let i = 0; i < cfg.startSets; i++) sets.push(set(toKg(startU), cfg.startReps, 'start'));

  if (workU > startU + 1) {
    let lastU = Math.min(nearestUnits(work * cfg.lastPct), floorUnits(work * cfg.lastMaxPct));
    lastU = Math.min(Math.max(lastU, startU + 1), workU - 1);

    const distance = lastU - startU;
    const jumps = Math.min(Math.max(Math.round(distance / (work * cfg.jumpPct / INCREMENT)), 1), distance);
    const step = Math.max(1, Math.round(distance / jumps));

    const weighted = [];
    for (let i = 0; i < jumps; i++) {
      const u = lastU - i * step;
      if (u > startU) weighted.unshift(u);
    }

    weighted.forEach((u, i) => sets.push(set(toKg(u), repsFor(i, weighted.length, cfg), 'warmup')));
  }

  sets.push(set(work, null, 'work'));
  return { work, rounded: work !== target, sets };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LIFTS, computeWarmups };
}

// ---- UI ----
if (typeof document !== 'undefined') {
  const STORAGE_KEY = 'barbell-warm-ups:v1';
  const form = document.getElementById('form');
  const weightInput = document.getElementById('weight');
  const tbody = document.getElementById('rows');
  const note = document.getElementById('note');
  const table = document.getElementById('table');

  const fmt = (kg) => String(Math.round(kg * 100) / 100);
  const selectedLift = () => form.elements.lift.value;
  const parseWeight = (s) => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && LIFTS[saved.lift]) form.elements.lift.value = saved.lift;
      if (saved && Number.isFinite(saved.weight)) weightInput.value = saved.weight;
    } catch (e) { /* storage unavailable or corrupt */ }
  }

  function save(lift, weight) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lift, weight }));
    } catch (e) { /* storage unavailable */ }
  }

  function render() {
    const lift = selectedLift();
    const weight = parseWeight(weightInput.value);
    const result = computeWarmups(lift, weight);

    tbody.replaceChildren();
    if (!result) {
      table.hidden = true;
      note.textContent = weightInput.value.trim() === ''
        ? 'Enter your work weight.'
        : `Enter a weight of at least ${LIFTS[lift].bar} kg.`;
      return;
    }

    save(lift, weight);
    table.hidden = false;
    note.textContent = result.rounded ? `Work weight rounded up to ${fmt(result.work)} kg (loadable with 1.25 kg plates).` : '';

    for (const s of result.sets) {
      const tr = document.createElement('tr');
      tr.className = s.kind;
      const cells = [fmt(s.total), fmt(s.perSide), s.kind === 'work' ? 'Work' : `× ${s.reps}`];
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      tbody.append(tr);
    }
  }

  load();
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}
