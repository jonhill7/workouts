# Workout Log

A local-first recreation of the Android FitNotes app as an installable PWA.
All data lives on your phone (IndexedDB) — no accounts, no cloud database, no
server. New features ship by pushing to this repo; the deployed app updates
itself on the next launch.

## How it works

- **`app/`** — the entire application: plain HTML/CSS/JS modules, no build
  step, no dependencies. Open `app/index.html` over any static server and it
  runs.
- **`.github/workflows/deploy.yml`** — runs the tests on every push, then
  deploys `app/` to GitHub Pages from `main` once they pass (or manually via
  the Actions tab → *Test and deploy* → *Run workflow*).
- **`app/sw.js`** — service worker; precaches everything so the app works fully
  offline. Each deploy stamps the commit onto its `VERSION`, so installed
  phones pick up the new build (an "Update ready" toast offers a one-tap
  reload).

## First-time setup

1. Merge this branch to `main` (or run the deploy workflow manually). The
   workflow enables GitHub Pages automatically; the app lands at
   `https://<user>.github.io/workouts/`.
2. Open that URL in Chrome on your phone → menu → **Add to Home screen** →
   **Install**. Installing also lets the browser grant persistent storage so
   your data can't be evicted.

## Importing your FitNotes data

1. In FitNotes: **Settings → Data Management → Export Workout Data** (CSV).
2. Get the file onto your phone's storage (it already is) or your PC.
3. In Workout Log: **⚙ Settings → Import FitNotes CSV export** and pick the
   file.

Both known FitNotes CSV layouts are supported (the old
`Weight (kgs)`/`Weight (lbs)` header and the newer `Weight,Weight Unit,…,Comment`
one). Import is **idempotent**: re-importing the same file skips duplicates
(matching is by full-value multiset, so two genuinely identical sets in one
workout are preserved).

Alternatively, **Import .fitnotes backup** reads FitNotes' full backup file
(Settings → Data Management → Backup) — a SQLite database opened in-browser
via the vendored sql.js/WASM engine. It imports logged sets (deduped against
any prior CSV import), per-exercise notes, and routines.

## Features

- Daily workout log with date navigation and a calendar (workout days get a
  dot sized by effort — sets count 1 each, timed/cardio sets count by
  duration at ~6 min per set); log weight×reps or distance/time (cardio)
  sets with comments
- Exercise catalog grouped by category, search, custom exercises/categories,
  per-exercise notes (setup, seat height…), workout-count + recency stats,
  and A–Z / Recent / Most-used sorting
- **PR detection**: 🏆 marks any set that beats your previous best weight at
  the same or higher reps (longest distance/duration for cardio), with a
  toast the moment you log one
- **Guided classes**: five preloaded class-style programs — 💪 *Total Body*,
  🏋️ *Pump* (high-rep sculpt), 🧘 *Flow* (stretch & mobility), 🎯 *Core*, and
  ❤️‍🔥 *Burn* (cardio intervals) — each in three difficulty levels (Beginner
  4 weeks, Intermediate 6, Advanced 8; all home-friendly, reps ramp up
  weekly and never regress). Open a class from the Routines screen, pick a
  level, tap **Continue**, and today's workout is a checklist: every
  exercise with its sets × reps laid out, one tap-to-check circle per set.
  Checked sets are logged as normal history (rest timer runs between them),
  a day is marked complete when all its circles are green, and course
  progress shows as a per-week grid of days. Classes are officially started
  ("Start this class") and finished: the current class is pinned to the
  workout-log screen with its next workout, weekly count (e.g. 2 of 3 this
  week) and a streak flame (same momentum rules as routines); finishing the
  last day completes the class, and "Take a break" unpins it while keeping
  progress for a later rejoin
- **Routines**: ordered exercise lists (📋 on the log screen), each exercise
  with a target set count (editable via its ×N chip; FitNotes backups import
  their template set counts). The routine screen shows today's progress bar
  and per-exercise ✓ (target met) / ◐ (in progress) marks
- **Routine tracking & momentum**: a day is a full completion when every
  target set is logged, and a partial completion at ≥80% of the routine's
  sets — computed from history, so edits and imports count retroactively.
  The routines list shows lifetime completions (full + partial) plus the
  current streak — completions no more than 7 days apart, partials keep it
  alive — with a flame badge that glows brighter and hotter as the streak
  grows (up to a 50-streak)
- **Workout Score bars**: every workout gets one Score per exercise, its best
  single set (set count doesn't matter): estimated 1RM for weight × reps (most
  reps if never weighted), a 5K-equivalent speed for distance/time (Riegel's
  formula; longest distance or time when no set has both), most reps / longest
  time in one set for set-numbered exercises, and best reps/time at the latest
  workout's level for resistance levels. Exercises done in the last 4 weeks
  (green and orange dots) show a bar in the exercise list: green fill up to the
  best recent Score, a tick per recent workout (darker and taller = newer), a
  blue ▼ for the 12-month best and a red ▲ for the all-time best. The bar runs
  from 50% of your all-time best Score to the all-time best
  The Score also appears beside each day on the History tab and is the
  default metric on the Graph tab (cardio graphs it as 5K-equivalent speed)
- Per-exercise **History**, **Graph** (max weight, est. 1RM, volume, reps —
  or distance/time/pace for cardio; 3M/6M/1Y/All ranges), and **Records**
  (PRs, rep records table — a set counts toward its own rep count and every
  lower one, so 100 × 10 also sets your 9-rep record to at least 100)
- **Set-number / resistance-level tracking**: two extra exercise types log a
  unit-less integer **level** alongside reps or time — "Set/Level × Reps" for
  bodyweight work tracked by set number or by band strength, and
  "Level / Time" for machine resistance (elliptical, bike). For resistance
  levels, Records and 🏆 PRs compare within the same level. For set numbers
  they're per workout, by set count: 10, 8, 12 reps is 12 for 1 set, 10 for
  2 sets and 8 for 3 sets, so each row is the most reps every one of N sets
  reached in a single workout (always non-increasing down the table). A set
  number that doesn't go up starts a new workout, so two sessions logged on
  one day count independently. The tracker auto-advances the set number as
  you log
- **Proxy conversion for FitNotes refugees**: FitNotes can't track a set
  number or resistance, so a common workaround was logging it in the weight
  or distance field (weight "2 lbs" = 2nd set, distance "8 m" = resistance 8).
  Switch such an exercise to a level type (edit it via ⋮) and the app offers
  to convert its history in one tap — you pick which field/unit encoded the
  level. The choice is saved on the exercise, so **every future CSV or
  .fitnotes import converts those rows automatically** (and stays
  duplicate-safe), and CSV exports write the level back through the same
  field, keeping them FitNotes-compatible
- Rest timer with vibration
- kg/lbs display toggle (stored metric internally, like FitNotes)
- Works fully offline; light + dark theme

## Backups

Silent cloud backup would need the auth/server stack this project deliberately
avoids, so backups are one tap instead:

- **Backup reminder** (daily/weekly, configurable): a banner appears on the log
  screen when a backup is due — tap **Save** to download a JSON snapshot, or
  **Share…** to send it straight to Google Drive / Gmail via the Android share
  sheet.
- **Settings → Download backup (JSON)** — complete snapshot, restorable via
  *Restore JSON backup* (exact replace).
- **Settings → Export CSV** — FitNotes-compatible, so you can always go back
  or analyze in a spreadsheet.

## Development

```sh
for f in tests/*.test.mjs; do node "$f"; done   # unit tests (importer, .fitnotes parser,
                                                # streaks, courses, records, levels)
node tests/smoke.e2e.mjs                        # end-to-end smoke test (needs playwright)
python3 -m http.server -d app 8000              # run locally at http://localhost:8000
```

The smoke test (`tests/smoke.e2e.mjs`) serves `app/` itself and drives headless
Chromium through boot → log a set → CSV import → graph → CSV export → offline
reload from the service worker. The offline step fails if a file is missing
from `sw.js`'s precache list. It needs the `playwright` package and a Chromium:
`npm i --no-save playwright && npx playwright install chromium`.

`.github/workflows/deploy.yml` runs the unit tests and the smoke test on every
push and pull request; it deploys to Pages only from `main`, and only after
they pass.

### Release checklist

1. Make changes under `app/`. A new file under `app/` also goes in `sw.js`'s
   `ASSETS` list (the smoke test's offline step catches a missing one).
2. Optionally bump `APP_VERSION` in `app/js/app.js` and `VERSION` in
   `app/sw.js` for a new visible version number. Phones update either way:
   the deploy stamps the commit onto the service worker's version.
3. Push to `main` → tests run → Pages deploys → phone shows "Update ready" on
   next open.

## Roadmap ideas

- Analytics dashboard (weekly volume per category, streaks, year heatmap,
  recent-PR feed)
- Body-weight & measurement tracking with graphs
- Supersets
- PWA share-target so FitNotes/Files can "share" a CSV straight into the app
- Optional Google Drive API sync for true automatic backup
