// Unit tests for the .fitnotes SQLite backup parser, using the vendored
// sql.js engine and a fixture built with tests/fixtures/ tooling.
// Run: node tests/fitnotes-db.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFitNotesDB, looksLikeSQLite } from '../app/js/fitnotes-db.js';
import { setKey, KG_PER_LB } from '../app/js/importer.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const initSqlJs = require('../app/vendor/sql-wasm.js');
const SQL = await initSqlJs({
  locateFile: f => join(here, '..', 'app', 'vendor', f),
});

const bytes = readFileSync(join(here, 'fixtures', 'sample.fitnotes'));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

test('fixture is detected as SQLite', () => {
  assert.ok(looksLikeSQLite(bytes));
  assert.ok(!looksLikeSQLite(new TextEncoder().encode('Date,Exercise\n')));
});

const db = new SQL.Database(bytes);
const parsed = parseFitNotesDB(db);
db.close();

test('training_log rows normalize with kg weights and categories', () => {
  assert.equal(parsed.rows.length, 3);
  const bench = parsed.rows.find(r => r.date === '2026-04-20');
  assert.equal(bench.exercise, 'Flat Barbell Bench Press');
  assert.equal(bench.category, 'Chest');
  assert.equal(bench.weightKg, 80);
  assert.equal(bench.reps, 10);
});

test('comments join via the dominant owner_type group (decoys ignored)', () => {
  const squat = parsed.rows.find(r => r.exercise === 'Barbell Squat');
  assert.equal(squat.comment, 'belt on, felt heavy');
  assert.ok(!parsed.rows.some(r => r.comment.includes('decoy')));
});

test('SQLite row keys match CSV-imported keys (cross-format dedupe)', () => {
  const dup = parsed.rows.find(r => r.date === '2026-05-04');
  const fromCSV = { date: '2026-05-04', weightKg: 185 * KG_PER_LB, reps: 8, distanceM: 0, timeSec: 0, comment: '' };
  assert.equal(
    setKey('flat barbell bench press', dup),
    setKey('flat barbell bench press', fromCSV),
  );
});

test('exercise notes are extracted', () => {
  assert.equal(parsed.exerciseNotes.get('flat barbell bench press'), 'Grip: pinky on ring');
  assert.equal(parsed.exerciseNotes.size, 1);
});

test('routines come through with section-ordered exercises and template set counts', () => {
  assert.equal(parsed.routines.length, 1);
  assert.equal(parsed.routines[0].name, 'Push Day');
  assert.deepEqual(parsed.routines[0].exercises, [
    { name: 'Flat Barbell Bench Press', sets: 4 }, // 4 template sets in the backup
    { name: 'Cable Fly', sets: 0 },                // none -> importer default
  ]);
});

test('all exercise definitions are listed with categories', () => {
  const fly = parsed.allExercises.find(e => e.name === 'Cable Fly');
  assert.equal(fly.category, 'Chest');
});

console.log(`\n${passed} tests passed`);
