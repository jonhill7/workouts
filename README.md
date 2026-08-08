# Workout Log

A local-first recreation of the Android FitNotes app as an installable PWA.
All data lives on your phone (IndexedDB) — no accounts, no cloud database, no
server. New features ship by pushing to this repo; the deployed app updates
itself on the next launch.

## How it works

- **`app/`** — the entire application: plain HTML/CSS/JS modules, no build
  step, no dependencies. Open `app/index.html` over any static server and it
  runs.
- **`.github/workflows/deploy.yml`** — deploys `app/` to GitHub Pages on every
  push to `main` (or manually via the Actions tab → *Deploy to GitHub Pages* →
  *Run workflow*).
- **`app/sw.js`** — service worker; precaches everything so the app works fully
  offline. Bump `VERSION` when releasing so installed phones pick up the new
  build (an "Update ready" toast offers a one-tap reload).

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
  dot sized by set count); log weight×reps or distance/time (cardio) sets
  with comments
- Exercise catalog grouped by category, search, custom exercises/categories,
  per-exercise notes (setup, seat height…), workout-count + recency stats,
  and A–Z / Recent / Most-used sorting
- **PR detection**: 🏆 marks any set that beats your previous best weight at
  the same or higher reps (longest distance/duration for cardio), with a
  toast the moment you log one
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
- Per-exercise **History**, **Graph** (max weight, est. 1RM, volume, reps —
  or distance/time/pace for cardio; 3M/6M/1Y/All ranges), and **Records**
  (PRs, rep records table)
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
node tests/importer.test.mjs        # unit tests for the CSV import logic
node tests/fitnotes-db.test.mjs     # unit tests for the .fitnotes SQLite parser
node tests/streaks.test.mjs         # unit tests for routine completion/streaks
python3 -m http.server -d app 8000  # run locally at http://localhost:8000
```

The end-to-end smoke test (Playwright) lives in session scratch space; it
drives boot → log set → import → graph → export round-trip.

### Release checklist

1. Make changes under `app/`.
2. Bump `VERSION` in `app/sw.js` (and `APP_VERSION` in `app/js/app.js`).
3. `node tests/importer.test.mjs`.
4. Push to `main` → Pages deploys → phone shows "Update ready" on next open.

## Roadmap ideas

- Analytics dashboard (weekly volume per category, streaks, year heatmap,
  recent-PR feed)
- Body-weight & measurement tracking with graphs
- Supersets
- PWA share-target so FitNotes/Files can "share" a CSV straight into the app
- Optional Google Drive API sync for true automatic backup
