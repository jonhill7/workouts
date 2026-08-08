import * as db from './db.js';
import { KG_PER_LB, parseFitNotesCSV, setKey, inferType, timeToString, parseTimeToSeconds } from './importer.js';
import { loadSqlJs, looksLikeSQLite, parseFitNotesDB } from './fitnotes-db.js';
import * as exporter from './exporter.js';
import { renderLineChart } from './charts.js';
import {
  routineStats, routineItems, dayProgress, glowLevel,
  MAX_GAP_DAYS, DEFAULT_SETS, PARTIAL_THRESHOLD,
} from './streaks.js';

export const APP_VERSION = '1.6.0';

// ---------------------------------------------------------------------------
// Small DOM + formatting helpers

const $app = () => document.getElementById('app');

// Monochrome Material-style icons drawn in currentColor, so they inherit the
// app bar's white (or a list's gray) instead of rendering as colorful emoji.
const ICONS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  calendar: 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
  routines: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 4h6v2h-6V7zm0 4h6v2h-6v-2zm0 4h6v2h-6v-2zM7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  today: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8h-1.5z',
  pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  flame: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z',
};

const icon = name =>
  `<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, ms = 2500) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, ms);
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal-sheet" role="dialog">${html}</div>`;
  root.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  return { el: backdrop.firstElementChild, close };
}

function confirmDialog({ title, body, okLabel = 'OK', danger = false }) {
  return new Promise(resolve => {
    const { el, close } = openModal(`
      <h3>${esc(title)}</h3>
      <p class="modal-body">${esc(body)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okLabel)}</button>
      </div>`);
    el.querySelector('[data-act=cancel]').onclick = () => { close(); resolve(false); };
    el.querySelector('[data-act=ok]').onclick = () => { close(); resolve(true); };
  });
}

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function fmtDateHeading(dateStr) {
  if (dateStr === todayStr()) return 'Today';
  if (dateStr === addDays(todayStr(), -1)) return 'Yesterday';
  if (dateStr === addDays(todayStr(), 1)) return 'Tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Settings (loaded once, written through)

const DEFAULT_SETTINGS = {
  unit: 'lbs',            // 'kg' | 'lbs'
  weightIncrement: 5,     // in display units
  restSeconds: 90,
  autoBackup: 'weekly',   // 'off' | 'daily' | 'weekly'
  exSort: 'az',           // exercise list order: 'az' | 'recent' | 'most'
  lastBackupAt: 0,
  backupSnoozedUntil: 0,
  seeded: false,
};

const S = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  for (const row of await db.getAll('settings')) S[row.key] = row.value;
}

async function setSetting(key, value) {
  S[key] = value;
  await db.put('settings', { key, value });
}

const getUnit = () => S.unit;
const isMetric = () => S.unit === 'kg';

function kgToDisplay(kg) { return isMetric() ? kg : kg / KG_PER_LB; }
function displayToKg(v) { return isMetric() ? v : v * KG_PER_LB; }

function fmtNum(v, decimals = 2) {
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return String(parseFloat(r.toFixed(decimals)));
}

function fmtWeight(kg) { return fmtNum(kgToDisplay(kg)); }
function distUnitLabel() { return isMetric() ? 'km' : 'mi'; }
function mToDisplayDist(m) { return isMetric() ? m / 1000 : m / 1609.344; }
function displayDistToM(v) { return isMetric() ? v * 1000 : v * 1609.344; }

// FitNotes shows sets as two columns: "185 lbs | 8 reps" (or distance | time).
function describeCols(s, type) {
  if (type === 'distance_time') {
    return [
      s.distance > 0 ? `${fmtNum(mToDisplayDist(s.distance))} ${distUnitLabel()}` : '—',
      s.time > 0 ? timeToString(s.time) : '—',
    ];
  }
  return [`${fmtWeight(s.weight)} ${getUnit()}`, `${s.reps} reps`];
}

function setRowHTML(s, type, i, extra = '', isPR = false) {
  const [a, b] = describeCols(s, type);
  return `
    <div class="set-row ${extra}" ${extra ? `data-set="${s.id}"` : ''}>
      <span class="set-num">${i + 1}</span>
      <span class="set-w">${esc(a)}</span>
      <span class="set-r">${esc(b)}</span>
      <span class="set-flags">${isPR ? '<span class="pr-flag" title="Personal record">🏆</span>' : ''}${s.comment ? '<span class="set-comment-dot" title="has comment">✎</span>' : ''}</span>
    </div>`;
}

function est1RM(weightKg, reps) {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30); // Epley
}

// PR detection. Walk the exercise's sets in chronological order; a strength
// set is a PR when its weight beats every earlier weight lifted for the same
// or more reps ("you've never lifted this much for this many reps"). Cardio:
// longest distance ever (or longest duration for distance-less sets). The
// very first record for an exercise never counts.
function computePRIds(sortedSets, type) {
  const ids = new Set();
  if (type === 'distance_time') {
    let bestDist = 0, bestTime = 0;
    for (const s of sortedSets) {
      if (s.distance > 0) {
        if (bestDist > 0 && s.distance > bestDist) ids.add(s.id);
        bestDist = Math.max(bestDist, s.distance);
      } else if (s.time > 0) {
        if (bestTime > 0 && s.time > bestTime) ids.add(s.id);
        bestTime = Math.max(bestTime, s.time);
      }
    }
    return ids;
  }
  const bestByReps = new Map();
  for (const s of sortedSets) {
    if (!(s.weight > 0) || !(s.reps > 0)) continue;
    let prev = 0;
    for (const [r, w] of bestByReps) if (r >= s.reps && w > prev) prev = w;
    if (prev > 0 && s.weight > prev + 1e-9) ids.add(s.id);
    if (s.weight > (bestByReps.get(s.reps) || 0)) bestByReps.set(s.reps, s.weight);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seed data (FitNotes-style defaults; imports merge by name)

const SEED = {
  Shoulders: ['Overhead Press', 'Seated Dumbbell Press', 'Lateral Dumbbell Raise', 'Rear Delt Fly', 'Face Pull', 'Arnold Press'],
  Chest: ['Flat Barbell Bench Press', 'Incline Barbell Bench Press', 'Flat Dumbbell Bench Press', 'Incline Dumbbell Bench Press', 'Cable Crossover', 'Dip', 'Push Up'],
  Back: ['Deadlift', 'Pull Up', 'Chin Up', 'Barbell Row', 'Seated Cable Row', 'Lat Pulldown', 'One-Arm Dumbbell Row'],
  Biceps: ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'EZ-Bar Curl', 'Preacher Curl'],
  Triceps: ['Close Grip Bench Press', 'Skullcrusher', 'Cable Pushdown', 'Overhead Triceps Extension'],
  Legs: ['Barbell Squat', 'Front Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Curl', 'Leg Extension', 'Walking Lunge', 'Standing Calf Raise'],
  Abs: ['Crunch', 'Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Ab Wheel Rollout'],
  Cardio: ['Running', 'Walking', 'Cycling', 'Rowing Machine', 'Elliptical Trainer', 'Stair Machine'],
};

async function seedIfNeeded() {
  if (S.seeded) return;
  let seq = 0;
  for (const [catName, exercises] of Object.entries(SEED)) {
    const catId = await db.put('categories', { name: catName, nameLower: catName.toLowerCase(), sort: seq++ });
    const type = catName === 'Cardio' ? 'distance_time' : 'weight_reps';
    await db.bulkPut('exercises', exercises.map(name => ({
      name, nameLower: name.toLowerCase(), categoryId: catId, type,
    })));
  }
  await setSetting('seeded', true);
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Navigation: a view stack wired to browser history so the Android back
// button pops screens instead of leaving the app.

const state = {
  date: todayStr(),
  stack: [],
  pickFor: null, // { routineId, depth } while picking an exercise for a routine
};

function currentView() { return state.stack[state.stack.length - 1]; }
function rerender() { currentView()(); window.scrollTo(0, 0); }

function pushView(fn) {
  state.stack.push(fn);
  history.pushState({ depth: state.stack.length }, '');
  rerender();
}

function replaceView(fn) {
  state.stack[state.stack.length - 1] = fn;
  rerender();
}

window.addEventListener('popstate', e => {
  // Each pushed entry carries its stack depth, so multi-step history.go(-n)
  // jumps (used by the routine exercise picker) unwind correctly too.
  const depth = e.state?.depth || 1;
  state.stack.length = Math.max(1, Math.min(state.stack.length, depth));
  rerender();
});

function back() { history.back(); }

function header({ title, showBack = false, right = '' }) {
  return `
    <header class="topbar">
      ${showBack
        ? `<button class="icon-btn" data-nav="back" aria-label="Back">${icon('back')}</button>`
        : '<span class="topbar-spacer"></span>'}
      <div class="topbar-title">${title}</div>
      <div class="topbar-right">${right}</div>
    </header>`;
}

function wireHeader(root) {
  root.querySelector('[data-nav=back]')?.addEventListener('click', back);
}

// ---------------------------------------------------------------------------
// Data helpers

async function allCategories() {
  const cats = await db.getAll('categories');
  cats.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  return cats;
}

async function allExercises() {
  const ex = await db.getAll('exercises');
  ex.sort((a, b) => a.name.localeCompare(b.name));
  return ex;
}

async function setsForDate(date) {
  const sets = await db.getAllByIndex('sets', 'date', date);
  sets.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return sets;
}

async function setsForExercise(exerciseId) {
  const sets = await db.getAllByIndex('sets', 'exerciseId', exerciseId);
  sets.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
  return sets;
}

let seqCounter = 0;
function nextSeq() {
  seqCounter = Math.max(seqCounter + 1, Date.now());
  return seqCounter;
}

// ---------------------------------------------------------------------------
// Backup banner + export actions

function backupDue() {
  if (S.autoBackup === 'off') return false;
  if (Date.now() < (S.backupSnoozedUntil || 0)) return false;
  const period = S.autoBackup === 'daily' ? 1 : 7;
  return Date.now() - (S.lastBackupAt || 0) > period * 86_400_000;
}

async function gatherBackupData() {
  const [categories, exercises, sets, routines] = await Promise.all([
    db.getAll('categories'), db.getAll('exercises'), db.getAll('sets'), db.getAll('routines'),
  ]);
  return { categories, exercises, sets, routines };
}

async function doBackupDownload() {
  const data = await gatherBackupData();
  const json = exporter.buildJSONBackup({ ...data, settings: { ...S }, appVersion: APP_VERSION });
  exporter.download(`workout-backup-${exporter.dateStamp()}.json`, json, 'application/json');
  await setSetting('lastBackupAt', Date.now());
  toast('Backup saved to downloads');
}

async function doBackupShare() {
  const data = await gatherBackupData();
  const json = exporter.buildJSONBackup({ ...data, settings: { ...S }, appVersion: APP_VERSION });
  try {
    await exporter.shareFile(`workout-backup-${exporter.dateStamp()}.json`, json, 'application/json');
    await setSetting('lastBackupAt', Date.now());
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Share failed: ' + e.message);
  }
}

async function doExportCSV() {
  const data = await gatherBackupData();
  const csv = exporter.buildCSV({
    sets: data.sets, exercises: data.exercises, categories: data.categories, unit: getUnit(),
  });
  exporter.download(`workout-export-${exporter.dateStamp()}.csv`, csv, 'text/csv');
  await setSetting('lastBackupAt', Date.now());
  toast('CSV exported');
}

function backupBannerHTML() {
  if (!backupDue()) return '';
  return `
    <div class="banner" id="backup-banner">
      <div class="banner-text"><strong>Backup due.</strong> Save a copy of your workout data.</div>
      <div class="banner-actions">
        <button class="btn btn-small btn-primary" data-backup="save">Save</button>
        ${exporter.canShareFiles() ? '<button class="btn btn-small btn-ghost" data-backup="share">Share…</button>' : ''}
        <button class="btn btn-small btn-ghost" data-backup="later">Later</button>
      </div>
    </div>`;
}

function wireBackupBanner(root) {
  const banner = root.querySelector('#backup-banner');
  if (!banner) return;
  banner.querySelector('[data-backup=save]').onclick = async () => { await doBackupDownload(); banner.remove(); };
  banner.querySelector('[data-backup=share]')?.addEventListener('click', async () => { await doBackupShare(); banner.remove(); });
  banner.querySelector('[data-backup=later]').onclick = async () => {
    await setSetting('backupSnoozedUntil', Date.now() + 86_400_000);
    banner.remove();
  };
}

// ---------------------------------------------------------------------------
// Home screen — the daily workout log

async function renderHome() {
  const [sets, exercises, categories] = await Promise.all([
    setsForDate(state.date), allExercises(), allCategories(),
  ]);
  const exById = new Map(exercises.map(e => [e.id, e]));
  const catById = new Map(categories.map(c => [c.id, c]));

  // group sets by exercise, in first-logged order
  const groups = [];
  const byEx = new Map();
  for (const s of sets) {
    if (!byEx.has(s.exerciseId)) {
      const g = { exercise: exById.get(s.exerciseId), sets: [] };
      byEx.set(s.exerciseId, g);
      groups.push(g);
    }
    byEx.get(s.exerciseId).sets.push(s);
  }

  // PR trophies need each exercise's full history
  const prByEx = new Map();
  await Promise.all(groups.map(async g => {
    if (!g.exercise) return;
    prByEx.set(g.exercise.id, computePRIds(await setsForExercise(g.exercise.id), g.exercise.type));
  }));

  const groupsHtml = groups.map(g => {
    if (!g.exercise) return '';
    const prIds = prByEx.get(g.exercise.id) || new Set();
    const rows = g.sets.map((s, i) => setRowHTML(s, g.exercise.type, i, '', prIds.has(s.id))).join('');
    return `
      <div class="exercise-group" data-ex="${g.exercise.id}">
        <div class="wgroup-name">${esc(g.exercise.name)}</div>
        ${rows}
      </div>`;
  }).join('');

  $app().innerHTML = `
    ${header({
      title: 'Workout Log',
      right: `${state.date !== todayStr() ? `<button class="icon-btn" id="today-btn" title="Go to today">${icon('today')}</button>` : ''}
              <button class="icon-btn" id="routines-btn" aria-label="Routines">${icon('routines')}</button>
              <button class="icon-btn" id="cal-btn" aria-label="Pick date">${icon('calendar')}</button>
              <button class="icon-btn" id="settings-btn" aria-label="Settings">${icon('settings')}</button>`,
    })}
    <div class="datebar">
      <button class="arrow" data-day="-1" aria-label="Previous day">◀</button>
      <button class="date-btn" id="date-btn">${esc(fmtDateHeading(state.date))}</button>
      <button class="arrow" data-day="1" aria-label="Next day">▶</button>
    </div>
    <main class="content">
      ${backupBannerHTML()}
      ${groupsHtml || `
        <div class="empty-state">
          <p>Workout log is empty.</p>
          <p class="empty-sub">Press the + button to add an exercise.</p>
        </div>`}
      <div class="fab-space"></div>
    </main>
    <button class="fab" id="fab-add" aria-label="Add exercise">＋</button>`;

  const root = $app();
  wireBackupBanner(root);
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => {
    state.date = addDays(state.date, parseInt(b.dataset.day, 10));
    rerender();
  });
  root.querySelector('#date-btn').onclick = openCalendar;
  root.querySelector('#cal-btn').onclick = openCalendar;
  root.querySelector('#today-btn')?.addEventListener('click', () => { state.date = todayStr(); rerender(); });
  root.querySelector('#settings-btn').onclick = () => pushView(renderSettings);
  root.querySelector('#routines-btn').onclick = () => pushView(renderRoutines);
  root.querySelector('#fab-add').onclick = () => pushView(renderExercisePicker);
  root.querySelectorAll('.exercise-group').forEach(card => card.onclick = () => {
    const ex = exById.get(parseInt(card.dataset.ex, 10));
    if (ex) pushView(() => renderExercise(ex.id, 'track'));
  });
}

// ---------------------------------------------------------------------------
// Calendar — workout days get a dot, sized by how many sets were logged.

async function openCalendar() {
  const sets = await db.getAll('sets');
  const counts = new Map();
  for (const s of sets) counts.set(s.date, (counts.get(s.date) || 0) + 1);

  let view = state.date.slice(0, 7); // 'YYYY-MM'
  const { el, close } = openModal('<div id="cal-root"></div>');
  const root = el.querySelector('#cal-root');
  const p = n => String(n).padStart(2, '0');

  const draw = () => {
    const [y, m] = view.split('-').map(Number);
    const startDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<span class="cal-cell"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${p(m)}-${p(d)}`;
      const n = counts.get(ds) || 0;
      // GitHub-style intensity: shade the cell by how many sets were logged
      const tier = n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4;
      cells += `
        <button class="cal-cell cal-day${tier ? ` cal-h${tier}` : ''}${ds === state.date ? ' cal-selected' : ''}${ds === todayStr() ? ' cal-today' : ''}"
          data-date="${ds}" ${n ? `title="${n} sets"` : ''}>
          <span class="cal-num">${d}</span>
        </button>`;
    }
    root.innerHTML = `
      <div class="cal-head">
        <button class="icon-btn" data-cal="-1" aria-label="Previous month">‹</button>
        <span class="cal-title">${MONTHS[m - 1]} ${y}</span>
        <button class="icon-btn" data-cal="1" aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">
        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(w => `<span class="cal-cell cal-wd">${w}</span>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend">
        Fewer sets
        <span class="cal-swatch cal-h1"></span><span class="cal-swatch cal-h2"></span><span class="cal-swatch cal-h3"></span><span class="cal-swatch cal-h4"></span>
        More
      </div>`;
    root.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => {
      let ny = y, nm = m + parseInt(b.dataset.cal, 10);
      if (nm === 0) { nm = 12; ny--; }
      if (nm === 13) { nm = 1; ny++; }
      view = `${ny}-${p(nm)}`;
      draw();
    });
    root.querySelectorAll('.cal-day').forEach(b => b.onclick = () => {
      state.date = b.dataset.date;
      close();
      rerender();
    });
  };
  draw();
}

// ---------------------------------------------------------------------------
// Exercise picker

// Per-exercise usage: distinct workout days + most recent date.
async function exerciseStatsMap() {
  const sets = await db.getAll('sets');
  const map = new Map();
  for (const s of sets) {
    let st = map.get(s.exerciseId);
    if (!st) map.set(s.exerciseId, st = { days: new Set(), last: '' });
    st.days.add(s.date);
    if (s.date > st.last) st.last = s.date;
  }
  return map;
}

function recencyInfo(last) {
  const d = Math.max(0, Math.round((Date.parse(todayStr()) - Date.parse(last)) / 86_400_000));
  const label =
    d === 0 ? 'today' :
    d === 1 ? 'yesterday' :
    d < 14 ? `${d} days ago` :
    d < 60 ? `${Math.round(d / 7)} weeks ago` :
    d < 700 ? `${Math.round(d / 30)} months ago` :
    `${(d / 365).toFixed(1)} years ago`;
  const cls = d <= 7 ? 'rec-fresh' : d <= 28 ? 'rec-mid' : 'rec-old';
  return { label, cls };
}

const EX_SORTS = [['az', 'A–Z'], ['recent', 'Recent'], ['most', 'Most used']];

function sortExercises(list, stats, mode) {
  const cmp = {
    az: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) =>
      (stats.get(b.id)?.last || '').localeCompare(stats.get(a.id)?.last || '') ||
      a.name.localeCompare(b.name),
    most: (a, b) =>
      (stats.get(b.id)?.days.size || 0) - (stats.get(a.id)?.days.size || 0) ||
      a.name.localeCompare(b.name),
  };
  return [...list].sort(cmp[mode] || cmp.az);
}

function sortChipsHTML() {
  return `<div class="chip-row sort-row">
    ${EX_SORTS.map(([id, label]) =>
      `<button class="chip ${S.exSort === id ? 'chip-active' : ''}" data-sort="${id}">${label}</button>`).join('')}
  </div>`;
}

function wireSortChips(root) {
  root.querySelectorAll('[data-sort]').forEach(b => b.onclick = async () => {
    await setSetting('exSort', b.dataset.sort);
    rerender();
  });
}

function exerciseRowHTML(e, st, hidden = false) {
  let stats;
  if (st) {
    const r = recencyInfo(st.last);
    stats = `<span class="rec-dot ${r.cls}"></span>${st.days.size} workout${st.days.size === 1 ? '' : 's'} · ${r.label}`;
  } else {
    stats = '<span class="row-stats-empty">No workouts yet</span>';
  }
  return `
    <div class="list-row picker-row" data-ex="${e.id}" data-name="${esc(e.name.toLowerCase())}"${hidden ? ' style="display:none"' : ''}>
      <div class="row-label">
        <div>${esc(e.name)}</div>
        <div class="row-stats">${stats}</div>
      </div>
      <button class="icon-btn" data-edit="${e.id}" aria-label="Edit ${esc(e.name)}">⋮</button>
    </div>`;
}

// FitNotes flow: + → category list → exercise list. Searching from the
// category screen searches all exercises directly.
async function renderExercisePicker() {
  const [categories, exercises, stats] = await Promise.all([
    allCategories(), allExercises(), exerciseStatsMap(),
  ]);
  const counts = new Map();
  for (const e of exercises) counts.set(e.categoryId, (counts.get(e.categoryId) || 0) + 1);

  const catRows = categories.map(c => `
    <div class="list-row" data-cat="${c.id}">
      <span class="row-label">${esc(c.name)}</span>
      <span class="row-sub">${counts.get(c.id) || 0}</span>
      <span class="row-chevron">›</span>
    </div>`).join('');

  const exRows = sortExercises(exercises, stats, S.exSort)
    .map(e => exerciseRowHTML(e, stats.get(e.id), true)).join('');

  $app().innerHTML = `
    ${header({
      title: 'Select Category', showBack: true,
      right: `<button class="icon-btn" id="new-ex" title="New exercise">${icon('plus')}</button>
              <button class="icon-btn" id="cat-btn" title="Manage categories">${icon('pencil')}</button>`,
    })}
    <main class="content">
      <input type="search" id="ex-search" class="search-input" placeholder="Search all exercises…" autocomplete="off">
      <div id="cat-list">${catRows}</div>
      <div id="search-list">${exRows}</div>
    </main>`;

  const root = $app();
  wireHeader(root);
  root.querySelector('#cat-btn').onclick = () => pushView(renderCategories);
  root.querySelector('#new-ex').onclick = () => exerciseEditor(null);
  root.querySelectorAll('[data-cat]').forEach(row => row.onclick = () => {
    const id = parseInt(row.dataset.cat, 10);
    pushView(() => renderCategoryExercises(id));
  });
  wireExerciseRows(root);
  const search = root.querySelector('#ex-search');
  const catList = root.querySelector('#cat-list');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    catList.style.display = q ? 'none' : '';
    root.querySelectorAll('.picker-row').forEach(row => {
      row.style.display = q && row.dataset.name.includes(q) ? '' : 'none';
    });
  };
}

async function renderCategoryExercises(categoryId) {
  const cat = await db.get('categories', categoryId);
  if (!cat) { back(); return; }
  const [exercises, stats] = await Promise.all([
    db.getAllByIndex('exercises', 'categoryId', categoryId), exerciseStatsMap(),
  ]);
  const sorted = sortExercises(exercises, stats, S.exSort);

  $app().innerHTML = `
    ${header({
      title: esc(cat.name), showBack: true,
      right: `<button class="icon-btn" id="new-ex" title="New exercise">${icon('plus')}</button>`,
    })}
    <main class="content">
      ${sortChipsHTML()}
      ${sorted.map(e => exerciseRowHTML(e, stats.get(e.id))).join('') ||
        '<div class="empty-state"><p>No exercises in this category.</p></div>'}
    </main>`;

  const root = $app();
  wireHeader(root);
  wireSortChips(root);
  root.querySelector('#new-ex').onclick = () => exerciseEditor(null, categoryId);
  wireExerciseRows(root);
}

function wireExerciseRows(root) {
  root.querySelectorAll('.picker-row').forEach(row => {
    row.addEventListener('click', async e => {
      if (e.target.closest('[data-edit]')) return;
      const id = parseInt(row.dataset.ex, 10);
      if (state.pickFor) {
        // picking an exercise for a routine: add it, then unwind back to the
        // routine screen however deep into the picker we are
        const { routineId, depth } = state.pickFor;
        state.pickFor = null;
        const routine = await db.get('routines', routineId);
        if (routine) {
          const items = routineItems(routine);
          if (!items.some(it => it.exerciseId === id)) {
            items.push({ exerciseId: id, sets: DEFAULT_SETS });
            routine.items = items;
            delete routine.exerciseIds;
            await db.put('routines', routine);
          }
          toast('Added to routine');
        }
        history.go(-(state.stack.length - depth));
        return;
      }
      pushView(() => renderExercise(id, 'track'));
    });
  });
  root.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = async () => {
    const ex = await db.get('exercises', parseInt(btn.dataset.edit, 10));
    if (ex) exerciseEditor(ex);
  });
}

async function exerciseEditor(existing, defaultCategoryId) {
  const categories = await allCategories();
  const selectedCat = existing?.categoryId ?? defaultCategoryId;
  const { el, close } = openModal(`
    <h3>${existing ? 'Edit Exercise' : 'New Exercise'}</h3>
    <label class="field-label">Name
      <input type="text" id="exe-name" class="text-input" value="${esc(existing?.name || '')}" autocomplete="off">
    </label>
    <label class="field-label">Category
      <select id="exe-cat" class="text-input">
        ${categories.map(c => `<option value="${c.id}" ${selectedCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </label>
    <label class="field-label">Type
      <select id="exe-type" class="text-input">
        <option value="weight_reps" ${(!existing || existing.type === 'weight_reps') ? 'selected' : ''}>Weight × Reps</option>
        <option value="distance_time" ${existing?.type === 'distance_time' ? 'selected' : ''}>Distance / Time</option>
      </select>
    </label>
    <label class="field-label">Notes (setup, seat height, band color…)
      <textarea id="exe-notes" class="text-input notes-input" rows="3">${esc(existing?.notes || '')}</textarea>
    </label>
    <div class="modal-actions">
      ${existing ? '<button class="btn btn-danger" data-act="delete">Delete</button>' : ''}
      <span class="flex-spacer"></span>
      <button class="btn btn-ghost" data-act="cancel">Cancel</button>
      <button class="btn btn-primary" data-act="save">Save</button>
    </div>`);
  el.querySelector('[data-act=cancel]').onclick = close;
  el.querySelector('[data-act=save]').onclick = async () => {
    const name = el.querySelector('#exe-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const rec = {
      ...(existing || {}),
      name,
      nameLower: name.toLowerCase(),
      categoryId: parseInt(el.querySelector('#exe-cat').value, 10),
      type: el.querySelector('#exe-type').value,
      notes: el.querySelector('#exe-notes').value.trim(),
    };
    try {
      await db.put('exercises', rec);
    } catch {
      toast('An exercise with that name already exists');
      return;
    }
    close();
    rerender();
  };
  el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    const sets = await setsForExercise(existing.id);
    const ok = await confirmDialog({
      title: `Delete ${existing.name}?`,
      body: sets.length
        ? `This will permanently delete the exercise and its ${sets.length} logged set${sets.length === 1 ? '' : 's'}.`
        : 'This will permanently delete the exercise.',
      okLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    await db.bulkDelete('sets', sets.map(s => s.id));
    await db.del('exercises', existing.id);
    close();
    rerender();
  });
}

// ---------------------------------------------------------------------------
// Category management

async function renderCategories() {
  const [categories, exercises] = await Promise.all([allCategories(), allExercises()]);
  const counts = new Map();
  for (const e of exercises) counts.set(e.categoryId, (counts.get(e.categoryId) || 0) + 1);

  $app().innerHTML = `
    ${header({ title: 'Categories', showBack: true })}
    <main class="content">
      <button class="btn btn-ghost btn-block" id="new-cat">＋ New category</button>
      ${categories.map(c => `
        <div class="list-row" data-catrow="${c.id}">
          <span class="row-label">${esc(c.name)} <span class="row-sub">${counts.get(c.id) || 0} exercises</span></span>
          <button class="icon-btn" data-editcat="${c.id}">⋮</button>
        </div>`).join('')}
    </main>`;
  const root = $app();
  wireHeader(root);
  root.querySelector('#new-cat').onclick = () => categoryEditor(null);
  root.querySelectorAll('[data-editcat]').forEach(b => b.onclick = async () => {
    const cat = await db.get('categories', parseInt(b.dataset.editcat, 10));
    if (cat) categoryEditor(cat);
  });
}

async function categoryEditor(existing) {
  const { el, close } = openModal(`
    <h3>${existing ? 'Edit Category' : 'New Category'}</h3>
    <label class="field-label">Name
      <input type="text" id="cat-name" class="text-input" value="${esc(existing?.name || '')}" autocomplete="off">
    </label>
    <div class="modal-actions">
      ${existing ? '<button class="btn btn-danger" data-act="delete">Delete</button>' : ''}
      <span class="flex-spacer"></span>
      <button class="btn btn-ghost" data-act="cancel">Cancel</button>
      <button class="btn btn-primary" data-act="save">Save</button>
    </div>`);
  el.querySelector('[data-act=cancel]').onclick = close;
  el.querySelector('[data-act=save]').onclick = async () => {
    const name = el.querySelector('#cat-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const rec = existing
      ? { ...existing, name, nameLower: name.toLowerCase() }
      : { name, nameLower: name.toLowerCase(), sort: 100 };
    try { await db.put('categories', rec); } catch { toast('That category already exists'); return; }
    close();
    rerender();
  };
  el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    const inCat = (await db.getAllByIndex('exercises', 'categoryId', existing.id));
    if (inCat.length) {
      toast(`Move or delete its ${inCat.length} exercises first`);
      return;
    }
    const ok = await confirmDialog({ title: `Delete ${existing.name}?`, body: 'The category is empty and will be removed.', okLabel: 'Delete', danger: true });
    if (!ok) return;
    await db.del('categories', existing.id);
    close();
    rerender();
  });
}

// ---------------------------------------------------------------------------
// Exercise screen: Track / History / Graph / Records

const trackDraft = {}; // per-exercise input drafts, survives tab switches

async function renderExercise(exerciseId, tab) {
  const ex = await db.get('exercises', exerciseId);
  if (!ex) { back(); return; }
  const tabs = [
    ['track', 'Track'], ['history', 'History'], ['graph', 'Graph'], ['records', 'Records'],
  ];
  $app().innerHTML = `
    ${header({ title: esc(ex.name), showBack: true })}
    <nav class="tabbar">
      ${tabs.map(([id, label]) =>
        `<button class="tab ${tab === id ? 'tab-active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </nav>
    <main class="content" id="tab-content"></main>`;
  const root = $app();
  wireHeader(root);
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    replaceView(() => renderExercise(exerciseId, b.dataset.tab));
  });
  const body = root.querySelector('#tab-content');
  if (tab === 'track') await renderTrackTab(body, ex);
  else if (tab === 'history') await renderHistoryTab(body, ex);
  else if (tab === 'graph') await renderGraphTab(body, ex);
  else await renderRecordsTab(body, ex);
}

async function renderTrackTab(body, ex) {
  const isCardio = ex.type === 'distance_time';
  const allSets = await setsForExercise(ex.id);
  const prIds = computePRIds(allSets, ex.type);
  const daySets = allSets.filter(s => s.date === state.date);
  const draft = trackDraft[ex.id] || {};
  let selectedId = draft.selectedId && daySets.some(s => s.id === draft.selectedId) ? draft.selectedId : null;

  // Prefill from: selected set > draft > last set today > last workout
  let pre = { weight: '', reps: '', dist: '', time: '', comment: '' };
  const fillFrom = s => {
    pre = {
      weight: s.weight > 0 ? fmtWeight(s.weight) : '',
      reps: s.reps > 0 ? String(s.reps) : '',
      dist: s.distance > 0 ? fmtNum(mToDisplayDist(s.distance)) : '',
      time: s.time > 0 ? timeToString(s.time) : '',
      comment: s.comment || '',
    };
  };
  if (selectedId) fillFrom(daySets.find(s => s.id === selectedId));
  else if (draft.weight !== undefined) pre = { ...pre, ...draft };
  else if (daySets.length) fillFrom(daySets[daySets.length - 1]);
  else if (allSets.length) fillFrom(allSets[allSets.length - 1]);
  if (selectedId) pre.comment = daySets.find(s => s.id === selectedId)?.comment || '';

  const inc = S.weightIncrement || (isMetric() ? 2.5 : 5);

  body.innerHTML = `
    <button class="ex-note" id="ex-note">${ex.notes
      ? `${icon('pencil')}<span class="ex-note-text">${esc(ex.notes)}</span>`
      : `<span class="ex-note-empty">${icon('pencil')}Add note</span>`}</button>
    <div class="track-wrap">
    <div class="track-date">${esc(fmtDateLong(state.date))}</div>
    ${isCardio ? `
      <div class="field-block">
        <div class="field-title">DISTANCE (${distUnitLabel()})</div>
        <div class="stepper">
          <button class="step-btn" data-step="dist:-0.5">−</button>
          <input type="number" inputmode="decimal" step="any" min="0" id="in-dist" value="${esc(pre.dist)}">
          <button class="step-btn" data-step="dist:0.5">＋</button>
        </div>
      </div>
      <div class="field-block">
        <div class="field-title">TIME (h:mm:ss)</div>
        <div class="stepper">
          <button class="step-btn" data-timestep="-60">−</button>
          <input type="text" inputmode="numeric" id="in-time" value="${esc(pre.time)}" placeholder="0:00">
          <button class="step-btn" data-timestep="60">＋</button>
        </div>
      </div>` : `
      <div class="field-block">
        <div class="field-title">WEIGHT (${getUnit()})</div>
        <div class="stepper">
          <button class="step-btn" data-step="weight:-${inc}">−</button>
          <input type="number" inputmode="decimal" step="any" min="0" id="in-weight" value="${esc(pre.weight)}">
          <button class="step-btn" data-step="weight:${inc}">＋</button>
        </div>
      </div>
      <div class="field-block">
        <div class="field-title">REPS</div>
        <div class="stepper">
          <button class="step-btn" data-step="reps:-1">−</button>
          <input type="number" inputmode="numeric" step="1" min="0" id="in-reps" value="${esc(pre.reps)}">
          <button class="step-btn" data-step="reps:1">＋</button>
        </div>
      </div>`}
    <input type="text" id="in-comment" class="text-input comment-input" placeholder="Comment (optional)" value="${esc(pre.comment)}" autocomplete="off">
    <div class="track-actions">
      ${selectedId
        ? `<button class="btn btn-primary" id="btn-update">Update</button>
           <button class="btn btn-danger" id="btn-delete">Delete</button>`
        : `<button class="btn btn-primary" id="btn-save">Save</button>
           <button class="btn btn-gray" id="btn-clear">Clear</button>`}
    </div>
    <div class="timer-row">
      <button class="timer-btn" id="btn-timer">${restTimer.running ? restTimer.label() : '⏱ Rest timer ' + timeToString(S.restSeconds)}</button>
    </div>
    </div>
    <div class="set-list">
      ${daySets.map((s, i) =>
        setRowHTML(s, ex.type, i, 'set-row-tappable' + (s.id === selectedId ? ' set-row-selected' : ''), prIds.has(s.id))).join('')}
    </div>`;

  body.querySelector('#ex-note').onclick = () => {
    const { el, close } = openModal(`
      <h3>Note — ${esc(ex.name)}</h3>
      <textarea id="note-text" class="text-input notes-input" rows="4" placeholder="Seat height, band color, grip…">${esc(ex.notes || '')}</textarea>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">Save</button>
      </div>`);
    el.querySelector('[data-act=cancel]').onclick = close;
    el.querySelector('[data-act=save]').onclick = async () => {
      await db.put('exercises', { ...ex, notes: el.querySelector('#note-text').value.trim() });
      close();
      rerender();
    };
  };

  const val = id => body.querySelector(id)?.value ?? '';
  const readInputs = () => ({
    weight: parseFloat(val('#in-weight')) || 0,
    reps: parseInt(val('#in-reps'), 10) || 0,
    dist: parseFloat(val('#in-dist')) || 0,
    time: parseTimeToSeconds(val('#in-time')),
    comment: val('#in-comment').trim(),
  });
  const saveDraft = () => {
    trackDraft[ex.id] = {
      selectedId,
      weight: val('#in-weight'), reps: val('#in-reps'),
      dist: val('#in-dist'), time: val('#in-time'), comment: val('#in-comment'),
    };
  };
  body.querySelectorAll('input').forEach(i => i.addEventListener('input', saveDraft));

  body.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const [field, delta] = b.dataset.step.split(':');
    const input = body.querySelector(field === 'weight' ? '#in-weight' : field === 'reps' ? '#in-reps' : '#in-dist');
    const cur = parseFloat(input.value) || 0;
    const next = Math.max(0, cur + parseFloat(delta));
    input.value = fmtNum(next);
    saveDraft();
  });
  body.querySelectorAll('[data-timestep]').forEach(b => b.onclick = () => {
    const input = body.querySelector('#in-time');
    const next = Math.max(0, parseTimeToSeconds(input.value) + parseInt(b.dataset.timestep, 10));
    input.value = timeToString(next);
    saveDraft();
  });

  const buildRecord = base => {
    const v = readInputs();
    return {
      ...base,
      exerciseId: ex.id,
      date: state.date,
      weight: isCardio ? 0 : displayToKg(v.weight),
      reps: isCardio ? 0 : v.reps,
      distance: isCardio ? displayDistToM(v.dist) : 0,
      time: isCardio ? v.time : 0,
      comment: v.comment,
    };
  };

  body.querySelector('#btn-save')?.addEventListener('click', async () => {
    const v = readInputs();
    if (!isCardio && v.reps <= 0) { toast('Enter at least 1 rep'); return; }
    if (isCardio && v.dist <= 0 && v.time <= 0) { toast('Enter a distance or time'); return; }
    const newId = await db.put('sets', buildRecord({ seq: nextSeq() }));
    delete trackDraft[ex.id];
    const after = await setsForExercise(ex.id);
    if (computePRIds(after, ex.type).has(newId)) toast('🏆 New personal record!');
    if (S.restSeconds > 0 && !isCardio) restTimer.start(S.restSeconds);
    rerender();
  });
  body.querySelector('#btn-timer')?.addEventListener('click', () => {
    restTimer.running ? restTimer.stop() : restTimer.start(S.restSeconds);
    rerender();
  });
  body.querySelector('#btn-update')?.addEventListener('click', async () => {
    const orig = daySets.find(s => s.id === selectedId);
    await db.put('sets', buildRecord({ id: orig.id, seq: orig.seq }));
    delete trackDraft[ex.id];
    rerender();
  });
  body.querySelector('#btn-delete')?.addEventListener('click', async () => {
    await db.del('sets', selectedId);
    delete trackDraft[ex.id];
    rerender();
  });
  body.querySelector('#btn-clear')?.addEventListener('click', () => {
    trackDraft[ex.id] = { selectedId: null, weight: '', reps: '', dist: '', time: '', comment: '' };
    rerender();
  });
  body.querySelectorAll('[data-set]').forEach(row => row.onclick = () => {
    const id = parseInt(row.dataset.set, 10);
    trackDraft[ex.id] = { selectedId: id === selectedId ? null : id };
    rerender();
  });
}

async function renderHistoryTab(body, ex) {
  const sets = await setsForExercise(ex.id);
  if (!sets.length) {
    body.innerHTML = '<div class="empty-state"><p>No sets logged yet.</p></div>';
    return;
  }
  const prIds = computePRIds(sets, ex.type);
  const byDate = new Map();
  for (const s of sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const PAGE = 60;
  let shown = 0;

  body.innerHTML = '<div id="history-list"></div><button class="btn btn-ghost btn-block" id="history-more">Show more</button>';
  const list = body.querySelector('#history-list');
  const moreBtn = body.querySelector('#history-more');

  const renderPage = () => {
    const chunk = dates.slice(shown, shown + PAGE);
    shown += chunk.length;
    list.insertAdjacentHTML('beforeend', chunk.map(date => `
      <div class="history-day" data-date="${date}">
        <div class="history-date">${esc(fmtDateLong(date))}</div>
        ${byDate.get(date).map((s, i) => {
          const [a, b] = describeCols(s, ex.type);
          return `
          <div class="set-row">
            <span class="set-num">${i + 1}</span>
            <span class="set-w">${esc(a)}</span>
            <span class="set-r">${esc(b)}</span>
            <span class="set-flags">${prIds.has(s.id) ? '<span class="pr-flag" title="Personal record">🏆</span>' : ''}</span>
            ${s.comment ? `<span class="set-comment">${esc(s.comment)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`).join(''));
    if (shown >= dates.length) moreBtn.style.display = 'none';
    list.querySelectorAll('.history-day:not([data-wired])').forEach(dayEl => {
      dayEl.dataset.wired = '1';
      dayEl.onclick = () => {
        state.date = dayEl.dataset.date;
        replaceView(() => renderExercise(ex.id, 'track'));
      };
    });
  };
  moreBtn.onclick = renderPage;
  renderPage();
}

const GRAPH_METRICS = {
  weight_reps: [
    ['maxWeight', 'Max Weight'],
    ['e1rm', 'Est. 1RM'],
    ['volume', 'Volume'],
    ['maxReps', 'Max Reps'],
    ['totalReps', 'Total Reps'],
  ],
  distance_time: [
    ['distance', 'Distance'],
    ['time', 'Time'],
    ['pace', 'Pace'],
  ],
};
const GRAPH_RANGES = [['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 365], ['all', 'All', Infinity]];
const graphPrefs = {}; // per-exercise metric/range selection

async function renderGraphTab(body, ex) {
  const metrics = GRAPH_METRICS[ex.type] || GRAPH_METRICS.weight_reps;
  const pref = graphPrefs[ex.id] || (graphPrefs[ex.id] = { metric: metrics[0][0], range: 'all' });
  const sets = await setsForExercise(ex.id);

  const rangeDays = GRAPH_RANGES.find(r => r[0] === pref.range)?.[2] ?? Infinity;
  const cutoff = Number.isFinite(rangeDays) ? addDays(todayStr(), -rangeDays) : '0000-00-00';
  const filtered = sets.filter(s => s.date >= cutoff);

  const byDate = new Map();
  for (const s of filtered) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  const agg = (daySets, metric) => {
    switch (metric) {
      case 'maxWeight': return kgToDisplay(Math.max(...daySets.map(s => s.weight)));
      case 'e1rm': return kgToDisplay(Math.max(...daySets.map(s => est1RM(s.weight, s.reps))));
      case 'volume': return kgToDisplay(daySets.reduce((a, s) => a + s.weight * s.reps, 0));
      case 'maxReps': return Math.max(...daySets.map(s => s.reps));
      case 'totalReps': return daySets.reduce((a, s) => a + s.reps, 0);
      case 'distance': return daySets.reduce((a, s) => a + mToDisplayDist(s.distance), 0);
      case 'time': return daySets.reduce((a, s) => a + s.time, 0) / 60; // minutes
      case 'pace': {
        const dist = daySets.reduce((a, s) => a + mToDisplayDist(s.distance), 0);
        const time = daySets.reduce((a, s) => a + s.time, 0);
        return dist > 0 ? time / 60 / dist : 0;
      }
      default: return 0;
    }
  };

  const points = [...byDate.keys()].sort()
    .map(date => ({ date, value: agg(byDate.get(date), pref.metric) }))
    .filter(p => p.value > 0);

  const unitFor = {
    maxWeight: getUnit(), e1rm: getUnit(), volume: getUnit(),
    maxReps: 'reps', totalReps: 'reps',
    distance: distUnitLabel(), time: 'min', pace: `min/${distUnitLabel()}`,
  }[pref.metric] || '';

  const rangeLabels = { '3m': '3 Months', '6m': '6 Months', '1y': '1 Year', all: 'All Time' };
  body.innerHTML = `
    <div class="graph-wrap">
      <div class="graph-controls">
        <select id="g-metric" aria-label="Metric">
          ${metrics.map(([id, label]) =>
            `<option value="${id}" ${pref.metric === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <select id="g-range" aria-label="Time range">
          ${GRAPH_RANGES.map(([id]) =>
            `<option value="${id}" ${pref.range === id ? 'selected' : ''}>${rangeLabels[id]}</option>`).join('')}
        </select>
      </div>
      <div class="chart-title">${esc(metrics.find(m => m[0] === pref.metric)?.[1] || '')}${unitFor ? ` (${esc(unitFor)})` : ''}</div>
      <div id="chart"></div>
    </div>`;

  body.querySelector('#g-metric').onchange = e => {
    pref.metric = e.target.value;
    renderGraphTab(body, ex);
  };
  body.querySelector('#g-range').onchange = e => {
    pref.range = e.target.value;
    renderGraphTab(body, ex);
  };
  renderLineChart(body.querySelector('#chart'), points, {
    formatValue: v => fmtNum(v, pref.metric === 'pace' ? 1 : v >= 1000 ? 0 : 1),
  });
}

async function renderRecordsTab(body, ex) {
  const sets = await setsForExercise(ex.id);
  if (!sets.length) {
    body.innerHTML = '<div class="empty-state"><p>No sets logged yet.</p></div>';
    return;
  }

  if (ex.type === 'distance_time') {
    let maxDist = null, maxTime = null, bestPace = null;
    for (const s of sets) {
      if (s.distance > 0 && (!maxDist || s.distance > maxDist.distance)) maxDist = s;
      if (s.time > 0 && (!maxTime || s.time > maxTime.time)) maxTime = s;
      if (s.distance > 0 && s.time > 0) {
        const pace = s.time / mToDisplayDist(s.distance);
        if (!bestPace || pace < bestPace.pace) bestPace = { ...s, pace };
      }
    }
    const tile = (label, value, date) => `
      <div class="stat-tile">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-date">${esc(fmtDateLong(date))}</div>
      </div>`;
    body.innerHTML = `<div class="records-wrap"><div class="stat-grid">
      ${maxDist ? tile('Longest distance', `${fmtNum(mToDisplayDist(maxDist.distance))} ${distUnitLabel()}`, maxDist.date) : ''}
      ${maxTime ? tile('Longest time', timeToString(maxTime.time), maxTime.date) : ''}
      ${bestPace ? tile('Best pace', `${fmtNum(bestPace.pace / 60, 1)} min/${distUnitLabel()}`, bestPace.date) : ''}
    </div></div>`;
    return;
  }

  let maxW = null, best1 = null, maxVol = null;
  const repRecords = new Map(); // reps -> best set
  for (const s of sets) {
    if (s.weight > 0 && (!maxW || s.weight > maxW.weight)) maxW = s;
    const e = est1RM(s.weight, s.reps);
    if (e > 0 && (!best1 || e > best1.e)) best1 = { ...s, e };
    const vol = s.weight * s.reps;
    if (vol > 0 && (!maxVol || vol > maxVol.vol)) maxVol = { ...s, vol };
    if (s.reps >= 1 && s.reps <= 12) {
      const cur = repRecords.get(s.reps);
      if (!cur || s.weight > cur.weight) repRecords.set(s.reps, s);
    }
  }

  const tile = (label, value, date) => `
    <div class="stat-tile">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-date">${esc(fmtDateLong(date))}</div>
    </div>`;

  const repRows = [...repRecords.keys()].sort((a, b) => a - b).map(r => {
    const s = repRecords.get(r);
    return `<tr><td>${r}</td><td>${fmtWeight(s.weight)} ${getUnit()}</td><td class="rec-date">${esc(s.date)}</td></tr>`;
  }).join('');

  body.innerHTML = `
    <div class="records-wrap">
    <div class="stat-grid">
      ${maxW ? tile('Max weight', `${fmtWeight(maxW.weight)} ${getUnit()} × ${maxW.reps}`, maxW.date) : ''}
      ${best1 ? tile('Best est. 1RM', `${fmtNum(kgToDisplay(best1.e), 1)} ${getUnit()}`, best1.date) : ''}
      ${maxVol ? tile('Best set volume', `${fmtNum(kgToDisplay(maxVol.vol), 0)} ${getUnit()}`, maxVol.date) : ''}
      <div class="stat-tile">
        <div class="stat-label">Lifetime</div>
        <div class="stat-value">${sets.length} sets</div>
        <div class="stat-date">${[...new Set(sets.map(s => s.date))].size} workouts</div>
      </div>
    </div>
    ${repRows ? `
      <div class="chart-title">Rep records</div>
      <table class="rec-table">
        <thead><tr><th>Reps</th><th>Best weight</th><th>Date</th></tr></thead>
        <tbody>${repRows}</tbody>
      </table>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Routines — ordered exercise lists; work down the list on gym day.

// Glowing flame badge: the brighter (and hotter-colored) the glow, the longer
// the current streak. Intensity keeps growing until GLOW_CAP completions.
function streakBadgeHTML(streak) {
  if (!streak) return '';
  return `
    <span class="streak-badge" style="--glow:${glowLevel(streak).toFixed(3)}"
      title="${streak} completion${streak === 1 ? '' : 's'} in a row">
      ${icon('flame')}<span class="streak-count">${streak}</span>
    </span>`;
}

async function renderRoutines() {
  const [routines, sets] = await Promise.all([db.getAll('routines'), db.getAll('sets')]);
  routines.sort((a, b) => a.name.localeCompare(b.name));
  const infoById = new Map(routines.map(r => {
    const items = routineItems(r);
    return [r.id, { items, stats: routineStats(items, sets, todayStr()) }];
  }));
  $app().innerHTML = `
    ${header({ title: 'Routines', showBack: true })}
    <main class="content">
      <button class="btn btn-ghost btn-block" id="new-routine">＋ New routine</button>
      ${routines.map(r => {
        const { items, stats: st } = infoById.get(r.id);
        const totalSets = items.reduce((a, it) => a + Math.max(1, it.sets || 0), 0);
        return `
        <div class="list-row" data-routine="${r.id}">
          <div class="row-label">
            <div>${esc(r.name)}<span class="row-sub">${items.length} exercise${items.length === 1 ? '' : 's'} · ${totalSets} sets</span></div>
            <div class="row-stats">${st.total
              ? `${st.total} completion${st.total === 1 ? '' : 's'}${st.partial ? ` (${st.partial} partial)` : ''}${st.streak ? ` · streak ${st.streak}` : ''}`
              : '<span class="row-stats-empty">Not completed yet</span>'}</div>
          </div>
          ${streakBadgeHTML(st.streak)}
          <button class="icon-btn" data-editroutine="${r.id}">⋮</button>
        </div>`;
      }).join('') ||
        '<div class="empty-state"><p>No routines yet.</p><p class="empty-sub">Create one, or import your FitNotes backup — routines come with it.</p></div>'}
      ${routines.length ? `<p class="setting-note">A day counts as a completion when you log all of a routine's target sets; ${Math.round(PARTIAL_THRESHOLD * 100)}% of them counts as a partial. Streaks survive gaps of up to ${MAX_GAP_DAYS} days.</p>` : ''}
    </main>`;
  const root = $app();
  wireHeader(root);
  root.querySelector('#new-routine').onclick = () => routineEditor(null);
  root.querySelectorAll('[data-routine]').forEach(row => row.onclick = e => {
    if (e.target.closest('[data-editroutine]')) return;
    const id = parseInt(row.dataset.routine, 10);
    pushView(() => renderRoutine(id));
  });
  root.querySelectorAll('[data-editroutine]').forEach(b => b.onclick = async () => {
    const r = await db.get('routines', parseInt(b.dataset.editroutine, 10));
    if (r) routineEditor(r);
  });
}

function routineEditor(existing) {
  const { el, close } = openModal(`
    <h3>${existing ? 'Edit Routine' : 'New Routine'}</h3>
    <label class="field-label">Name
      <input type="text" id="rt-name" class="text-input" value="${esc(existing?.name || '')}" autocomplete="off">
    </label>
    <div class="modal-actions">
      ${existing ? '<button class="btn btn-danger" data-act="delete">Delete</button>' : ''}
      <span class="flex-spacer"></span>
      <button class="btn btn-ghost" data-act="cancel">Cancel</button>
      <button class="btn btn-primary" data-act="save">Save</button>
    </div>`);
  el.querySelector('[data-act=cancel]').onclick = close;
  el.querySelector('[data-act=save]').onclick = async () => {
    const name = el.querySelector('#rt-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const rec = existing ? { ...existing, name } : { name, items: [] };
    const id = await db.put('routines', rec);
    close();
    if (!existing) pushView(() => renderRoutine(id));
    else rerender();
  };
  el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Delete ${existing.name}?`,
      body: 'The routine is removed; logged sets are not affected.',
      okLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    await db.del('routines', existing.id);
    close();
    rerender();
  });
}

async function renderRoutine(routineId) {
  const routine = await db.get('routines', routineId);
  if (!routine) { back(); return; }
  // migrate legacy exerciseIds to items in memory; persisted on the next edit
  const items = routineItems(routine);
  routine.items = items;
  delete routine.exerciseIds;
  const [exercises, daySets] = await Promise.all([allExercises(), setsForDate(state.date)]);
  const exById = new Map(exercises.map(e => [e.id, e]));
  const doneToday = new Map();
  for (const s of daySets) doneToday.set(s.exerciseId, (doneToday.get(s.exerciseId) || 0) + 1);

  const { done, want } = dayProgress(items, daySets);
  const frac = want ? done / want : 0;
  const fillCls = frac >= 1 ? 'rt-fill-full' : frac >= PARTIAL_THRESHOLD ? 'rt-fill-part' : '';

  $app().innerHTML = `
    ${header({
      title: esc(routine.name), showBack: true,
      right: `<button class="icon-btn" id="rt-add" title="Add exercise">${icon('plus')}</button>`,
    })}
    <main class="content">
      <div class="setting-note">${esc(fmtDateHeading(state.date))} — tap an exercise to log it, or its ×N to change its target sets.</div>
      ${items.length ? `
        <div class="rt-progress">
          <div class="rt-bar"><div class="rt-bar-fill ${fillCls}" style="width:${Math.min(100, Math.round(frac * 100))}%"></div></div>
          <span class="rt-progress-label">${done}/${want} sets${frac >= 1 ? ' ✓' : frac >= PARTIAL_THRESHOLD ? ' · partial' : ''}</span>
        </div>` : ''}
      ${items.map((it, i) => {
        const ex = exById.get(it.exerciseId);
        if (!ex) return '';
        const t = Math.max(1, it.sets || 0);
        const n = doneToday.get(it.exerciseId) || 0;
        return `
          <div class="list-row routine-row" data-ex="${it.exerciseId}">
            <span class="rt-done ${n >= t ? 'rt-done-yes' : n > 0 ? 'rt-done-part' : ''}">${n >= t ? '✓' : n > 0 ? '◐' : ''}</span>
            <span class="row-label">${esc(ex.name)}<span class="row-sub">${n}/${t} sets</span></span>
            <button class="icon-btn rt-sets" data-sets="${i}" aria-label="Target sets for ${esc(ex.name)}">×${t}</button>
            <button class="icon-btn rt-move" data-move="${i}:-1" aria-label="Move up">▲</button>
            <button class="icon-btn rt-move" data-move="${i}:1" aria-label="Move down">▼</button>
            <button class="icon-btn" data-remove="${i}" aria-label="Remove">✕</button>
          </div>`;
      }).join('') || '<div class="empty-state"><p>Empty routine.</p><p class="empty-sub">Tap ＋ to add exercises.</p></div>'}
    </main>`;

  const root = $app();
  wireHeader(root);
  root.querySelector('#rt-add').onclick = () => {
    state.pickFor = { routineId, depth: state.stack.length };
    pushView(renderExercisePicker);
  };
  root.querySelectorAll('.routine-row').forEach(row => row.onclick = e => {
    if (e.target.closest('.icon-btn')) return;
    const id = parseInt(row.dataset.ex, 10);
    pushView(() => renderExercise(id, 'track'));
  });
  root.querySelectorAll('[data-sets]').forEach(b => b.onclick = () => {
    const i = parseInt(b.dataset.sets, 10);
    const ex = exById.get(items[i].exerciseId);
    const { el, close } = openModal(`
      <h3>Target sets — ${esc(ex?.name || '')}</h3>
      <div class="stepper">
        <button class="step-btn" data-d="-1">−</button>
        <input type="number" inputmode="numeric" step="1" min="1" id="sets-n" value="${Math.max(1, items[i].sets || 0)}">
        <button class="step-btn" data-d="1">＋</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">Save</button>
      </div>`);
    const input = el.querySelector('#sets-n');
    el.querySelectorAll('[data-d]').forEach(s => s.onclick = () => {
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) + parseInt(s.dataset.d, 10));
    });
    el.querySelector('[data-act=cancel]').onclick = close;
    el.querySelector('[data-act=save]').onclick = async () => {
      items[i].sets = Math.max(1, parseInt(input.value, 10) || 1);
      await db.put('routines', routine);
      close();
      rerender();
    };
  });
  root.querySelectorAll('[data-move]').forEach(b => b.onclick = async () => {
    const [i, d] = b.dataset.move.split(':').map(Number);
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    await db.put('routines', routine);
    rerender();
  });
  root.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
    items.splice(parseInt(b.dataset.remove, 10), 1);
    await db.put('routines', routine);
    rerender();
  });
}

// ---------------------------------------------------------------------------
// Rest timer

const restTimer = {
  endsAt: 0,
  interval: null,
  get running() { return this.endsAt > Date.now(); },
  label() { return '⏱ ' + timeToString(Math.max(0, Math.round((this.endsAt - Date.now()) / 1000))); },
  start(sec) {
    this.stop();
    this.endsAt = Date.now() + sec * 1000;
    this.interval = setInterval(() => this.tick(), 500);
    this.tick();
  },
  stop() {
    this.endsAt = 0;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    document.getElementById('rest-pill')?.remove();
  },
  tick() {
    if (!this.running) {
      this.stop();
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
      toast('Rest over — go!');
      return;
    }
    let pill = document.getElementById('rest-pill');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'rest-pill';
      pill.className = 'rest-pill';
      pill.onclick = () => this.stop();
      document.body.appendChild(pill);
    }
    pill.textContent = this.label() + '  ✕';
  },
};

// ---------------------------------------------------------------------------
// Import

async function applyImport(rows) {
  const stats = { imported: 0, duplicates: 0, newExercises: 0, newCategories: 0 };
  const categories = await db.getAll('categories');
  const exercises = await db.getAll('exercises');
  const catByName = new Map(categories.map(c => [c.nameLower, c]));
  const exByName = new Map(exercises.map(e => [e.nameLower, e]));

  // create missing categories, then missing exercises (typed from their rows)
  const rowsByExercise = new Map();
  for (const r of rows) {
    const k = r.exercise.toLowerCase();
    if (!rowsByExercise.has(k)) rowsByExercise.set(k, []);
    rowsByExercise.get(k).push(r);
  }
  for (const [exLower, exRows] of rowsByExercise) {
    if (exByName.has(exLower)) continue;
    const catLower = exRows[0].category.toLowerCase();
    let cat = catByName.get(catLower);
    if (!cat) {
      const id = await db.put('categories', { name: exRows[0].category, nameLower: catLower, sort: 50 });
      cat = { id, name: exRows[0].category, nameLower: catLower };
      catByName.set(catLower, cat);
      stats.newCategories++;
    }
    const rec = {
      name: exRows[0].exercise, nameLower: exLower,
      categoryId: cat.id, type: inferType(exRows),
    };
    rec.id = await db.put('exercises', rec);
    exByName.set(exLower, rec);
    stats.newExercises++;
  }

  // multiset diff against existing sets so re-imports are idempotent
  const existing = await db.getAll('sets');
  const exById = new Map([...exByName.values()].map(e => [e.id, e]));
  const existingCounts = new Map();
  for (const s of existing) {
    const ex = exById.get(s.exerciseId);
    if (!ex) continue;
    const k = setKey(ex.nameLower, s);
    existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
  }

  const toInsert = [];
  for (const r of rows) {
    const k = setKey(r.exercise.toLowerCase(), r);
    const have = existingCounts.get(k) || 0;
    if (have > 0) {
      existingCounts.set(k, have - 1);
      stats.duplicates++;
      continue;
    }
    toInsert.push({
      exerciseId: exByName.get(r.exercise.toLowerCase()).id,
      date: r.date,
      weight: r.weightKg,
      reps: r.reps,
      distance: r.distanceM,
      time: r.timeSec,
      comment: r.comment,
      seq: nextSeq(),
    });
  }
  await db.bulkPut('sets', toInsert);
  stats.imported = toInsert.length;
  return stats;
}

async function handleCSVImport(file) {
  const text = await file.text();
  const { rows, errors } = parseFitNotesCSV(text);
  if (!rows.length) {
    openModal(`<h3>Import failed</h3><p class="modal-body">${esc(errors[0] || 'No data rows found.')}</p>
      <div class="modal-actions"><button class="btn btn-primary" onclick="this.closest('.modal-backdrop').remove()">OK</button></div>`);
    return;
  }
  toast(`Importing ${rows.length} sets…`);
  const stats = await applyImport(rows);
  const { el } = openModal(`
    <h3>Import complete</h3>
    <p class="modal-body">
      ${stats.imported} sets imported<br>
      ${stats.duplicates} duplicates skipped<br>
      ${stats.newExercises} new exercises · ${stats.newCategories} new categories
      ${errors.length ? `<br><br>${errors.length} rows skipped:<br><small>${esc(errors.slice(0, 5).join('\n'))}</small>` : ''}
    </p>
    <div class="modal-actions"><button class="btn btn-primary" data-act="ok">Done</button></div>`);
  el.querySelector('[data-act=ok]').onclick = () => { el.parentElement.remove(); rerender(); };
}

// Import a .fitnotes backup (SQLite database): logged sets (deduped against
// prior CSV imports), exercise notes, and routines.
async function handleFitNotesDBImport(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeSQLite(bytes)) {
    toast('Not a .fitnotes backup (not an SQLite file)');
    return;
  }
  toast('Reading backup…');
  let parsed;
  try {
    const SQL = await loadSqlJs();
    const sdb = new SQL.Database(bytes);
    try { parsed = parseFitNotesDB(sdb); } finally { sdb.close(); }
  } catch (e) {
    openModal(`<h3>Import failed</h3><p class="modal-body">${esc(e.message)}</p>
      <div class="modal-actions"><button class="btn btn-primary" onclick="this.closest('.modal-backdrop').remove()">OK</button></div>`);
    return;
  }

  const stats = await applyImport(parsed.rows);

  // exercise notes — never overwrite a note already written in this app
  let notesApplied = 0;
  for (const ex of await db.getAll('exercises')) {
    const n = parsed.exerciseNotes.get(ex.nameLower);
    if (n && !ex.notes) {
      await db.put('exercises', { ...ex, notes: n });
      notesApplied++;
    }
  }

  // routines — skip ones whose name already exists; create any exercises a
  // routine references that have no logged sets (they exist only as
  // definitions in the backup)
  let routinesAdded = 0;
  const haveRoutines = new Set((await db.getAll('routines')).map(r => r.name.toLowerCase()));
  const backupCategory = new Map(parsed.allExercises.map(e => [e.name.toLowerCase(), e.category]));
  const cats = await db.getAll('categories');
  const catByName = new Map(cats.map(c => [c.nameLower, c]));
  const exByName = new Map((await db.getAll('exercises')).map(e => [e.nameLower, e]));
  for (const r of parsed.routines) {
    if (haveRoutines.has(r.name.toLowerCase())) continue;
    const items = [];
    for (const entry of r.exercises) {
      const name = entry.name;
      const key = name.toLowerCase();
      let ex = exByName.get(key);
      if (!ex) {
        const catName = backupCategory.get(key) || 'Other';
        let cat = catByName.get(catName.toLowerCase());
        if (!cat) {
          const id = await db.put('categories', { name: catName, nameLower: catName.toLowerCase(), sort: 50 });
          cat = { id, name: catName, nameLower: catName.toLowerCase() };
          catByName.set(cat.nameLower, cat);
        }
        ex = { name, nameLower: key, categoryId: cat.id, type: 'weight_reps' };
        ex.id = await db.put('exercises', ex);
        exByName.set(key, ex);
      }
      if (!items.some(it => it.exerciseId === ex.id)) {
        // sets: 0 means the backup had no template sets for this exercise
        items.push({ exerciseId: ex.id, sets: Math.max(1, entry.sets || DEFAULT_SETS) });
      }
    }
    if (items.length) {
      await db.put('routines', { name: r.name, items });
      routinesAdded++;
    }
  }

  const { el } = openModal(`
    <h3>Backup imported</h3>
    <p class="modal-body">
      ${stats.imported} sets imported · ${stats.duplicates} duplicates skipped<br>
      ${stats.newExercises} new exercises · ${stats.newCategories} new categories<br>
      ${notesApplied} exercise notes · ${routinesAdded} routines
    </p>
    <div class="modal-actions"><button class="btn btn-primary" data-act="ok">Done</button></div>`);
  el.querySelector('[data-act=ok]').onclick = () => { el.parentElement.remove(); rerender(); };
}

async function handleJSONRestore(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Not a valid backup file');
    return;
  }
  if (data.app !== 'workout-log' || !Array.isArray(data.sets)) {
    toast('Not a valid backup file');
    return;
  }
  const ok = await confirmDialog({
    title: 'Restore backup?',
    body: `This replaces ALL current data with the backup from ${data.exportedAt?.slice(0, 10) || 'unknown date'} (${data.sets.length} sets). This cannot be undone.`,
    okLabel: 'Replace everything', danger: true,
  });
  if (!ok) return;
  await db.clearStore('sets');
  await db.clearStore('exercises');
  await db.clearStore('categories');
  await db.clearStore('routines');
  await db.bulkPut('categories', data.categories || []);
  await db.bulkPut('exercises', data.exercises || []);
  await db.bulkPut('sets', data.sets);
  await db.bulkPut('routines', data.routines || []);
  if (data.settings) {
    for (const k of ['unit', 'weightIncrement', 'restSeconds', 'autoBackup']) {
      if (data.settings[k] !== undefined) await setSetting(k, data.settings[k]);
    }
  }
  toast('Backup restored');
  rerender();
}

// ---------------------------------------------------------------------------
// Settings screen

async function renderSettings() {
  const setCount = (await db.getAll('sets')).length;
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.() || false; } catch { /* n/a */ }

  const seg = (id, options, current) => `
    <div class="seg" id="${id}">
      ${options.map(([v, label]) =>
        `<button class="seg-btn ${String(current) === String(v) ? 'seg-active' : ''}" data-val="${v}">${label}</button>`).join('')}
    </div>`;

  $app().innerHTML = `
    ${header({ title: 'Settings', showBack: true })}
    <main class="content settings">
      <div class="settings-section">Preferences</div>
      <div class="setting-row"><span>Weight unit</span>${seg('seg-unit', [['lbs', 'lbs'], ['kg', 'kg']], S.unit)}</div>
      <div class="setting-row"><span>Weight increment</span>
        <input type="number" inputmode="decimal" step="any" min="0.5" id="set-inc" class="text-input num-input" value="${S.weightIncrement}"></div>
      <div class="setting-row"><span>Rest timer (seconds)</span>
        <input type="number" inputmode="numeric" step="5" min="0" id="set-rest" class="text-input num-input" value="${S.restSeconds}"></div>

      <div class="settings-section">Backup</div>
      <div class="setting-row"><span>Backup reminder</span>
        ${seg('seg-backup', [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']], S.autoBackup)}</div>
      <p class="setting-note">When a backup is due you'll get a one-tap banner on the log screen.
        Last backup: ${S.lastBackupAt ? new Date(S.lastBackupAt).toLocaleDateString() : 'never'}.</p>
      <button class="btn btn-primary btn-block" id="backup-download">⬇ Download backup (JSON)</button>
      ${exporter.canShareFiles() ? '<button class="btn btn-ghost btn-block" id="backup-share">📤 Share backup (Drive, email…)</button>' : ''}
      <button class="btn btn-ghost btn-block" id="export-csv">⬇ Export CSV (FitNotes format)</button>

      <div class="settings-section">Import</div>
      <button class="btn btn-ghost btn-block" id="import-csv-btn">Import FitNotes CSV export</button>
      <button class="btn btn-ghost btn-block" id="import-db-btn">Import .fitnotes backup (sets, notes, routines)</button>
      <button class="btn btn-ghost btn-block" id="restore-json-btn">Restore JSON backup</button>
      <p class="setting-note">In FitNotes: Settings → Data Management → Export Workout Data (CSV), then open the file here. Re-importing is safe — duplicates are skipped.</p>

      <div class="settings-section">Data</div>
      <p class="setting-note">${setCount} sets stored on this device.
        Persistent storage: ${persisted ? 'granted ✓' : 'not granted (install the app to your home screen to protect data)'}.</p>
      <button class="btn btn-danger btn-block" id="delete-all">Delete all data</button>
      <p class="setting-note center">Workout Log v${APP_VERSION}</p>
      <input type="file" id="file-csv" accept=".csv,text/csv" class="visually-hidden">
      <input type="file" id="file-db" class="visually-hidden">
      <input type="file" id="file-json" accept=".json,application/json" class="visually-hidden">
    </main>`;

  const root = $app();
  wireHeader(root);

  const wireSeg = (id, key, parse = v => v) => {
    root.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.onclick = async () => {
      await setSetting(key, parse(b.dataset.val));
      rerender();
    });
  };
  wireSeg('seg-unit', 'unit');
  wireSeg('seg-backup', 'autoBackup');
  root.querySelector('#set-inc').onchange = e => setSetting('weightIncrement', parseFloat(e.target.value) || 5);
  root.querySelector('#set-rest').onchange = e => setSetting('restSeconds', parseInt(e.target.value, 10) || 0);

  root.querySelector('#backup-download').onclick = doBackupDownload;
  root.querySelector('#backup-share')?.addEventListener('click', doBackupShare);
  root.querySelector('#export-csv').onclick = doExportCSV;

  const fileCsv = root.querySelector('#file-csv');
  const fileDb = root.querySelector('#file-db');
  const fileJson = root.querySelector('#file-json');
  root.querySelector('#import-csv-btn').onclick = () => fileCsv.click();
  root.querySelector('#import-db-btn').onclick = () => fileDb.click();
  root.querySelector('#restore-json-btn').onclick = () => fileJson.click();
  fileCsv.onchange = () => { if (fileCsv.files[0]) handleCSVImport(fileCsv.files[0]); fileCsv.value = ''; };
  fileDb.onchange = () => { if (fileDb.files[0]) handleFitNotesDBImport(fileDb.files[0]); fileDb.value = ''; };
  fileJson.onchange = () => { if (fileJson.files[0]) handleJSONRestore(fileJson.files[0]); fileJson.value = ''; };

  root.querySelector('#delete-all').onclick = async () => {
    const once = await confirmDialog({
      title: 'Delete all data?',
      body: `This permanently deletes all ${setCount} sets, exercises and categories on this device.`,
      okLabel: 'Delete', danger: true,
    });
    if (!once) return;
    const twice = await confirmDialog({
      title: 'Are you absolutely sure?',
      body: 'There is no undo. Consider downloading a backup first.',
      okLabel: 'Yes, delete everything', danger: true,
    });
    if (!twice) return;
    await db.clearStore('sets');
    await db.clearStore('exercises');
    await db.clearStore('categories');
    await db.clearStore('routines');
    await setSetting('seeded', false);
    await seedIfNeeded();
    toast('All data deleted');
    rerender();
  };
}

// ---------------------------------------------------------------------------
// Service worker registration + update toast

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const root = document.getElementById('toast-root');
          const t = document.createElement('div');
          t.className = 'toast toast-action';
          t.innerHTML = 'Update ready <button class="btn btn-small btn-primary">Reload</button>';
          t.querySelector('button').onclick = () => {
            nw.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => location.reload(), 150);
          };
          root.appendChild(t);
        }
      });
    });
  }).catch(() => { /* offline first load — fine */ });
}

// ---------------------------------------------------------------------------
// Boot

async function main() {
  await db.openDB();
  await loadSettings();
  await seedIfNeeded();
  state.stack = [renderHome];
  await renderHome();
  registerSW();
}

main().catch(err => {
  document.getElementById('app').innerHTML =
    `<div class="empty-state"><p>Failed to start: ${esc(err.message)}</p></div>`;
  console.error(err);
});
