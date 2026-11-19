// Unit tests for level tracking: proxy→level conversion, dedupe keys, and the
// CSV export/import round trip. Run: node tests/level.test.mjs
import { strict as assert } from 'node:assert';
import {
  KG_PER_LB, parseFitNotesCSV, setKey,
  LEVEL_SOURCES, DEFAULT_LEVEL_SOURCE, levelFromSet, convertToLevel,
  levelSourcesFor, hasStrandedRepsTime, recoverRepsTime,
  needsDistance, biggestGapCutoff, fitMetersPerMin, planDistanceConversion, METERS_PER_TENTH_MILE,
} from '../app/js/importer.js';
import { buildCSV } from '../app/js/exporter.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

test('levelFromSet reads every proxy encoding, both field spellings', () => {
  // import-row spelling (weightKg / distanceM)
  assert.equal(levelFromSet('weight_lbs', { weightKg: 2 * KG_PER_LB }), 2);
  assert.equal(levelFromSet('weight_kg', { weightKg: 3 }), 3);
  assert.equal(levelFromSet('distance_m', { distanceM: 8 }), 8);
  assert.equal(levelFromSet('distance_km', { distanceM: 8000 }), 8);
  // stored-set spelling (weight / distance)
  assert.equal(levelFromSet('weight_lbs', { weight: 1 * KG_PER_LB }), 1);
  assert.equal(levelFromSet('distance_m', { distance: 5 }), 5);
  // float noise from unit round trips still lands on the integer
  assert.equal(levelFromSet('weight_lbs', { weight: 4.00001 * KG_PER_LB }), 4);
  assert.equal(levelFromSet('bogus', { weight: 5 }), 0);
});

test('convertToLevel moves the proxy into level and zeroes the source', () => {
  const row = { date: '2026-08-01', weightKg: 2 * KG_PER_LB, reps: 25, distanceM: 0, timeSec: 0, comment: '' };
  const out = convertToLevel('weight_lbs', row);
  assert.equal(out.level, 2);
  assert.equal(out.weightKg, 0);
  assert.equal(out.reps, 25);
  assert.equal(row.weightKg, 2 * KG_PER_LB); // input untouched

  const set = { id: 7, date: '2026-08-01', weight: 0, reps: 0, distance: 8, time: 1800, comment: '' };
  const out2 = convertToLevel('distance_m', set);
  assert.equal(out2.level, 8);
  assert.equal(out2.distance, 0);
  assert.equal(out2.time, 1800);
});

test('convertToLevel leaves already-converted sets alone', () => {
  const set = { weight: 90, reps: 5, level: 3 };
  assert.deepEqual(convertToLevel('weight_lbs', set), set);
});

test('setKey distinguishes levels and matches converted row against converted set', () => {
  const row = convertToLevel('weight_lbs',
    { date: '2026-08-01', weightKg: 2 * KG_PER_LB, reps: 25, distanceM: 0, timeSec: 0, comment: '' });
  const stored = convertToLevel('weight_lbs',
    { date: '2026-08-01', weight: 2 * KG_PER_LB, reps: 25, distance: 0, time: 0, comment: '' });
  assert.equal(setKey('push up', row), setKey('push up', stored));
  assert.notEqual(setKey('push up', { ...row, level: 3 }), setKey('push up', row));
});

test('CSV export writes levels through the proxy column and round-trips', () => {
  const categories = [{ id: 1, name: 'Chest' }, { id: 2, name: 'Cardio' }];
  const exercises = [
    { id: 1, name: 'Push Up', categoryId: 1, type: 'level_reps', levelKind: 'set', levelFrom: 'weight_lbs' },
    { id: 2, name: 'Elliptical Trainer', categoryId: 2, type: 'level_time', levelKind: 'resistance', levelFrom: 'distance_m' },
  ];
  const sets = [
    { id: 1, exerciseId: 1, date: '2026-08-01', weight: 0, reps: 30, distance: 0, time: 0, level: 1, comment: '', seq: 1 },
    { id: 2, exerciseId: 1, date: '2026-08-01', weight: 0, reps: 22, distance: 0, time: 0, level: 2, comment: '', seq: 2 },
    { id: 3, exerciseId: 2, date: '2026-08-01', weight: 0, reps: 0, distance: 0, time: 1800, level: 8, comment: '', seq: 3 },
  ];
  const csv = buildCSV({ sets, exercises, categories, unit: 'lbs' });
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[1], '2026-08-01,Push Up,Chest,1,lbs,30,,,,');
  assert.equal(lines[2], '2026-08-01,Push Up,Chest,2,lbs,22,,,,');
  assert.equal(lines[3], '2026-08-01,Elliptical Trainer,Cardio,,,,8,m,30:00,');

  // Re-import: parse, apply each exercise's stored rule, keys must match the
  // stored sets exactly — this is what makes re-imports idempotent.
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  const ruleFor = name => exercises.find(e => e.name === name).levelFrom;
  const converted = rows.map(r => convertToLevel(ruleFor(r.exercise), r));
  assert.deepEqual(
    converted.map(r => setKey(r.exercise.toLowerCase(), r)),
    sets.map(s => setKey(exercises.find(e => e.id === s.exerciseId).name.toLowerCase(), s)),
  );
});

test('default level sources exist for every level type', () => {
  for (const t of ['level_reps', 'level_time']) {
    assert.ok(LEVEL_SOURCES[DEFAULT_LEVEL_SOURCE[t]], t);
  }
});

test('time-in-reps sources: weight becomes level, reps minutes become time', () => {
  // stationary bike logged in FitNotes as 6 lbs × 30 reps = level 6 for 30 min
  const row = { date: '2026-08-01', weightKg: 6 * KG_PER_LB, reps: 30, distanceM: 0, timeSec: 0, comment: '' };
  const out = convertToLevel('weight_lbs_time_reps', row);
  assert.deepEqual([out.level, out.reps, out.weightKg, out.timeSec], [6, 0, 0, 1800]);
  const set = { id: 1, weight: 4, reps: 25, distance: 0, time: 0 };
  const out2 = convertToLevel('weight_kg_time_reps', set);
  assert.deepEqual([out2.level, out2.time, out2.weight, out2.reps], [4, 1500, 0, 0]);
  // a real logged time wins over the reps proxy
  assert.equal(convertToLevel('weight_lbs_time_reps', { ...row, timeSec: 1500 }).timeSec, 1500);
});

test('time-in-reps sources are offered only for Level/Time', () => {
  const ids = t => levelSourcesFor(t).map(([id]) => id);
  assert.ok(ids('level_time').includes('weight_lbs_time_reps'));
  assert.ok(!ids('level_reps').includes('weight_lbs_time_reps'));
  assert.ok(ids('level_reps').includes('weight_lbs'));
});

test('recoverRepsTime moves minutes stranded in reps into time', () => {
  // what the old weight_lbs conversion produced from 6 lbs × 30 reps
  const old = convertToLevel('weight_lbs',
    { id: 9, date: '2026-08-01', weight: 6 * KG_PER_LB, reps: 30, distance: 0, time: 0, comment: '' });
  assert.deepEqual([old.level, old.reps, old.time], [6, 30, 0]);
  assert.ok(hasStrandedRepsTime(old));
  const fixed = recoverRepsTime(old);
  assert.deepEqual([fixed.id, fixed.level, fixed.reps, fixed.time], [9, 6, 0, 1800]);
  assert.equal(recoverRepsTime(old, 1).time, 30);
  const ok = { level: 8, reps: 0, time: 1800, weight: 0, distance: 0 };
  assert.ok(!hasStrandedRepsTime(ok));
  assert.equal(recoverRepsTime(ok), ok);
});

test('time-in-reps exercise exports level as weight and round-trips', () => {
  const categories = [{ id: 1, name: 'Cardio' }];
  const exercises = [{ id: 1, name: 'Stationary Bike', categoryId: 1, type: 'level_time', levelKind: 'resistance', levelFrom: 'weight_lbs_time_reps' }];
  const sets = [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 0, reps: 0, distance: 0, time: 1800, level: 6, comment: '', seq: 1 }];
  const csv = buildCSV({ sets, exercises, categories, unit: 'lbs' });
  assert.equal(csv.trim().split('\r\n')[1], '2026-08-01,Stationary Bike,Cardio,6,lbs,,,,30:00,');
  const { rows } = parseFitNotesCSV(csv);
  const back = convertToLevel('weight_lbs_time_reps', rows[0]);
  assert.equal(setKey('stationary bike', back), setKey('stationary bike', sets[0]));
});

// Jonathan's stationary bike: weight = level, reps = tenths of a mile until
// a gap in 2020–2023, reps = minutes after it.
const bike = [
  { id: 1, date: '2019-03-01', level: 5, reps: 26, time: 600, weight: 0, distance: 0 },   // 2.6 mi, 10 min
  { id: 2, date: '2019-06-01', level: 6, reps: 90, time: 2160, weight: 0, distance: 0 },  // 9 mi, 36 min
  { id: 3, date: '2020-02-01', level: 6, reps: 131, time: 0, weight: 0, distance: 0 },   // 13.1 mi
  { id: 4, date: '2023-05-01', level: 7, reps: 30, time: 0, weight: 0, distance: 0 },    // 30 min
  { id: 5, date: '2024-01-01', level: 7, reps: 0, time: 1500, weight: 0, distance: 0 },  // already a time
  { id: 6, date: '2024-02-01', level: 8, reps: 0, time: 1200, weight: 0, distance: 4000 }, // already fine
];

test('biggestGapCutoff finds the start of the post-gap stretch', () => {
  assert.equal(biggestGapCutoff(bike), '2023-05-01');
  assert.equal(biggestGapCutoff([bike[0]]), null);
});

test('fitMetersPerMin fits speed from pre-cutoff sets with distance-in-reps and time', () => {
  const mpm = fitMetersPerMin(bike, '2023-05-01');
  // (2.6·10 + 9·36) / (10² + 36²) mi/min
  const expect = ((2.6 * 10 + 9 * 36) / (100 + 1296)) * 1609.344;
  assert.ok(Math.abs(mpm - expect) < 1e-6);
  assert.equal(fitMetersPerMin(bike, '2000-01-01'), null);
});

test('planDistanceConversion reads reps as distance before the cutoff, minutes after', () => {
  assert.ok(!needsDistance(bike[5]));
  const mpm = 0.26 * 1609.344;
  const plan = planDistanceConversion(bike, { cutoff: '2023-05-01', metersPerMin: mpm });
  const by = Object.fromEntries(plan.map(p => [p.from.id, p]));
  assert.equal(plan.length, 5);
  assert.deepEqual([by[1].mode, by[1].set.distance, by[1].set.time, by[1].set.reps, by[1].set.level],
    ['distance', Math.round(26 * METERS_PER_TENTH_MILE), 600, 0, 5]);
  assert.equal(by[3].set.distance, Math.round(131 * METERS_PER_TENTH_MILE));
  assert.deepEqual([by[4].mode, by[4].set.time, by[4].set.distance, by[4].set.reps, by[4].set.distanceEstimated],
    ['time', 1800, Math.round(30 * mpm), 0, true]);
  assert.deepEqual([by[5].set.time, by[5].set.distance], [1500, Math.round(25 * mpm)]);
});

console.log(`${passed} tests passed`);
