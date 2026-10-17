'use strict';

// Plates owned, per size, in kg. Only matched pairs are usable, so an odd plate is ignored.
// This inventory is what the work weight gets rounded onto.
const PLATES = [
  { kg: 25, count: 2 },
  { kg: 20, count: 2 },
  { kg: 10, count: 4 },
  { kg: 5, count: 4 },
  { kg: 2.5, count: 4 },
  { kg: 1.25, count: 4 },
  { kg: 0.5, count: 2 },
];

// Warm-ups skip the 0.5 kg pair: a 2.5 kg grid is precise enough and easier to load.
const WARMUP_PLATES = PLATES.filter((p) => p.kg >= 1.25);

// The 25s stay in the rack until the bar is heavier than this; lighter totals load from the 20s down.
const BIG_PLATE = 25;
const BIG_PLATE_MIN_TOTAL = 117.5;

// Per-lift settings. All lifts share the same values for now; change them here to vary a lift.
const BASE = {
  bar: 20,               // bar weight
  startWeight: 20,       // weight of the first (unweighted) sets
  startSets: 2,          // number of sets at startWeight
  startReps: 5,          // reps per set at startWeight
  minWarmup: 0,          // calculated warm-ups at or below this weight are dropped
  lastPct: 0.925,        // aim for the last warm-up single ~7.5% below the work weight...
  lastMaxPct: 0.95,      // ...but never above 95% of it
  jumpPct: 0.175,        // aim for jumps of ~17.5% of the work weight
  repPattern: [5, 3],    // reps of the first weighted sets
  optionalReps: [3],     // extra sets used only when another single still comes before the last warm-up
};

const LIFTS = {
  squat: { ...BASE, label: 'Squat' },
  press: { ...BASE, label: 'Press' },
  // Deadlifts come third in the session, so they need less warm-up, and they are never pulled
  // with an empty bar: one set of 5 at 40 kg, then the calculated weights above 44 kg at 3 and
  // 2 reps, then singles as usual.
  deadlift: {
    ...BASE,
    label: 'Deadlift',
    startWeight: 40,
    startSets: 1,
    minWarmup: 44,
    repPattern: [3, 2],
    optionalReps: [],
  },
};

// Weights are compared as whole hundredths of a kg, so nothing depends on float equality.
const H = (kg) => Math.round(kg * 100);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// Every total the plates can build on the given bar, ascending, each with the plates for one side:
// { h, total, perSide, plates: [{ kg, n }] }. The plates are listed heaviest first.
function buildCombos(bar, plates) {
  const sizes = plates
    .map((p) => ({ kg: p.kg, h: H(p.kg), pairs: Math.floor(p.count / 2) }))
    .filter((p) => p.pairs > 0 && p.h > 0)
    .sort((a, b) => b.h - a.h);

  // One side's load (in hundredths) -> how many of each size make it, parallel to `sizes`.
  const used = (counts) => counts.reduce((a, b) => a + b, 0);
  let combos = new Map([[0, []]]);
  for (const size of sizes) {
    const next = new Map();
    for (const [load, counts] of combos) {
      for (let n = 0; n <= size.pairs; n++) {
        const candidate = [...counts, n];
        const prev = next.get(load + n * size.h);
        // Several combinations can reach the same weight; keep the one using the fewest plates.
        if (!prev || used(candidate) < used(prev)) next.set(load + n * size.h, candidate);
      }
    }
    combos = next;
  }

  return [...combos]
    .sort((a, b) => a[0] - b[0])
    .map(([load, counts]) => ({
      h: H(bar) + 2 * load,
      total: (H(bar) + 2 * load) / 100,
      perSide: load / 100,
      plates: counts.map((n, i) => ({ kg: sizes[i].kg, n })).filter((p) => p.n > 0),
    }));
}

// The same totals as buildCombos, but light ones are built without the 25s even when a 25 would mean
// fewer plates: below BIG_PLATE_MIN_TOTAL every total is reachable from the 20s down anyway.
function buildLoadable(bar, plates) {
  const all = buildCombos(bar, plates);
  const small = new Map(buildCombos(bar, plates.filter((p) => p.kg < BIG_PLATE)).map((e) => [e.h, e]));
  return all.map((e) => (e.h <= H(BIG_PLATE_MIN_TOTAL) && small.has(e.h) ? small.get(e.h) : e));
}

// kind 'all' is the work-weight table; 'warmup' is the coarser one every other set is rounded onto.
const loadableCaches = { all: new Map(), warmup: new Map() };
function loadableFor(bar, kind = 'all') {
  const cache = loadableCaches[kind];
  if (!cache.has(bar)) cache.set(bar, buildLoadable(bar, kind === 'warmup' ? WARMUP_PLATES : PLATES));
  return cache.get(bar);
}

// Smallest index at or above kg; the heaviest index when kg is above everything loadable.
function ceilIndex(table, kg) {
  const h = H(kg);
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid].h >= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// Largest index at or below kg; index 0 when kg is below the bar.
function floorIndex(table, kg) {
  const h = H(kg);
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (table[mid].h <= h) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function nearestIndex(table, kg) {
  const i = ceilIndex(table, kg);
  if (i === 0) return 0;
  return table[i].h - H(kg) <= H(kg) - table[i - 1].h ? i : i - 1;
}

function repsFor(index, count, cfg) {
  if (index === count - 1) return 1; // the last warm-up is always a single
  if (index < cfg.repPattern.length) return cfg.repPattern[index];
  const optional = index - cfg.repPattern.length;
  if (optional < cfg.optionalReps.length && index < count - 2) return cfg.optionalReps[optional];
  return 1;
}

// Returns { work, rounded, capped, maxTotal, sets: [{ total, perSide, plates, reps, kind }] },
// or null for invalid input. Every weight is one the plates can actually build.
function computeWarmups(liftKey, target) {
  const cfg = LIFTS[liftKey];
  if (!cfg || !Number.isFinite(target) || target < cfg.bar) return null;

  // The work weight is rounded onto every plate there is; everything before it onto the coarse table.
  const table = loadableFor(cfg.bar);
  const warm = loadableFor(cfg.bar, 'warmup');
  const maxTotal = table[table.length - 1].total;
  const capped = H(target) > H(maxTotal);
  const workIdx = capped ? table.length - 1 : ceilIndex(table, target);
  const work = table[workIdx].total;
  // Jumps are always spaced from the bar, even for a lift whose first sets start above it.
  const barIdx = Math.min(ceilIndex(warm, cfg.bar), floorIndex(warm, work));
  const startIdx = Math.min(ceilIndex(warm, cfg.startWeight), floorIndex(warm, work));
  // The heaviest warm-up allowed: the last coarse weight below the work weight.
  let topIdx = floorIndex(warm, work);
  if (warm[topIdx].h >= H(work)) topIdx -= 1;

  const set = (entry, reps, kind) => ({
    total: entry.total, perSide: entry.perSide, plates: entry.plates, reps, kind,
  });

  const sets = [];
  for (let i = 0; i < cfg.startSets; i++) sets.push(set(warm[startIdx], cfg.startReps, 'start'));

  // When even the last warm-up lands on the bar, nothing worth loading fits before the work set.
  const lastIdx = Math.min(
    nearestIndex(warm, work * cfg.lastPct),
    floorIndex(warm, work * cfg.lastMaxPct),
    topIdx,
  );

  if (lastIdx > barIdx) {
    const distance = warm[lastIdx].total - warm[barIdx].total;
    const jumps = clamp(Math.round(distance / (work * cfg.jumpPct)), 1, lastIdx - barIdx);
    const step = distance / jumps;

    // Plan backwards from the last warm-up, rounding each weight up onto a loadable one. Two
    // targets can round onto the same weight, so collect indices in a set. Anything at or below
    // minWarmup is dropped — it sits too close to the first sets to be worth loading.
    const weighted = new Set();
    for (let i = 0; i < jumps; i++) {
      const idx = ceilIndex(warm, warm[lastIdx].total - i * step);
      if (idx > barIdx && idx <= lastIdx && warm[idx].h > H(cfg.minWarmup)) weighted.add(idx);
    }

    const ordered = [...weighted].sort((a, b) => a - b);
    ordered.forEach((idx, i) => sets.push(set(warm[idx], repsFor(i, ordered.length, cfg), 'warmup')));
  }

  sets.push(set(table[workIdx], null, 'work'));
  return { work, rounded: H(work) !== H(target), capped, maxTotal, sets };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PLATES, LIFTS, computeWarmups, loadableFor };
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
  const platesText = (plates) => plates.flatMap((p) => Array(p.n).fill(fmt(p.kg))).join(' + ');

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

  function sideCell(s) {
    const td = document.createElement('td');
    td.append(document.createTextNode(fmt(s.perSide)));
    // A lone plate already reads as the per-side weight, so listing it again adds nothing.
    const redundant = s.plates.length === 1 && s.plates[0].n === 1;
    if (s.plates.length && !redundant) {
      const span = document.createElement('span');
      span.className = 'plates';
      span.textContent = platesText(s.plates);
      td.append(span);
    }
    return td;
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
    if (result.capped) {
      note.textContent = `Your plates max out at ${fmt(result.maxTotal)} kg — using that as the work weight.`;
    } else if (result.rounded) {
      note.textContent = `Work weight rounded up to ${fmt(result.work)} kg (the nearest weight your plates can make).`;
    } else {
      note.textContent = '';
    }

    for (const s of result.sets) {
      const tr = document.createElement('tr');
      tr.className = s.kind;

      const total = document.createElement('td');
      total.textContent = fmt(s.total);
      const reps = document.createElement('td');
      reps.textContent = s.kind === 'work' ? 'Work' : `× ${s.reps}`;

      tr.append(total, sideCell(s), reps);
      tbody.append(tr);
    }
  }

  load();
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}
