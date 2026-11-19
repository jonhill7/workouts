// FitNotes CSV parsing and normalization. Pure functions only — no DOM or
// IndexedDB — so this module is unit-testable under Node.

export const KG_PER_LB = 0.45359237;
export const M_PER_UNIT = {
  m: 1,
  km: 1000,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  yd: 0.9144,
};

// RFC-4180-ish CSV parser: quoted fields, escaped quotes, CR/LF line ends.
// Real-world hardening:
// - A quote is only special at the START of a field. Interior quotes (inch
//   marks in exercise names like `Dip (45" belt)`) are literal characters —
//   naive parsers swallow the following commas and shift every column.
// - Strips a UTF-8 BOM.
// - Auto-detects tab-delimited exports (spreadsheet re-saves).
export function parseCSV(text, delimiter) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const nl = text.indexOf('\n');
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delim = delimiter ??
    ((firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',');

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
    } else if (c === delim) {
      row.push(field); field = ''; fieldStart = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; fieldStart = true;
      rows.push(row); row = [];
    } else {
      field += c;
      fieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows.
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

// "1:23:45", "23:45", "45", or "" → seconds.
export function parseTimeToSeconds(str) {
  const s = String(str ?? '').trim();
  if (!s) return 0;
  const parts = s.split(':').map(p => parseFloat(p));
  if (parts.some(p => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function timeToString(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function num(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Parse a FitNotes "Export Workout Data" CSV. Handles both known layouts:
//   old:  Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time
//   new:  Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment
// Returns { rows, errors } where rows are normalized sets:
//   { date, exercise, category, weightKg, reps, distanceM, timeSec, comment }
export function parseFitNotesCSV(text) {
  const raw = parseCSV(text);
  const errors = [];
  if (raw.length === 0) return { rows: [], errors: ['File is empty.'] };

  const header = raw[0].map(hcell => hcell.trim().toLowerCase());
  const col = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iDate = col('date');
  const iExercise = col('exercise');
  const iCategory = col('category');
  const iReps = col('reps', 'rep');
  const iWeightUnit = col('weight unit');
  const iDistance = col('distance');
  const iDistanceUnit = col('distance unit');
  const iTime = col('time', 'duration');
  const iComment = col('comment', 'comments', 'notes');

  // Weight column may be plain "weight" or "weight (kgs)" / "weight (lbs)".
  let iWeight = -1;
  let headerWeightUnit = null;
  for (let i = 0; i < header.length; i++) {
    const m = header[i].match(/^weight(?:\s*\((kgs?|lbs?)\))?$/);
    if (m) {
      iWeight = i;
      if (m[1]) headerWeightUnit = m[1].startsWith('k') ? 'kg' : 'lbs';
      break;
    }
  }

  if (iDate === -1 || iExercise === -1) {
    return { rows: [], errors: ['Not a FitNotes export: missing "Date" or "Exercise" column in the header row.'] };
  }

  // FitNotes does not quote its CSV fields, so a comma inside an exercise
  // name (e.g. "Squat (Tempo, 3-0-3 Seconds)") splits it across columns and
  // shifts everything after it. Repair rows with surplus columns by merging
  // the surplus back into Exercise (or Comment, when that column exists),
  // choosing the merge whose Weight/Reps/Distance/Time block validates.
  const H = header.length;
  const numRe = /^\d*\.?\d*$/;
  const unitRe = /^(kgs?|lbs?)?$/i;
  const timeRe = /^[\d:.]*$/;
  const blockValid = cells => {
    const at = i => (i >= 0 && i < cells.length ? cells[i].trim() : '');
    if (iWeight !== -1 && !numRe.test(at(iWeight))) return false;
    if (iWeightUnit !== -1 && !unitRe.test(at(iWeightUnit))) return false;
    if (iReps !== -1 && !numRe.test(at(iReps))) return false;
    if (iDistance !== -1 && !numRe.test(at(iDistance))) return false;
    if (iTime !== -1 && !timeRe.test(at(iTime))) return false;
    return true;
  };
  const repairRow = line => {
    const extra = line.length - H;
    if (extra <= 0) return line;
    const candidates = [];
    const maxIntoComment = iComment !== -1 ? extra : 0;
    for (let intoExercise = extra; intoExercise >= extra - maxIntoComment; intoExercise--) {
      const out = [];
      let idx = 0;
      for (let col = 0; col < H; col++) {
        let take = 1;
        if (col === iExercise) take += intoExercise;
        if (col === iComment) take += extra - intoExercise;
        out.push(line.slice(idx, idx + take).join(','));
        idx += take;
      }
      candidates.push(out);
    }
    return candidates.find(blockValid) || candidates[0];
  };

  const rows = [];
  for (let r = 1; r < raw.length; r++) {
    const line = repairRow(raw[r]);
    const cell = i => (i >= 0 && i < line.length ? line[i].trim() : '');

    const date = cell(iDate);
    const exercise = cell(iExercise);
    if (!exercise) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Row ${r + 1}: unrecognized date "${date}" (expected YYYY-MM-DD) — skipped.`);
      continue;
    }

    let weightUnit = headerWeightUnit;
    if (iWeightUnit !== -1) {
      const u = cell(iWeightUnit).toLowerCase();
      if (u.startsWith('k')) weightUnit = 'kg';
      else if (u.startsWith('l') || u === 'lb' || u === 'lbs') weightUnit = 'lbs';
    }
    const weightRaw = num(cell(iWeight));
    const weightKg = weightUnit === 'lbs' ? weightRaw * KG_PER_LB : weightRaw;

    const distRaw = num(cell(iDistance));
    const distUnit = cell(iDistanceUnit).toLowerCase();
    const distanceM = distRaw * (M_PER_UNIT[distUnit] ?? 1000); // FitNotes defaults to km

    rows.push({
      date,
      exercise,
      category: cell(iCategory) || 'Other',
      weightKg,
      reps: Math.round(num(cell(iReps))),
      distanceM,
      timeSec: parseTimeToSeconds(cell(iTime)),
      comment: cell(iComment),
    });
  }
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Level tracking. FitNotes only records weight and distance, so users who
// wanted to track a set number ("max reps on my 2nd set of pushups") or a
// machine resistance level abused those fields as proxies — weight 2 lbs
// meaning "set 2", distance 8 m meaning "resistance 8". This app stores that
// number properly as a unit-less integer `level` on the set, via the
// `level_reps`, `level_time` and `level_distance` exercise types.
//
// An exercise's `levelFrom` names the proxy encoding its historic FitNotes
// data used. It drives three things: the one-time conversion of already-stored
// sets, the automatic conversion of rows in every future import, and the
// reverse mapping on CSV export (so exports stay FitNotes-compatible and
// round-trip losslessly).

export const LEVEL_TYPES = new Set(['level_reps', 'level_time', 'level_distance']);

// Internal storage is always kg (weight) / metres (distance); `perUnit`
// converts from storage back to the unit the level was logged in.
export const LEVEL_SOURCES = {
  weight_lbs: { label: 'Weight (lbs)', field: 'weight', unit: 'lbs', perUnit: KG_PER_LB },
  weight_kg: { label: 'Weight (kg)', field: 'weight', unit: 'kg', perUnit: 1 },
  distance_m: { label: 'Distance (m)', field: 'distance', unit: 'm', perUnit: 1 },
  distance_km: { label: 'Distance (km)', field: 'distance', unit: 'km', perUnit: 1000 },
  // Level/time machines logged as "weight = level, reps = minutes" (e.g. a
  // stationary bike at level 6 for 30 min entered as 6 lbs × 30 reps). The
  // weight becomes the level and the reps become the time. Level/Time only.
  weight_lbs_time_reps: { label: 'Weight (lbs), with time logged as Reps (minutes)', field: 'weight', unit: 'lbs',
    perUnit: KG_PER_LB, timeFrom: { field: 'reps', perUnit: 1 }, types: ['level_time'] },
  weight_kg_time_reps: { label: 'Weight (kg), with time logged as Reps (minutes)', field: 'weight', unit: 'kg',
    perUnit: 1, timeFrom: { field: 'reps', perUnit: 1 }, types: ['level_time'] },
};

// Sources that make sense for an exercise type.
export const levelSourcesFor = type =>
  Object.entries(LEVEL_SOURCES).filter(([, src]) => !src.types || src.types.includes(type));

// Raw proxy value of a set/row, in the source's logged unit (before rounding).
export function rawProxyValue(source, s) {
  const src = LEVEL_SOURCES[source];
  if (!src) return 0;
  if (src.field === 'reps') return s.reps ?? 0;
  const raw = src.field === 'weight'
    ? (s.weightKg ?? s.weight ?? 0)
    : (s.distanceM ?? s.distance ?? 0);
  return raw / src.perUnit;
}

export const DEFAULT_LEVEL_SOURCE = {
  level_reps: 'weight_lbs',
  level_time: 'distance_m',
  level_distance: 'weight_lbs',
};

// Read the level a proxy field encodes. Accepts both stored-set field names
// (weight/distance) and import-row names (weightKg/distanceM).
export function levelFromSet(source, s) {
  return Math.max(0, Math.round(rawProxyValue(source, s)));
}

// Copy of a set/row with the proxy value moved into `level` and the proxy
// field zeroed. Sets that already carry a level pass through untouched.
export function convertToLevel(source, s) {
  if (s.level > 0 || !LEVEL_SOURCES[source]) return s;
  const src = LEVEL_SOURCES[source];
  const out = { ...s, level: levelFromSet(source, s) };
  const zero = src.field === 'weight' ? ['weight', 'weightKg']
    : src.field === 'distance' ? ['distance', 'distanceM'] : ['reps'];
  if (src.timeFrom) {
    // Keep a real logged time if there is one; otherwise the proxy (minutes)
    // becomes the time. The proxy field is zeroed either way.
    const tf = { weight: ['weight', 'weightKg'], distance: ['distance', 'distanceM'], reps: ['reps'] }[src.timeFrom.field];
    const proxy = (s[tf[tf.length - 1]] ?? s[tf[0]] ?? 0) / src.timeFrom.perUnit;
    const timeField = 'timeSec' in s ? 'timeSec' : 'time';
    if (!(s[timeField] > 0) && proxy > 0) out[timeField] = Math.round(proxy * 60);
    zero.push(...tf);
  }
  for (const f of zero) if (f in out) out[f] = 0;
  return out;
}

// Repair for bike-style sets converted before the "time logged as Reps"
// option existed: the user logged weight = level and reps = minutes, the
// converter moved the weight into level (correct) but left the minutes in
// reps, which Level/Time doesn't show, so the time looked lost. Such a set
// has level > 0, reps > 0, and no time, weight or distance.
export const hasStrandedRepsTime = s =>
  s.level > 0 && s.reps > 0 && !(s.time > 0) && !(s.weight > 0) && !(s.distance > 0);

// `secondsPerUnit` is 60 when reps held minutes, 1 for seconds.
export function recoverRepsTime(s, secondsPerUnit = 60) {
  if (!hasStrandedRepsTime(s)) return s;
  return { ...s, reps: 0, time: Math.round(s.reps * secondsPerUnit) };
}

// Identity key for duplicate detection. Weight compares at 0.01 kg and
// distance at 1 m so the same set imported via CSV (unit-converted) and via
// the .fitnotes SQLite backup (raw metric) still matches despite rounding
// differences between the two exports. Two sets are "the same" when every
// logged value matches; import diffs multiset counts on this key so legitimate
// repeated identical sets survive while re-imports stay idempotent.
export function setKey(exerciseLower, s) {
  return [
    s.date,
    exerciseLower,
    Math.round((s.weightKg ?? s.weight ?? 0) * 100),
    s.reps ?? 0,
    Math.round(s.distanceM ?? s.distance ?? 0),
    Math.round(s.timeSec ?? s.time ?? 0),
    s.level ?? 0,
    s.comment ?? '',
  ].join('|');
}

// Decide what kind of exercise the imported data describes.
export function inferType(rows) {
  const hasReps = rows.some(r => r.reps > 0);
  const hasCardio = rows.some(r => r.distanceM > 0 || r.timeSec > 0);
  return !hasReps && hasCardio ? 'distance_time' : 'weight_reps';
}

// ---------------------------------------------------------------------------
// Switching a level exercise to Level / Distance when its history kept the
// distance or time in Reps. Stationary-bike history logged as weight = level
// with reps meaning two things over the years: tenths of a mile at first,
// later minutes. Sets before `cutoff` (YYYY-MM-DD) read reps as distance;
// sets from `cutoff` on read reps (or an existing time) as minutes and get
// a distance estimated from `metersPerMin`. Sets that already have a
// distance are left alone.

export const METERS_PER_TENTH_MILE = 160.9344;

export const needsDistance = s => !(s.distance > 0) && (s.reps > 0 || s.time > 0);

// The date that starts the longest gap-free stretch after the biggest gap
// between logged days: a guess at when the logging habit changed.
export function biggestGapCutoff(sets) {
  const dates = [...new Set(sets.filter(needsDistance).map(s => s.date))].sort();
  let best = null, bestGap = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = Date.parse(dates[i]) - Date.parse(dates[i - 1]);
    if (gap > bestGap) { bestGap = gap; best = dates[i]; }
  }
  return best;
}

// Average speed (metres per minute) from sets before the cutoff that logged
// both a distance-in-reps and a time. Least squares through the origin, so
// longer rides weigh more. null when there are none.
export function fitMetersPerMin(sets, cutoff, metersPerRep = METERS_PER_TENTH_MILE) {
  let dt = 0, tt = 0;
  for (const s of sets) {
    if (!needsDistance(s) || !(s.reps > 0) || !(s.time > 0) || (cutoff && s.date >= cutoff)) continue;
    const d = s.reps * metersPerRep, t = s.time / 60;
    dt += d * t; tt += t * t;
  }
  return tt > 0 ? dt / tt : null;
}

// One converted copy per set that needs a distance, with how it was read.
export function planDistanceConversion(sets, { cutoff, metersPerMin, metersPerRep = METERS_PER_TENTH_MILE }) {
  const out = [];
  for (const s of sets) {
    if (!needsDistance(s)) continue;
    if ((!cutoff || s.date < cutoff) && s.reps > 0) {
      out.push({ from: s, mode: 'distance', set: { ...s, distance: Math.round(s.reps * metersPerRep), reps: 0 } });
    } else {
      const minutes = s.time > 0 ? s.time / 60 : s.reps;
      out.push({
        from: s, mode: 'time',
        set: { ...s, time: Math.round(minutes * 60), distance: Math.round(minutes * metersPerMin), reps: 0, distanceEstimated: true },
      });
    }
  }
  return out;
}
