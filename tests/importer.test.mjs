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

test('interior quotes (inch marks) stay literal and do not shift columns', () => {
  const rows = parseCSV('a,Box Jump (24"),c\nd,e,f\n');
  assert.deepEqual(rows, [['a', 'Box Jump (24")', 'c'], ['d', 'e', 'f']]);
});

test('exercise name with inch mark imports with correct category', () => {
  const csv = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\n' +
    '2026-01-05,Chin Up (45" band - weight),Back,145,lbs,8,,,\n' +
    '2026-01-05,Flat Barbell Bench Press,Chest,185,lbs,5,,,\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].exercise, 'Chin Up (45" band - weight)');
  assert.equal(rows[0].category, 'Back');
  assert.ok(Math.abs(rows[0].weightKg - 145 * KG_PER_LB) < 1e-9);
  assert.equal(rows[0].reps, 8);
  assert.equal(rows[1].category, 'Chest');
});

test('no-comment-column header (Date..Time) parses', () => {
  const csv = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\n' +
    '2026-01-05,Deadlift,Back,315,lbs,5,,,\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].comment, '');
  assert.ok(Math.abs(rows[0].weightKg - 315 * KG_PER_LB) < 1e-9);
});

test('UTF-8 BOM before header is ignored', () => {
  const csv = '﻿Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\n' +
    '2026-01-05,Deadlift,Back,315,lbs,5,,,\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
});

test('tab-delimited export is auto-detected', () => {
  const tsv = 'Date\tExercise\tCategory\tWeight\tWeight Unit\tReps\tDistance\tDistance Unit\tTime\n' +
    '2026-01-05\tBench, Close Grip\tChest\t100\tkg\t5\t\t\t\n';
  const { rows, errors } = parseFitNotesCSV(tsv);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].exercise, 'Bench, Close Grip');
  assert.equal(rows[0].weightKg, 100);
});

test('unquoted comma in exercise name is repaired (user-reported fragments)', () => {
  const csv = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\n' +
    '2026-01-05,Pull Up (Assisted, 145 - Weight),Back,145,lbs,8,,,\n' +
    '2026-01-06,Squat (Tempo, 3-0-3 Seconds),Legs,185,lbs,5,,,\n' +
    '2026-01-07,Lunge (Rear, Left),Legs,50,lbs,10,,,\n' +
    '2026-01-08,Calf Raise (Toes 45°Out, 5 Sec),Legs,90,lbs,12,,,\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  assert.deepEqual(rows.map(r => r.exercise), [
    'Pull Up (Assisted, 145 - Weight)',
    'Squat (Tempo, 3-0-3 Seconds)',
    'Lunge (Rear, Left)',
    'Calf Raise (Toes 45°Out, 5 Sec)',
  ]);
  assert.deepEqual(rows.map(r => r.category), ['Back', 'Legs', 'Legs', 'Legs']);
  assert.equal(rows[0].reps, 8);
  assert.ok(Math.abs(rows[1].weightKg - 185 * KG_PER_LB) < 1e-9);
});

test('two unquoted commas in one exercise name', () => {
  const csv = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time\n' +
    '2026-01-05,Lunge (Rear, Left, Slow),Legs,50,lbs,10,,,\n';
  const { rows } = parseFitNotesCSV(csv);
  assert.equal(rows[0].exercise, 'Lunge (Rear, Left, Slow)');
  assert.equal(rows[0].category, 'Legs');
});

test('unquoted commas split correctly between exercise and comment', () => {
  const csv = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment\n' +
    '2026-01-05,Squat (Pause, 3s),Legs,100,kg,5,,,,tough day, felt tired\n';
  const { rows, errors } = parseFitNotesCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].exercise, 'Squat (Pause, 3s)');
  assert.equal(rows[0].category, 'Legs');
  assert.equal(rows[0].weightKg, 100);
  assert.equal(rows[0].comment, 'tough day, felt tired');
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
