// Unit tests for routine completion/streak logic. Run: node tests/streaks.test.mjs
import { strict as assert } from 'node:assert';
import {
  completionDates, currentStreak, routineStats, glowLevel, daysBetween,
  MAX_GAP_DAYS, GLOW_CAP,
} from '../app/js/streaks.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const set = (exerciseId, date) => ({ exerciseId, date });

test('daysBetween is exact across month/year boundaries', () => {
  assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
  assert.equal(daysBetween('2025-12-25', '2026-01-01'), 7);
  assert.equal(daysBetween('2026-08-01', '2026-08-01'), 0);
});

test('a day completes a routine only when every exercise is logged', () => {
  const sets = [
    set(1, '2026-08-01'), set(2, '2026-08-01'),         // both -> completed
    set(1, '2026-08-03'),                               // only one -> not
    set(1, '2026-08-05'), set(2, '2026-08-05'), set(2, '2026-08-05'), // dupes fine
    set(9, '2026-08-07'),                               // other exercise ignored
  ];
  assert.deepEqual(completionDates([1, 2], sets), ['2026-08-01', '2026-08-05']);
});

test('completion dates come back sorted regardless of set order', () => {
  const sets = [set(1, '2026-08-05'), set(1, '2026-08-01'), set(1, '2026-08-03')];
  assert.deepEqual(completionDates([1], sets), ['2026-08-01', '2026-08-03', '2026-08-05']);
});

test('an empty routine never counts as completed', () => {
  assert.deepEqual(completionDates([], [set(1, '2026-08-01')]), []);
});

test('streak chains completions up to MAX_GAP_DAYS apart', () => {
  const dates = ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-20'];
  assert.equal(currentStreak(dates, '2026-07-20'), 4); // all gaps ≤ 7
});

test('a gap over MAX_GAP_DAYS breaks the chain', () => {
  const dates = ['2026-06-01', '2026-06-20', '2026-06-25', '2026-07-01'];
  assert.equal(currentStreak(dates, '2026-07-01'), 3); // 19-day gap cuts off 06-01
});

test('streak dies when the last completion is too long ago', () => {
  const dates = ['2026-07-01', '2026-07-05'];
  assert.equal(currentStreak(dates, '2026-07-12'), 2);  // exactly 7 days: alive
  assert.equal(currentStreak(dates, '2026-07-13'), 0);  // 8 days: dead
});

test('no completions means no streak', () => {
  assert.equal(currentStreak([], '2026-08-08'), 0);
});

test('routineStats aggregates completions, streak and last date', () => {
  const sets = [
    set(1, '2026-05-01'), set(2, '2026-05-01'),
    set(1, '2026-08-01'), set(2, '2026-08-01'),
    set(1, '2026-08-06'), set(2, '2026-08-06'),
  ];
  const st = routineStats([1, 2], sets, '2026-08-08');
  assert.equal(st.completions, 3);
  assert.equal(st.streak, 2); // May completion is outside the chain
  assert.equal(st.lastDate, '2026-08-06');
});

test('routineStats on an empty history', () => {
  assert.deepEqual(routineStats([1], [], '2026-08-08'),
    { completions: 0, streak: 0, lastDate: null });
});

test('glowLevel ramps to 1 at GLOW_CAP and saturates', () => {
  assert.equal(glowLevel(0), 0);
  assert.equal(glowLevel(GLOW_CAP / 2), 0.5);
  assert.equal(glowLevel(GLOW_CAP), 1);
  assert.equal(glowLevel(GLOW_CAP * 3), 1);
  assert.equal(glowLevel(-2), 0);
});

test('constants match the intended product behavior', () => {
  assert.equal(MAX_GAP_DAYS, 7);
  assert.equal(GLOW_CAP, 50);
});

console.log(`\n${passed} tests passed`);
