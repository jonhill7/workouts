// Unit tests for the pure import/normalization logic. Run: node tests/importer.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseCSV, parseFitNotesCSV, parseTimeToSeconds, timeToString,
  setKey, inferType, KG_PER_LB,
} from '../app/js/importer.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(here, 'fixtures', name), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

test('parseCSV handles quotes, escaped quotes, commas, CRLF', () => {
  const rows = parseCSV('a,"b,c","d""e"\r\nf,,g\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd"e'], ['f', '', 'g']]);
});

test('parseTimeToSeconds handles h:mm:ss, mm:ss, blanks', () => {
  assert.equal(parseTimeToSeconds('0:28:30'), 1710);
  assert.equal(parseTimeToSeconds('26:45'), 1605);
  assert.equal(parseTimeToSeconds('90'), 90);
  assert.equal(parseTimeToSeconds(''), 0);
  assert.equal(timeToString(1710), '28:30');
  assert.equal(timeToString(3661), '1:01:01');
});

test('old-format export parses with header-derived lbs unit', () => {
  const { rows, errors } = parseFitNotesCSV(fixture('fitnotes-old-format.csv'));
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 18);
  const first = rows[0];
  assert.equal(first.date, '2026-05-04');
  assert.equal(first.exercise, 'Flat Barbell Bench Press');
  assert.equal(first.category, 'Chest');
  assert.ok(Math.abs(first.weightKg - 185 * KG_PER_LB) < 1e-9);
  assert.equal(first.reps, 8);
  const run = rows.find(r => r.exercise === 'Running');
  assert.ok(Math.abs(run.distanceM - 3.1 * 1609.344) < 0.01);
  assert.equal(run.timeSec, 1710);
});

test('new-format export parses per-row units and comments', () => {
  const { rows, errors } = parseFitNotesCSV(fixture('fitnotes-new-format.csv'));
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].comment, 'Felt strong, new PR');
  assert.ok(Math.abs(rows[0].weightKg - 215 * KG_PER_LB) < 1e-9);
  const squat = rows.find(r => r.exercise === 'Barbell Squat');
  assert.equal(squat.weightKg, 120); // kg row stays as-is
  const run = rows.find(r => r.exercise === 'Running');
  assert.equal(run.distanceM, 5000);
  assert.equal(run.timeSec, 1605);
});

test('identical sets get identical keys; different sets differ', () => {
  const { rows } = parseFitNotesCSV(fixture('fitnotes-old-format.csv'));
  const k0 = setKey(rows[0].exercise.toLowerCase(), rows[0]);
  const k1 = setKey(rows[1].exercise.toLowerCase(), rows[1]);
  const k2 = setKey(rows[2].exercise.toLowerCase(), rows[2]);
  assert.equal(k0, k1);       // the two 185×8 sets
  assert.notEqual(k0, k2);    // 195×5 differs
});

test('setKey matches between normalized rows and stored records', () => {
  const row = { date: '2026-05-04', weightKg: 185 * KG_PER_LB, reps: 8, distanceM: 0, timeSec: 0, comment: '' };
  const stored = { date: '2026-05-04', weight: 185 * KG_PER_LB, reps: 8, distance: 0, time: 0, comment: '' };
  assert.equal(setKey('bench', row), setKey('bench', stored));
});

test('inferType: cardio without reps → distance_time, lifting → weight_reps', () => {
  const { rows } = parseFitNotesCSV(fixture('fitnotes-old-format.csv'));
  const runs = rows.filter(r => r.exercise === 'Running');
  const bench = rows.filter(r => r.exercise === 'Flat Barbell Bench Press');
  assert.equal(inferType(runs), 'distance_time');
  assert.equal(inferType(bench), 'weight_reps');
});

test('rejects a non-FitNotes file', () => {
  const { rows, errors } = parseFitNotesCSV('foo,bar\n1,2\n');
  assert.equal(rows.length, 0);
  assert.ok(errors[0].includes('missing'));
});

test('skips malformed dates with an error, keeps good rows', () => {
  const csv = 'Date,Exercise,Category,Weight (kgs),Reps\n05/04/2026,Bench,Chest,100,5\n2026-05-04,Bench,Chest,100,5\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 1);
});

console.log(`\n${passed} tests passed`);
