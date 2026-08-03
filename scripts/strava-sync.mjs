#!/usr/bin/env node
// Strava → repo sync. Runs in GitHub Actions on a schedule: refreshes the
// OAuth token, fetches activities, and writes app/data/strava.json which the
// PWA merges into its local log. Pure helpers are exported for unit tests.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPORT_MAP = {
  Run: 'Running',
  TrailRun: 'Trail Running',
  VirtualRun: 'Running (Treadmill)',
  Walk: 'Walking',
  Hike: 'Hiking',
  Ride: 'Cycling',
  VirtualRide: 'Cycling (Indoor)',
  EBikeRide: 'E-Bike Ride',
  EMountainBikeRide: 'E-Bike Ride',
  MountainBikeRide: 'Mountain Biking',
  GravelRide: 'Gravel Ride',
  Swim: 'Swimming',
  Rowing: 'Rowing',
  Elliptical: 'Elliptical Trainer',
  StairStepper: 'Stair Machine',
  InlineSkate: 'Inline Skating',
  IceSkate: 'Ice Skating',
  NordicSki: 'Nordic Skiing',
  AlpineSki: 'Alpine Skiing',
  Snowshoe: 'Snowshoeing',
  Kayaking: 'Kayaking',
  Canoeing: 'Canoeing',
  StandUpPaddling: 'Paddleboarding',
};

// Strength/gym activities stay out — that data is logged in the app itself.
const EXCLUDE = new Set(['WeightTraining', 'Workout', 'Yoga', 'Crossfit', 'HighIntensityIntervalTraining']);

export function mapActivity(a, includeNames = false) {
  const sport = a.sport_type || a.type || 'Workout';
  if (EXCLUDE.has(sport)) return null;
  const exercise = SPORT_MAP[sport] || String(sport).replace(/([a-z])([A-Z])/g, '$1 $2');
  return {
    id: a.id,
    date: String(a.start_date_local || a.start_date || '').slice(0, 10),
    exercise,
    distanceM: Math.round(a.distance || 0),
    timeSec: Math.round(a.moving_time || a.elapsed_time || 0),
    comment: includeNames ? (a.name || '') : '',
  };
}

export function mergeActivities(oldList, freshList) {
  const byId = new Map(oldList.map(x => [x.id, x]));
  for (const f of freshList) byId.set(f.id, f);
  return [...byId.values()].sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : x.id - y.id);
}

async function main() {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    console.log('Strava secrets not configured — skipping sync. See README to connect Strava.');
    return;
  }
  const includeNames = process.env.STRAVA_INCLUDE_NAMES === 'true';

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token refresh failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json();

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = join(here, '..', 'app', 'data', 'strava.json');
  let existing = { activities: [] };
  try { existing = JSON.parse(readFileSync(outPath, 'utf8')); } catch { /* first run */ }

  // Incremental after the first run: re-fetch a 30-day overlap so late edits
  // and late uploads are picked up; the id-merge keeps it idempotent.
  let after = 0;
  if (existing.activities.length) {
    const last = existing.activities[existing.activities.length - 1].date;
    after = Math.floor(Date.parse(last + 'T00:00:00Z') / 1000) - 30 * 86_400;
  }

  const fresh = [];
  for (let page = 1; ; page++) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    if (after > 0) url.searchParams.set('after', String(after));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) throw new Error(`Activity fetch failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const a of batch) {
      const m = mapActivity(a, includeNames);
      if (m && m.date && (m.distanceM > 0 || m.timeSec > 0)) fresh.push(m);
    }
    if (batch.length < 200) break;
  }

  const merged = mergeActivities(existing.activities, fresh);
  const out = JSON.stringify({ updatedAt: new Date().toISOString(), activities: merged });
  const changed = merged.length !== existing.activities.length ||
    JSON.stringify(existing.activities) !== JSON.stringify(merged);
  if (changed) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, out);
  }
  console.log(`Fetched ${fresh.length} activities; total ${merged.length}; ${changed ? 'file updated' : 'no changes'}.`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
