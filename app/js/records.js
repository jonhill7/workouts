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

// ---------------------------------------------------------------------------
// Workout Score — one number per (exercise, workout day), higher is better,
// so a day can be compared with any other day of the same exercise. Each set
// gets a set score (below); the day's sets are ranked best first and summed
// with geometrically decaying weights: 1 × best + ½ × 2nd + ¼ × 3rd + …
// So 8 + 8 reps beats 8 + 7, an extra set never lowers the Score, each extra
// set adds less than the last, and the total can't exceed 2 × the best set
// (warm-ups rank last and barely count). Set scores:
//
//   weight × reps    Epley estimated 1RM (kg). An exercise never logged
//                    with weight (bodyweight) scores by reps instead.
//   distance / time  5 km-equivalent speed (m/s): each set's time is
//                    scaled to 5 km with Riegel's race formula, so a fast
//                    short run and a slow long one compare fairly. Without
//                    any distance+time set it scores by distance, then time.
//   set # × reps     reps (or time) in one set
//   resistance level level × minutes (or level × reps) in one set, so
//                    harder levels count for more. Assumes a higher level is
//                    harder, as on machines (elliptical, bike).
//
// Returns [{ date, score }] in date order, days without a score left out.

export const EQUIV_DIST_M = 5000;
const RIEGEL_EXP = 1.06;

export function epley1RM(weightKg, reps) {
  if (!(reps > 0) || !(weightKg > 0)) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30); // Epley
}

export function riegelTime(timeSec, distM, targetM = EQUIV_DIST_M) {
  if (!(timeSec > 0) || !(distM > 0)) return 0;
  return timeSec * (targetM / distM) ** RIEGEL_EXP;
}

// How this exercise's history is scored: { mode, scoreOf }.
// mode is the Score's unit: 'e1rm' (kg), 'speed' (5K-equivalent m/s),
// 'distance' (m), 'time' (sec), 'reps', or for resistance levels
// 'levelTime' (level × minutes) / 'levelReps' (level × reps).
export function scoreInfo(sets, type, levelKind) {
  if (type === 'distance_time') {
    if (sets.some(s => s.distance > 0 && s.time > 0)) {
      return { mode: 'speed', scoreOf: s => { const t = riegelTime(s.time, s.distance); return t > 0 ? EQUIV_DIST_M / t : 0; } };
    }
    if (sets.some(s => s.distance > 0)) return { mode: 'distance', scoreOf: s => s.distance };
    return { mode: 'time', scoreOf: s => s.time };
  }
  if (LEVEL_TYPES.has(type)) {
    const valueOf = levelValueOf(type);
    const mode = type === 'level_time' ? 'time' : 'reps';
    if (levelKind !== 'resistance') return { mode, scoreOf: valueOf };
    if (type === 'level_time') return { mode: 'levelTime', scoreOf: s => ((s.level || 0) * s.time) / 60 };
    return { mode: 'levelReps', scoreOf: s => (s.level || 0) * s.reps };
  }
  if (sets.some(s => s.weight > 0 && s.reps > 0)) return { mode: 'e1rm', scoreOf: s => epley1RM(s.weight, s.reps) };
  return { mode: 'reps', scoreOf: s => s.reps };
}

export const SET_DECAY = 0.5;

// One day's Score from its sets: set scores best first, weighted 1, ½, ¼, …
export function dayScore(daySets, scoreOf) {
  return daySets.map(s => scoreOf(s) || 0).filter(v => v > 0).sort((a, b) => b - a)
    .reduce((sum, v, i) => sum + v * SET_DECAY ** i, 0);
}

export function workoutScores(sets, type, levelKind) {
  const { scoreOf } = scoreInfo(sets, type, levelKind);
  const byDate = new Map();
  for (const s of sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  return [...byDate.keys()].sort()
    .map(date => ({ date, score: dayScore(byDate.get(date), scoreOf) }))
    .filter(p => p.score > 0);
}

const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000);

// Everything the exercise-list bar needs, positions as 0–100 (% of width).
// The bar always spans BAR_SPAN × the all-time best. Normally it runs from
// 50% of the all-time best to the all-time best, so every exercise's bar
// reads the same way ("I'm at 90% of my best"). When the best recent workout
// falls too low for that, the window slides down until that workout sits
// BAR_MIN_FILL of the way along, and the all-time best goes off the right
// edge (all.off). Recent workouts below the window sit at 0.
//   fill    best score among workouts in the last `recentDays`
//   layers  positions of the 3rd-best, 2nd-best and best recent scores (by
//           score, not date; repeats when there are fewer than 3 workouts),
//           for the solid / medium / light green segments
//   ticks   one per recent workout, oldest first, with ageDays
//   year    best score of the last 365 days (off when past the right edge)
//   all     all-time best
// Returns null when there's no recent scored workout.
export const BAR_SPAN = 0.5;
export const BAR_MIN_FILL = 0.25;

export function scoreBar(scores, today, recentDays = 28) {
  const recent = scores.filter(p => dayDiff(today, p.date) <= recentDays);
  if (!recent.length) return null;
  const year = scores.filter(p => dayDiff(today, p.date) <= 365);
  const best = list => list.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
  const all = best(scores), yearBest = best(year), recentBest = best(recent);
  const span = all.score * BAR_SPAN;
  const lo = Math.min(all.score - span, recentBest.score - BAR_MIN_FILL * span);
  const hi = lo + span;
  const pos = v => Math.max(0, ((v - lo) / span) * 100);
  const yearPos = pos(yearBest.score);
  const top = recent.map(p => p.score).sort((a, b) => b - a);
  const nth = i => pos(top[Math.min(i, top.length - 1)]);
  return {
    lo, hi,
    fill: { ...recentBest, pos: pos(recentBest.score) },
    layers: [nth(2), nth(1), nth(0)],
    ticks: recent.map(p => ({ ...p, pos: pos(p.score), ageDays: dayDiff(today, p.date) })),
    year: { ...yearBest, pos: Math.min(100, yearPos), off: yearPos > 100 + 1e-9 },
    all: { ...all, pos: 100, off: all.score > hi + 1e-9 },
  };
}
