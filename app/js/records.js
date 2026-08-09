// Personal-record detection and record tables. Pure functions only — no DOM
// or IndexedDB — so this module is unit-testable under Node.

import { LEVEL_TYPES } from './importer.js';

// PR detection. Walk the exercise's sets in chronological order; a strength
// set is a PR when its weight beats every earlier weight lifted for the same
// or more reps ("you've never lifted this much for this many reps"). Cardio:
// longest distance ever (or longest duration for distance-less sets). The
// very first record for an exercise never counts.
export function computePRIds(sortedSets, type) {
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
  // Level types: compare only within the same level — 20 reps on your 3rd
  // set (or on band 3) says nothing about your 1st-set record.
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
export function repRecords(sets) {
  const best = new Map(); // reps -> best set
  for (const s of sets) {
    if (!(s.reps >= 1)) continue;
    const cur = best.get(s.reps);
    if (!cur || s.weight > cur.weight) best.set(s.reps, s);
  }
  return best;
}
