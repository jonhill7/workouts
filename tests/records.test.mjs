// Unit tests for PR/trophy detection and the Records tab tables.
// Run: node tests/records.test.mjs
import { strict as assert } from 'node:assert';
import { KG_PER_LB, convertToLevel } from '../app/js/importer.js';
import { computePRIds, repRecords, setCountRecords, splitWorkouts } from '../app/js/records.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

let nextId = 0;
const set = (date, weightKg, reps, extra = {}) =>
  ({ id: ++nextId, date, weight: weightKg, reps, distance: 0, time: 0, level: 0, seq: nextId, ...extra });

test('weight_reps PRs: heavier at same-or-more reps, first record never counts', () => {
  const sets = [
    set('2024-01-01', 40, 10),
    set('2024-01-08', 45, 10), // beats 40x10
    set('2024-01-15', 50, 8),  // beats 45 lifted for >=8 reps
    set('2024-01-22', 48, 8),  // below the 50x8 record
  ];
  const prs = computePRIds(sets, 'weight_reps');
  assert.deepEqual([...prs].sort(), [sets[1].id, sets[2].id].sort());
});

// User report: Shrugs history showed trophies on PR days, but Records listed
// only a single rep record — every heavier-day set was at 13+ reps, and the
// table used to drop anything above 12 reps.
test('rep records include high-rep sets (no 12-rep cap)', () => {
  const sets = [
    set('2024-11-20', 40, 15),
    set('2024-11-27', 42.5, 15), // 15-rep PR (has a trophy in history)
    set('2024-12-04', 45, 20),   // first 20-rep set
    set('2024-12-11', 47.5, 15), // 15-rep PR again
    set('2024-12-18', 45, 10),   // the only <=12-rep set ever
  ];
  const recs = repRecords(sets);
  assert.deepEqual([...recs.keys()].sort((a, b) => a - b), [10, 15, 20]);
  assert.equal(recs.get(15).weight, 47.5);
  assert.equal(recs.get(20).weight, 45);
  // The 15-rep 47.5 set proves 47.5 × 10 too, so it owns the 10-rep row.
  assert.equal(recs.get(10).weight, 47.5);
  assert.equal(recs.get(10).date, '2024-12-11');
});

test('a heavier set at more reps counts toward lower rep counts', () => {
  const sets = [
    set('2024-01-01', 90, 9),
    set('2024-01-08', 100, 10), // 100×10 proves 100×9
    set('2024-01-15', 120, 5),
  ];
  const recs = repRecords(sets);
  assert.equal(recs.get(9).weight, 100);
  assert.equal(recs.get(9).date, '2024-01-08');
  assert.equal(recs.get(10).weight, 100);
  assert.equal(recs.get(5).weight, 120); // fewer reps: 100×10 doesn't beat 120×5
});

test('cascaded records credit whichever set achieved the weight first', () => {
  const sets = [
    set('2024-01-01', 100, 9),  // 100 for ≥9 reps, first
    set('2024-02-01', 100, 12), // same weight at more reps, later
  ];
  const recs = repRecords(sets);
  assert.equal(recs.get(9).date, '2024-01-01');
  assert.equal(recs.get(12).date, '2024-02-01');
});

test('every trophy set is reflected in the rep records table', () => {
  const sets = [
    set('2024-01-01', 60, 14),
    set('2024-01-08', 65, 14),
    set('2024-01-15', 70, 16),
    set('2024-01-22', 62, 18),
  ];
  const prs = computePRIds(sets, 'weight_reps');
  const recs = repRecords(sets);
  for (const s of sets.filter(x => prs.has(x.id))) {
    assert.ok(recs.has(s.reps), `trophy at ${s.reps} reps has a records row`);
    assert.ok(recs.get(s.reps).weight >= s.weight);
  }
});

test('repRecords keeps the earliest set on ties and ignores rep-less sets', () => {
  const sets = [
    set('2024-01-01', 50, 12),
    set('2024-02-01', 50, 12),          // same weight later — not a new record
    set('2024-03-01', 0, 0),            // no reps: ignored
  ];
  const recs = repRecords(sets);
  assert.equal(recs.size, 1);
  assert.equal(recs.get(12).date, '2024-01-01');
});

// User report: Lunges logged the set number through the weight column
// ("2 lbs" = 2nd set, the FitNotes proxy). As weight_reps the trophies land
// on early "heavier" sets; after converting to level_reps they land on real
// rep improvements per set number. Data taken from the reported history.
const lungesProxy = () => [
  set('2016-10-15', 1 * KG_PER_LB, 50), set('2016-10-15', 2 * KG_PER_LB, 50), set('2016-10-15', 3 * KG_PER_LB, 50),
  set('2016-10-19', 1 * KG_PER_LB, 50), set('2016-10-19', 2 * KG_PER_LB, 60),
  set('2016-10-27', 1 * KG_PER_LB, 75), set('2016-10-27', 2 * KG_PER_LB, 65),
  set('2016-10-31', 1 * KG_PER_LB, 75), set('2016-10-31', 2 * KG_PER_LB, 80), set('2016-10-31', 3 * KG_PER_LB, 90),
  set('2016-11-08', 1 * KG_PER_LB, 80),
];

test('proxy-encoded data converted to level_reps gets trophies on per-workout improvements', () => {
  const sets = lungesProxy().map(s => convertToLevel('weight_lbs', s));
  const prs = computePRIds(sets, 'level_reps', 'set');
  const flagged = sets.filter(s => prs.has(s.id)).map(s => `${s.date}#${s.level}`);
  assert.deepEqual(flagged, [
    '2016-10-19#2', // 60 for 1 set beats 50
    '2016-10-27#1', // 75 for 1 set beats 60
    '2016-10-27#2', // 65 for 2 sets beats 50
    '2016-10-31#2', // 80 for 1 set beats 75; 75 for 2 sets beats 65
    '2016-10-31#3', // 90 / 80 / 75 for 1 / 2 / 3 sets all beat the standing records
    // 2016-11-08#1: 80 on a lone set doesn't beat 90 for 1 set
  ]);
  const recs = setCountRecords(sets, 'level_reps');
  assert.deepEqual([...recs].map(([n, r]) => [n, r.value, r.date]), [
    [1, 90, '2016-10-31'], [2, 80, '2016-10-31'], [3, 75, '2016-10-31'],
  ]);
});

test('unconverted proxy data still yields records rows for its high rep counts', () => {
  const recs = repRecords(lungesProxy());
  assert.deepEqual([...recs.keys()].sort((a, b) => a - b), [50, 60, 65, 75, 80, 90]);
});

test('resistance-level PRs compare within a level only, first set per level never counts', () => {
  const sets = [
    set('2026-08-01', 0, 30, { level: 1 }),
    set('2026-08-01', 0, 22, { level: 2 }),
    set('2026-08-03', 0, 31, { level: 1 }), // PR
    set('2026-08-03', 0, 22, { level: 2 }), // tie: not a PR
  ];
  const prs = computePRIds(sets, 'level_reps', 'resistance');
  assert.deepEqual([...prs], [sets[2].id]);
});

// Set-numbered exercises: records are per workout by set count — the n-set
// record is the highest rep threshold that n sets of one workout all reached.
test('splitWorkouts starts a new workout when the set number does not go up, or the date changes', () => {
  const sets = [
    set('2026-08-01', 0, 10, { level: 1 }), set('2026-08-01', 0, 8, { level: 2 }),
    set('2026-08-01', 0, 12, { level: 1 }), set('2026-08-01', 0, 9, { level: 2 }), set('2026-08-01', 0, 7, { level: 3 }),
    set('2026-08-02', 0, 11, { level: 1 }),
    set('2026-08-02', 0, 11, { level: 1 }), // same set number again: a third workout
    set('2026-08-02', 0, 5, { level: 3 }),  // skipping 2 stays in the same workout
  ];
  assert.deepEqual(splitWorkouts(sets).map(w => w.map(s => s.reps)), [[10, 8], [12, 9, 7], [11], [11, 5]]);
});

test('set-count records: 10, 8, 12 reps → 1 set 12, 2 sets 10, 3 sets 8', () => {
  const sets = [
    set('2026-08-01', 0, 10, { level: 1 }),
    set('2026-08-01', 0, 8, { level: 2 }),
    set('2026-08-01', 0, 12, { level: 3 }),
  ];
  const recs = setCountRecords(sets, 'level_reps');
  assert.deepEqual([...recs].map(([n, r]) => [n, r.value]), [[1, 12], [2, 10], [3, 8]]);
  for (const r of recs.values()) assert.equal(r.date, '2026-08-01');
});

test('set-count records: two workouts in a day count independently, ties go to the earlier one', () => {
  const sets = [
    set('2026-08-01', 0, 10, { level: 1 }), set('2026-08-01', 0, 9, { level: 2 }),
    set('2026-08-01', 0, 12, { level: 1 }), set('2026-08-01', 0, 8, { level: 2 }), set('2026-08-01', 0, 7, { level: 3 }),
    set('2026-08-05', 0, 12, { level: 1 }), set('2026-08-05', 0, 9, { level: 2 }), // ties 1-set and 2-set records
  ];
  const recs = setCountRecords(sets, 'level_reps');
  assert.deepEqual([...recs].map(([n, r]) => [n, r.value, r.date]), [
    [1, 12, '2026-08-01'], // second workout's 12
    [2, 9, '2026-08-01'],  // first workout: both sets ≥ 9; the second only managed 8
    [3, 7, '2026-08-01'],
  ]);
  assert.deepEqual(recs.get(2).sets.map(s => s.reps), [10, 9]);
  // Monotonically decreasing by construction.
  const vals = [...recs.values()].map(r => r.value);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] <= vals[i - 1]);
});

test('set-numbered PRs: a set earns a trophy when it lifts any set-count threshold past the record', () => {
  const sets = [
    set('2026-08-01', 0, 10, { level: 1 }), // first workout: nothing to beat
    set('2026-08-01', 0, 8, { level: 2 }),
    set('2026-08-01', 0, 12, { level: 3 }), // 12 for 1 set beats this workout's 10
    set('2026-08-03', 0, 11, { level: 1 }), // 11 < 12
    set('2026-08-03', 0, 11, { level: 2 }), // 11 for 2 sets beats 10
    set('2026-08-03', 0, 8, { level: 3 }),  // 8 for 3 sets ties, not a PR
    set('2026-08-05', 0, 9, { level: 1 }),
    set('2026-08-05', 0, 9, { level: 2 }),
    set('2026-08-05', 0, 9, { level: 3 }),  // 9 for 3 sets beats 8
    set('2026-08-05', 0, 6, { level: 4 }),  // first ever 4th set: no record to beat
  ];
  const prs = computePRIds(sets, 'level_reps', 'set');
  assert.deepEqual([...prs].sort((a, b) => a - b), [sets[2].id, sets[4].id, sets[8].id]);
  // levelKind defaults to set-number semantics, matching the app's default.
  assert.deepEqual([...computePRIds(sets, 'level_reps')], [...prs]);
});

test('set-numbered timed exercises use time as the value', () => {
  const sets = [
    set('2026-08-01', 0, 0, { level: 1, time: 60 }),
    set('2026-08-01', 0, 0, { level: 2, time: 45 }),
    set('2026-08-03', 0, 0, { level: 1, time: 50 }),
    set('2026-08-03', 0, 0, { level: 2, time: 50 }), // 50 for 2 sets beats 45
  ];
  const recs = setCountRecords(sets, 'level_time');
  assert.deepEqual([...recs].map(([n, r]) => [n, r.value, r.date]), [[1, 60, '2026-08-01'], [2, 50, '2026-08-03']]);
  assert.deepEqual([...computePRIds(sets, 'level_time', 'set')], [sets[3].id]);
});

test('cardio PRs: longest distance ever; duration-only sets track time', () => {
  const sets = [
    set('2026-01-01', 0, 0, { distance: 3000 }),
    set('2026-01-05', 0, 0, { distance: 5000 }), // PR
    set('2026-01-08', 0, 0, { distance: 4000 }),
    set('2026-01-10', 0, 0, { time: 1200 }),
    set('2026-01-12', 0, 0, { time: 1500 }),     // PR
  ];
  const prs = computePRIds(sets, 'distance_time');
  assert.deepEqual([...prs].sort(), [sets[1].id, sets[4].id].sort());
});

console.log(`${passed} tests passed`);
