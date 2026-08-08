// Routine completion + streak ("momentum") logic. Pure functions over the
// sets store so stats are always derived from history — editing, deleting or
// importing sets retroactively updates completions and streaks for free.

// A streak survives gaps of up to this many days between completions.
export const MAX_GAP_DAYS = 7;

// The glow keeps intensifying until the streak reaches this length.
export const GLOW_CAP = 50;

// Per-exercise set target used for new routine entries and for legacy
// routines saved before targets existed.
export const DEFAULT_SETS = 3;

// A day scoring at least this fraction of the routine's target sets counts
// as a partial completion; hitting every target is a full completion.
export const PARTIAL_THRESHOLD = 0.8;

// Routines store items: [{exerciseId, sets}]. Normalize records written
// before set targets existed (bare exerciseIds arrays, e.g. restored from an
// old JSON backup).
export function routineItems(routine) {
  if (routine.items) return routine.items;
  return (routine.exerciseIds || []).map(id => ({ exerciseId: id, sets: DEFAULT_SETS }));
}

const targetOf = it => Math.max(1, it.sets || 0);

// Whole days between two 'YYYY-MM-DD' strings (parsed as UTC, so exact).
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

// Sets logged toward the routine's targets on one day's sets: each exercise
// contributes at most its target. Returns {done, want}.
export function dayProgress(items, daySets) {
  const target = new Map();
  for (const it of items) {
    target.set(it.exerciseId, (target.get(it.exerciseId) || 0) + targetOf(it));
  }
  const counts = new Map();
  for (const s of daySets) {
    if (target.has(s.exerciseId)) counts.set(s.exerciseId, (counts.get(s.exerciseId) || 0) + 1);
  }
  let done = 0, want = 0;
  for (const [exId, t] of target) {
    want += t;
    done += Math.min(counts.get(exId) || 0, t);
  }
  return { done, want };
}

// Every day that reached PARTIAL_THRESHOLD of the routine's target sets.
// Returns [{date, done, want, full}] ascending by date.
export function completions(items, sets) {
  if (!items.length) return [];
  const ids = new Set(items.map(it => it.exerciseId));
  const byDate = new Map();
  for (const s of sets) {
    if (!ids.has(s.exerciseId)) continue;
    let day = byDate.get(s.date);
    if (!day) byDate.set(s.date, day = []);
    day.push(s);
  }
  const out = [];
  for (const [date, daySets] of byDate) {
    const { done, want } = dayProgress(items, daySets);
    if (done / want >= PARTIAL_THRESHOLD) out.push({ date, done, want, full: done === want });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Length of the completion chain ending at the most recent completion, where
// consecutive completions are at most MAX_GAP_DAYS apart. The streak is dead
// (0) once the last completion is itself more than MAX_GAP_DAYS ago.
export function currentStreak(dates, today) {
  if (!dates.length || daysBetween(dates[dates.length - 1], today) > MAX_GAP_DAYS) return 0;
  let streak = 1;
  for (let i = dates.length - 2; i >= 0; i--) {
    if (daysBetween(dates[i], dates[i + 1]) > MAX_GAP_DAYS) break;
    streak++;
  }
  return streak;
}

// {total, full, partial, streak, lastDate}. Partial completions count toward
// the streak too — they kept the habit alive.
export function routineStats(items, sets, today) {
  const comps = completions(items, sets);
  const full = comps.filter(c => c.full).length;
  return {
    total: comps.length,
    full,
    partial: comps.length - full,
    streak: currentStreak(comps.map(c => c.date), today),
    lastDate: comps.length ? comps[comps.length - 1].date : null,
  };
}

// Glow intensity 0..1, saturating at GLOW_CAP.
export function glowLevel(streak) {
  return Math.min(Math.max(streak, 0), GLOW_CAP) / GLOW_CAP;
}
