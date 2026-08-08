// Routine completion + streak ("momentum") logic. Pure functions over the
// sets store so stats are always derived from history — editing, deleting or
// importing sets retroactively updates completions and streaks for free.

// A streak survives gaps of up to this many days between completions.
export const MAX_GAP_DAYS = 7;

// The glow keeps intensifying until the streak reaches this length.
export const GLOW_CAP = 50;

// Whole days between two 'YYYY-MM-DD' strings (parsed as UTC, so exact).
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

// A routine counts as completed on a date when every one of its exercises has
// at least one set logged that day. Returns completion dates ascending.
export function completionDates(exerciseIds, sets) {
  const want = new Set(exerciseIds);
  if (!want.size) return [];
  const byDate = new Map(); // date -> Set of the routine's exerciseIds seen
  for (const s of sets) {
    if (!want.has(s.exerciseId)) continue;
    let seen = byDate.get(s.date);
    if (!seen) byDate.set(s.date, seen = new Set());
    seen.add(s.exerciseId);
  }
  return [...byDate.entries()]
    .filter(([, seen]) => seen.size === want.size)
    .map(([date]) => date)
    .sort();
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

export function routineStats(exerciseIds, sets, today) {
  const dates = completionDates(exerciseIds, sets);
  return {
    completions: dates.length,
    streak: currentStreak(dates, today),
    lastDate: dates.length ? dates[dates.length - 1] : null,
  };
}

// Glow intensity 0..1, saturating at GLOW_CAP.
export function glowLevel(streak) {
  return Math.min(Math.max(streak, 0), GLOW_CAP) / GLOW_CAP;
}
