// Unit tests for level tracking: proxy→level conversion, dedupe keys, and the
// CSV export/import round trip. Run: node tests/level.test.mjs
import { strict as assert } from 'node:assert';
import {
  KG_PER_LB, parseFitNotesCSV, setKey,
  LEVEL_SOURCES, DEFAULT_LEVEL_SOURCE, levelFromSet, convertToLevel,
  levelSourcesFor, isSwappedLevelTime, recoverSwappedLevelTime,
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

test('reps_time sources: reps become level, weight minutes become time', () => {
  // stationary bike logged in FitNotes as 30 lbs × 6 reps = level 6 for 30 min
  const row = { date: '2026-08-01', weightKg: 30 * KG_PER_LB, reps: 6, distanceM: 0, timeSec: 0, comment: '' };
  const out = convertToLevel('reps_time_lbs', row);
  assert.equal(out.level, 6);
  assert.equal(out.reps, 0);
  assert.equal(out.weightKg, 0);
  assert.equal(out.timeSec, 1800);
  // fractional minutes keep their seconds
  const set = { id: 1, weight: 22.5, reps: 4, distance: 0, time: 0 };
  const out2 = convertToLevel('reps_time_kg', set);
  assert.deepEqual([out2.level, out2.time, out2.weight, out2.reps], [4, 1350, 0, 0]);
  // a real logged time wins over the weight proxy
  assert.equal(convertToLevel('reps_time_lbs', { ...row, timeSec: 1500 }).timeSec, 1500);
});

test('reps_time sources are offered only for Level/Time', () => {
  const ids = t => levelSourcesFor(t).map(([id]) => id);
  assert.ok(ids('level_time').includes('reps_time_lbs'));
  assert.ok(!ids('level_reps').includes('reps_time_lbs'));
  assert.ok(ids('level_reps').includes('weight_lbs'));
});

test('recoverSwappedLevelTime undoes the old weight→level bike conversion', () => {
  // what the old converter produced from 30 lbs × level 6
  const mangled = convertToLevel('weight_lbs',
    { id: 9, date: '2026-08-01', weight: 30 * KG_PER_LB, reps: 6, distance: 0, time: 0, comment: '' });
  assert.deepEqual([mangled.level, mangled.reps, mangled.time], [30, 6, 0]);
  assert.ok(isSwappedLevelTime(mangled));
  const fixed = recoverSwappedLevelTime(mangled);
  assert.deepEqual([fixed.id, fixed.level, fixed.reps, fixed.time], [9, 6, 0, 1800]);
  assert.equal(recoverSwappedLevelTime(mangled, 1).time, 30);
  // healthy level/time sets are left alone
  const ok = { level: 8, reps: 0, time: 1800, weight: 0, distance: 0 };
  assert.ok(!isSwappedLevelTime(ok));
  assert.equal(recoverSwappedLevelTime(ok), ok);
});

test('reps_time exercise exports level as reps and round-trips', () => {
  const categories = [{ id: 1, name: 'Cardio' }];
  const exercises = [{ id: 1, name: 'Stationary Bike', categoryId: 1, type: 'level_time', levelKind: 'resistance', levelFrom: 'reps_time_lbs' }];
  const sets = [{ id: 1, exerciseId: 1, date: '2026-08-01', weight: 0, reps: 0, distance: 0, time: 1800, level: 6, comment: '', seq: 1 }];
  const csv = buildCSV({ sets, exercises, categories, unit: 'lbs' });
  assert.equal(csv.trim().split('\r\n')[1], '2026-08-01,Stationary Bike,Cardio,,,6,,,30:00,');
  const { rows } = parseFitNotesCSV(csv);
  const back = convertToLevel('reps_time_lbs', rows[0]);
  assert.equal(setKey('stationary bike', back), setKey('stationary bike', sets[0]));
});

console.log(`${passed} tests passed`);
