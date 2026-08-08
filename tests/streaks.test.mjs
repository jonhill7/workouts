// Unit tests for routine completion/streak logic. Run: node tests/streaks.test.mjs
import { strict as assert } from 'node:assert';
import {
  routineItems, dayProgress, completions, currentStreak, routineStats,
  glowLevel, daysBetween, MAX_GAP_DAYS, GLOW_CAP, DEFAULT_SETS, PARTIAL_THRESHOLD,
} from '../app/js/streaks.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const set = (exerciseId, date) => ({ exerciseId, date });
const sets = (exerciseId, date, n) => Array.from({ length: n }, () => set(exerciseId, date));
const item = (exerciseId, sets) => ({ exerciseId, sets });

test('daysBetween is exact across month/year boundaries', () => {
  assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
  assert.equal(daysBetween('2025-12-25', '2026-01-01'), 7);
  assert.equal(daysBetween('2026-08-01', '2026-08-01'), 0);
});

test('routineItems passes through items and normalizes legacy exerciseIds', () => {
  const items = [item(1, 5)];
  assert.equal(routineItems({ items }), items);
  assert.deepEqual(routineItems({ exerciseIds: [1, 2] }),
    [item(1, DEFAULT_SETS), item(2, DEFAULT_SETS)]);
  assert.deepEqual(routineItems({}), []);
});

test('dayProgress caps each exercise at its target', () => {
  const items = [item(1, 3), item(2, 2)];
  const day = [...sets(1, 'd', 5), ...sets(2, 'd', 1), set(9, 'd')]; // extra + foreign sets
  assert.deepEqual(dayProgress(items, day), { done: 4, want: 5 });
});

test('a missing or zero target counts as 1 set', () => {
  assert.deepEqual(dayProgress([{ exerciseId: 1 }, item(2, 0)], [set(1, 'd')]),
    { done: 1, want: 2 });
});

test('full targets met is a full completion', () => {
  const items = [item(1, 3), item(2, 2)];
  const history = [...sets(1, '2026-08-01', 3), ...sets(2, '2026-08-01', 2)];
  assert.deepEqual(completions(items, history),
    [{ date: '2026-08-01', done: 5, want: 5, full: true }]);
});

test('80% of target sets is a partial completion; below it is nothing', () => {
  const items = [item(1, 3), item(2, 2)]; // want 5; threshold = 4 sets
  const history = [
    ...sets(1, '2026-08-01', 3), set(2, '2026-08-01'),   // 4/5 -> partial
    ...sets(1, '2026-08-03', 3),                          // 3/5 -> no
  ];
  assert.deepEqual(completions(items, history),
    [{ date: '2026-08-01', done: 4, want: 5, full: false }]);
});

test('exactly the partial threshold qualifies (8 of 10 sets)', () => {
  const items = [item(1, 10)];
  assert.equal(completions(items, sets(1, '2026-08-01', 8)).length, 1);
  assert.equal(completions(items, sets(1, '2026-08-02', 7)).length, 0);
});

test('extra sets on one exercise cannot cover a skipped exercise', () => {
  const items = [item(1, 3), item(2, 2)];
  const history = sets(1, '2026-08-01', 10); // 3/5 capped -> not even partial
  assert.deepEqual(completions(items, history), []);
});

test('completion dates come back sorted regardless of set order', () => {
  const items = [item(1, 1)];
  const history = [set(1, '2026-08-05'), set(1, '2026-08-01'), set(1, '2026-08-03')];
  assert.deepEqual(completions(items, history).map(c => c.date),
    ['2026-08-01', '2026-08-03', '2026-08-05']);
});

test('an empty routine never counts as completed', () => {
  assert.deepEqual(completions([], [set(1, '2026-08-01')]), []);
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

test('routineStats splits full/partial and counts both toward the streak', () => {
  const items = [item(1, 2), item(2, 2)];
  const history = [
    ...sets(1, '2026-05-01', 2), ...sets(2, '2026-05-01', 2), // full, outside chain
    ...sets(1, '2026-08-01', 2), ...sets(2, '2026-08-01', 2), // full
    ...sets(1, '2026-08-06', 2), ...sets(2, '2026-08-06', 2), // full
  ];
  const st = routineStats(items, history, '2026-08-08');
  assert.deepEqual(st, { total: 3, full: 3, partial: 0, streak: 2, lastDate: '2026-08-06' });
});

test('a partial completion keeps a streak alive', () => {
  const items = [item(1, 5)]; // partial at ≥4 sets
  const history = [
    ...sets(1, '2026-08-01', 5), // full
    ...sets(1, '2026-08-05', 4), // partial
  ];
  const st = routineStats(items, history, '2026-08-08');
  assert.deepEqual(st, { total: 2, full: 1, partial: 1, streak: 2, lastDate: '2026-08-05' });
});

test('routineStats on an empty history', () => {
  assert.deepEqual(routineStats([item(1, 3)], [], '2026-08-08'),
    { total: 0, full: 0, partial: 0, streak: 0, lastDate: null });
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
  assert.equal(DEFAULT_SETS, 3);
  assert.equal(PARTIAL_THRESHOLD, 0.8);
});

console.log(`\n${passed} tests passed`);
