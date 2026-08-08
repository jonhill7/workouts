// Unit tests for level tracking: proxy→level conversion, dedupe keys, and the
// CSV export/import round trip. Run: node tests/level.test.mjs
import { strict as assert } from 'node:assert';
import {
  KG_PER_LB, parseFitNotesCSV, setKey,
  LEVEL_SOURCES, DEFAULT_LEVEL_SOURCE, levelFromSet, convertToLevel,
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

console.log(`${passed} tests passed`);
