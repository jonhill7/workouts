// Unit tests for PR/trophy detection and the Records tab tables.
// Run: node tests/records.test.mjs
import { strict as assert } from 'node:assert';
import { KG_PER_LB, convertToLevel } from '../app/js/importer.js';
import { computePRIds, repRecords } from '../app/js/records.js';

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

test('proxy-encoded data converted to level_reps gets trophies on rep improvements', () => {
  const sets = lungesProxy().map(s => convertToLevel('weight_lbs', s));
  const prs = computePRIds(sets, 'level_reps');
  const flagged = sets.filter(s => prs.has(s.id)).map(s => `${s.date}#${s.level}`);
  assert.deepEqual(flagged, [
    '2016-10-19#2', // 60 reps beats 50 on set 2
    '2016-10-27#1', // 75 beats 50 on set 1
    '2016-10-27#2', // 65 beats 60 on set 2
    '2016-10-31#2', // 80 beats 65 on set 2
    '2016-10-31#3', // 90 beats 50 on set 3
    '2016-11-08#1', // 80 beats 75 on set 1
  ]);
});

test('unconverted proxy data still yields records rows for its high rep counts', () => {
  const recs = repRecords(lungesProxy());
  assert.deepEqual([...recs.keys()].sort((a, b) => a - b), [50, 60, 65, 75, 80, 90]);
});

test('level PRs compare within a level only, first set per level never counts', () => {
  const sets = [
    set('2026-08-01', 0, 30, { level: 1 }),
    set('2026-08-01', 0, 22, { level: 2 }),
    set('2026-08-03', 0, 31, { level: 1 }), // PR
    set('2026-08-03', 0, 22, { level: 2 }), // tie: not a PR
  ];
  const prs = computePRIds(sets, 'level_reps');
  assert.deepEqual([...prs], [sets[2].id]);
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
