// Unit tests for the guided-course definitions and helpers.
import assert from 'node:assert/strict';
import {
  PROGRAMS, COURSES, COURSE_EXERCISES, programById, courseById, programOfCourse,
  dayLabel, daySetCount, blockTarget, nextDayIndex,
  courseDoneDates, courseStreak, weekCount,
} from '../app/js/courses.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

test('course ids are unique and lookup works', () => {
  const ids = COURSES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of COURSES) assert.equal(courseById(c.id), c);
  assert.equal(courseById('nope'), null);
});

test('programs each offer three ordered difficulty levels', () => {
  assert.ok(PROGRAMS.length >= 5);
  const pids = PROGRAMS.map(p => p.id);
  assert.equal(new Set(pids).size, pids.length);
  for (const p of PROGRAMS) {
    assert.equal(programById(p.id), p);
    assert.ok(p.name && p.emoji && p.tagline && p.description, p.id);
    assert.equal(p.levels.length, 3, `${p.id} has 3 levels`);
    p.levels.forEach((c, i) => {
      assert.equal(c.level, i + 1, `${c.id} level number`);
      assert.equal(c.levelLabel, ['Beginner', 'Intermediate', 'Advanced'][i], c.id);
    });
    for (let i = 1; i < 3; i++) {
      assert.ok(p.levels[i].weeks >= p.levels[i - 1].weeks, `${p.id} levels get longer`);
    }
  }
  assert.equal(programById('nope'), null);
});

test('original course ids survive the program restructure (progress compat)', () => {
  for (const id of ['fresh-start', 'momentum', 'unstoppable']) {
    assert.ok(courseById(id), id);
  }
  assert.deepEqual(programById('total-body').levels.map(c => c.id),
    ['fresh-start', 'momentum', 'unstoppable']);
});

test('every course expands to weeks × daysPerWeek days', () => {
  assert.ok(COURSES.length >= 3);
  for (const c of COURSES) {
    assert.ok(c.weeks >= 2, `${c.id} spans multiple weeks`);
    assert.equal(c.days.length, c.weeks * c.daysPerWeek, c.id);
    assert.ok(c.name && c.tagline && c.description && c.emoji, c.id);
    assert.ok(c.rest > 0 && c.warmup && c.cooldown, c.id);
  }
});

test('every block is well-formed and its exercise is defined', () => {
  for (const c of COURSES) {
    for (const [i, day] of c.days.entries()) {
      assert.ok(day.title, `${c.id} day ${i} has a title`);
      assert.ok(day.blocks.length >= 3, `${c.id} day ${i} has enough blocks`);
      for (const b of day.blocks) {
        const spec = COURSE_EXERCISES[b.name];
        assert.ok(spec, `${c.id}: "${b.name}" is in COURSE_EXERCISES`);
        assert.ok(spec.category, `${b.name} has a category`);
        assert.ok(Number.isInteger(b.sets) && b.sets >= 1 && b.sets <= 5, `${c.id} ${b.name} sets`);
        if (spec.timed) {
          assert.ok(b.seconds >= 10 && b.seconds <= 180 && b.reps === undefined,
            `${c.id} ${b.name} prescribes sane seconds`);
        } else {
          assert.ok(b.reps >= 1 && b.reps <= 60 && b.seconds === undefined,
            `${c.id} ${b.name} prescribes sane reps`);
        }
      }
    }
  }
});

test('no exercise appears twice within one day (check-off state is per exercise)', () => {
  for (const c of COURSES) {
    for (const [i, day] of c.days.entries()) {
      const names = day.blocks.map(b => b.name);
      assert.equal(new Set(names).size, names.length, `${c.id} day ${i}`);
    }
  }
});

test('weekly progression never goes backwards', () => {
  for (const c of COURSES) {
    for (let d = 0; d < c.daysPerWeek; d++) {
      for (let w = 1; w < c.weeks; w++) {
        const prev = c.days[(w - 1) * c.daysPerWeek + d];
        const cur = c.days[w * c.daysPerWeek + d];
        assert.equal(cur.title, prev.title);
        assert.equal(cur.blocks.length, prev.blocks.length);
        for (let b = 0; b < cur.blocks.length; b++) {
          assert.equal(cur.blocks[b].name, prev.blocks[b].name);
          const vol = x => x.sets * (x.seconds ?? x.reps);
          assert.ok(vol(cur.blocks[b]) >= vol(prev.blocks[b]),
            `${c.id} week ${w + 1} ${cur.blocks[b].name} >= week ${w}`);
        }
      }
    }
  }
});

test('dayLabel maps indexes to week/day', () => {
  const c = COURSES[0];
  assert.equal(dayLabel(c, 0), 'Week 1 · Day 1');
  assert.equal(dayLabel(c, c.daysPerWeek - 1), `Week 1 · Day ${c.daysPerWeek}`);
  assert.equal(dayLabel(c, c.daysPerWeek), 'Week 2 · Day 1');
});

test('daySetCount and blockTarget', () => {
  assert.equal(daySetCount({ blocks: [{ sets: 2, reps: 10 }, { sets: 3, seconds: 20 }] }), 5);
  assert.equal(blockTarget({ sets: 3, reps: 12 }), '3 × 12');
  assert.equal(blockTarget({ sets: 2, seconds: 30 }), '2 × 30s');
  for (const c of COURSES) for (const day of c.days) assert.ok(daySetCount(day) > 0);
});

test('nextDayIndex walks completed days', () => {
  const c = COURSES[0];
  assert.equal(nextDayIndex(c, {}), 0);
  assert.equal(nextDayIndex(c, undefined), 0);
  assert.equal(nextDayIndex(c, { 0: '2026-01-01', 1: '2026-01-03' }), 2);
  assert.equal(nextDayIndex(c, { 1: '2026-01-03' }), 0);
  const all = {};
  for (let i = 0; i < c.days.length; i++) all[i] = '2026-01-01';
  assert.equal(nextDayIndex(c, all), -1);
});

test('programOfCourse finds the parent program', () => {
  assert.equal(programOfCourse('fresh-start').id, 'total-body');
  assert.equal(programOfCourse('inferno').id, 'burn');
  assert.equal(programOfCourse('nope'), null);
  for (const c of COURSES) assert.ok(programOfCourse(c.id));
});

test('courseDoneDates sorts and keeps duplicates', () => {
  assert.deepEqual(courseDoneDates({ 1: '2026-01-07', 0: '2026-01-05', 2: '2026-01-07' }),
    ['2026-01-05', '2026-01-07', '2026-01-07']);
  assert.deepEqual(courseDoneDates(undefined), []);
});

test('courseStreak chains completions like routine streaks', () => {
  assert.equal(courseStreak({}, '2026-01-10'), 0);
  assert.equal(courseStreak({ 0: '2026-01-01', 1: '2026-01-05' }, '2026-01-10'), 2);
  // last completion more than 7 days ago → streak is dead
  assert.equal(courseStreak({ 0: '2026-01-01', 1: '2026-01-05' }, '2026-01-20'), 0);
  // a >7-day gap breaks the chain; only the recent side counts
  assert.equal(courseStreak({ 0: '2026-01-01', 1: '2026-01-15' }, '2026-01-16'), 1);
});

test('weekCount counts completions in the Mon–Sun week of today', () => {
  // 2026-01-05 is a Monday
  const days = { 0: '2026-01-04', 1: '2026-01-05', 2: '2026-01-07' };
  assert.equal(weekCount(days, '2026-01-11'), 2); // Sunday: Mon+Wed count, prior Sun doesn't
  assert.equal(weekCount(days, '2026-01-05'), 1); // Monday itself: Wed hasn't happened yet
  assert.equal(weekCount(days, '2026-01-04'), 1); // prior week's Sunday sees only its own week
  assert.equal(weekCount({}, '2026-01-11'), 0);
});

console.log(`\n${passed} tests passed`);
