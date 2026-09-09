// Personal-record detection and record tables. Pure functions only — no DOM
// or IndexedDB — so this module is unit-testable under Node.

import { LEVEL_TYPES } from './importer.js';

// Set-numbered exercises (level types whose level is the set number, i.e.
// levelKind !== 'resistance') are judged per workout rather than per set
// number. A workout is a run of sets whose set number keeps climbing: a set
// number that doesn't go up — or a new date — starts a fresh workout, so
// "set 1, set 2, set 1, set 2, set 3" on one day is two workouts (2 sets,
// then 3 sets) that each count independently.
export function splitWorkouts(sortedSets) {
  const workouts = [];
  let cur = null, prevLevel = Infinity, prevDate = null;
  for (const s of sortedSets) {
    const lvl = s.level || 0;
    if (!cur || s.date !== prevDate || lvl <= prevLevel) { cur = []; workouts.push(cur); }
    cur.push(s);
    prevLevel = lvl;
    prevDate = s.date;
  }
  return workouts;
}

const levelValueOf = type => (type === 'level_time' ? s => s.time : s => s.reps);

// A workout's value for every set count: thresholds[n-1] is the n-th highest
// value logged in it, i.e. the largest threshold that at least n of its sets
// reached. 10, 8, 12 reps → 1 set: 12, 2 sets: 10, 3 sets: 8 — always
// monotonically decreasing.
function workoutThresholds(sets, valueOf) {
  return sets.map(valueOf).filter(v => v > 0).sort((a, b) => b - a);
}

// PR detection. Walk the exercise's sets in chronological order; a strength
// set is a PR when its weight beats every earlier weight lifted for the same
// or more reps ("you've never lifted this much for this many reps"). Cardio:
// longest distance ever (or longest duration for distance-less sets). The
// very first record for an exercise never counts.
//
// levelKind only matters for level types: 'resistance' compares within a
// level, anything else treats the level as a set number (see splitWorkouts).
export function computePRIds(sortedSets, type, levelKind) {
  const ids = new Set();
  if (type === 'distance_time') {
    let bestDist = 0, bestTime = 0;
    for (const s of sortedSets) {
      if (s.distance > 0) {
        if (bestDist > 0 && s.distance > bestDist) ids.add(s.id);
        bestDist = Math.max(bestDist, s.distance);
      } else if (s.time > 0) {
        if (bestTime > 0 && s.time > bestTime) ids.add(s.id);
        bestTime = Math.max(bestTime, s.time);
      }
    }
    return ids;
  }
  // Set-numbered: a set is a PR when it lifts its workout's threshold for some
  // set count above every earlier workout's (including this workout's own
  // earlier sets). Logging 12 after 10, 8 raises the 1-set threshold to 12 and
  // the 2-set one to 10, so it's a PR if either beats the standing record.
  if (LEVEL_TYPES.has(type) && levelKind !== 'resistance') {
    const valueOf = levelValueOf(type);
    const best = []; // best[n-1] -> best n-set threshold so far
    for (const w of splitWorkouts(sortedSets)) {
      const soFar = [];
      for (const s of w) {
        soFar.push(s);
        if (!(valueOf(s) > 0)) continue;
        let pr = false;
        workoutThresholds(soFar, valueOf).forEach((v, i) => {
          if (best[i] > 0 && v > best[i]) pr = true;
          if (!(best[i] >= v)) best[i] = v;
        });
        if (pr) ids.add(s.id);
      }
    }
    return ids;
  }
  // Resistance levels: compare only within the same level — 20 reps on band 3
  // says nothing about your band-1 record.
  if (LEVEL_TYPES.has(type)) {
    const bestByLevel = new Map();
    for (const s of sortedSets) {
      const v = type === 'level_reps' ? s.reps : s.time;
      if (!(v > 0)) continue;
      const lvl = s.level || 0;
      const prev = bestByLevel.get(lvl) || 0;
      if (prev > 0 && v > prev) ids.add(s.id);
      if (v > prev) bestByLevel.set(lvl, v);
    }
    return ids;
  }
  const bestByReps = new Map();
  for (const s of sortedSets) {
    if (!(s.weight > 0) || !(s.reps > 0)) continue;
    let prev = 0;
    for (const [r, w] of bestByReps) if (r >= s.reps && w > prev) prev = w;
    if (prev > 0 && s.weight > prev + 1e-9) ids.add(s.id);
    if (s.weight > (bestByReps.get(s.reps) || 0)) bestByReps.set(s.reps, s.weight);
  }
  return ids;
}

// Best weight per rep count, for the Records tab. Every rep count ever logged
// gets a row — a 15-rep or 50-rep best is as much a record as a 5-rep one,
// and every set that earned a 🏆 in History must be reflected here.
//
// A set counts toward its own rep count and every lower one: 100 kg × 10
// proves you can do 100 kg × 9, so the 9-rep row never shows less than the
// 10-rep row. Ties go to whichever set achieved the weight first. This
// implication is why weight×reps carries records downward — cardio has no
// rep dimension, resistance levels don't compare across levels (the app
// can't know a band's numbering direction), and set-numbered exercises have
// their own per-workout table (setCountRecords).
export function repRecords(sets) {
  const exact = new Map(); // reps -> { s: earliest heaviest set at exactly reps, i: chrono index }
  let i = 0;
  for (const s of sets) {
    if (!(s.reps >= 1)) continue;
    const cur = exact.get(s.reps);
    if (!cur || s.weight > cur.s.weight) exact.set(s.reps, { s, i });
    i++;
  }
  // Walk rep counts high→low, carrying the record down so each row holds the
  // heaviest set done for that many reps or more.
  const best = new Map(); // reps -> best set
  let carry = null;
  for (const r of [...exact.keys()].sort((a, b) => b - a)) {
    const own = exact.get(r);
    if (!carry || own.s.weight > carry.s.weight ||
        (own.s.weight === carry.s.weight && own.i < carry.i)) carry = own;
    best.set(r, carry.s);
  }
  return best;
}

// Records for set-numbered exercises, for the Records tab: the best value
// (reps, or time for level_time) achieved by n sets in a single workout, for
// every n up to the longest workout. Each workout counts independently —
// 10, 8, 12 gives 1 set: 12, 2 sets: 10, 3 sets: 8 — and the table is the
// max of those per n, so it's monotonically decreasing too. Ties go to the
// earliest workout. Returns Map n -> { value, date, sets } where sets is the
// workout that holds the record.
export function setCountRecords(sortedSets, type) {
  const valueOf = levelValueOf(type);
  const best = new Map();
  for (const w of splitWorkouts(sortedSets)) {
    workoutThresholds(w, valueOf).forEach((v, i) => {
      const n = i + 1;
      if (!(best.get(n)?.value >= v)) best.set(n, { value: v, date: w[0].date, sets: w });
    });
  }
  return best;
}
