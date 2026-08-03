// Unit tests for the Strava sync mapping/merge helpers. Run: node tests/strava.test.mjs
import { strict as assert } from 'node:assert';
import { mapActivity, mergeActivities } from '../scripts/strava-sync.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

test('maps a run with local date, meters, moving time', () => {
  const m = mapActivity({
    id: 111, sport_type: 'Run', start_date_local: '2026-08-01T07:15:00Z',
    distance: 5003.7, moving_time: 1561, elapsed_time: 1700, name: 'Morning Run',
  });
  assert.deepEqual(m, {
    id: 111, date: '2026-08-01', exercise: 'Running',
    distanceM: 5004, timeSec: 1561, comment: '',
  });
});

test('includeNames keeps the activity title as comment', () => {
  const m = mapActivity({ id: 1, sport_type: 'Ride', start_date_local: '2026-08-01T07:15:00Z', distance: 100, moving_time: 60, name: 'Hill repeats' }, true);
  assert.equal(m.comment, 'Hill repeats');
});

test('sport types map to friendly exercise names', () => {
  const at = t => mapActivity({ id: 1, sport_type: t, start_date_local: '2026-08-01T00:00:00Z', distance: 1, moving_time: 1 }).exercise;
  assert.equal(at('Ride'), 'Cycling');
  assert.equal(at('VirtualRide'), 'Cycling (Indoor)');
  assert.equal(at('TrailRun'), 'Trail Running');
  assert.equal(at('StandUpPaddling'), 'Paddleboarding');
  assert.equal(at('BackcountrySki'), 'Backcountry Ski'); // unmapped → spaced
});

test('strength/gym activities are excluded', () => {
  assert.equal(mapActivity({ id: 1, sport_type: 'WeightTraining', start_date_local: '2026-08-01T00:00:00Z' }), null);
  assert.equal(mapActivity({ id: 2, sport_type: 'Yoga', start_date_local: '2026-08-01T00:00:00Z' }), null);
});

test('merge dedupes by id, keeps newest version, sorts by date', () => {
  const old = [
    { id: 1, date: '2026-07-01', exercise: 'Running', distanceM: 5000, timeSec: 1500, comment: '' },
    { id: 2, date: '2026-07-03', exercise: 'Cycling', distanceM: 20000, timeSec: 3600, comment: '' },
  ];
  const fresh = [
    { id: 2, date: '2026-07-03', exercise: 'Cycling', distanceM: 20500, timeSec: 3700, comment: '' }, // edited
    { id: 3, date: '2026-07-02', exercise: 'Running', distanceM: 8000, timeSec: 2400, comment: '' },
  ];
  const merged = mergeActivities(old, fresh);
  assert.deepEqual(merged.map(m => m.id), [1, 3, 2]);
  assert.equal(merged.find(m => m.id === 2).distanceM, 20500);
});

console.log(`\n${passed} tests passed`);
