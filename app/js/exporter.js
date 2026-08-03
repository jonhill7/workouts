// Building export files (FitNotes-compatible CSV, JSON backup) and getting
// them off the device (download / Android share sheet).

import { KG_PER_LB, timeToString } from './importer.js';

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// FitNotes-compatible workout CSV (new-format header, so FitNotes itself and
// this app can both re-import it).
export function buildCSV({ sets, exercises, categories, unit }) {
  const exById = new Map(exercises.map(e => [e.id, e]));
  const catById = new Map(categories.map(c => [c.id, c]));
  const lines = ['Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment'];
  const sorted = [...sets].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0));
  for (const s of sorted) {
    const ex = exById.get(s.exerciseId);
    if (!ex) continue;
    const cat = catById.get(ex.categoryId);
    const weight = unit === 'lbs' ? round2(s.weight / KG_PER_LB) : round2(s.weight);
    const hasDist = s.distance > 0;
    const dist = hasDist ? (unit === 'lbs' ? round2(s.distance / 1609.344) : round2(s.distance / 1000)) : '';
    const distUnit = hasDist ? (unit === 'lbs' ? 'miles' : 'km') : '';
    lines.push([
      s.date,
      csvField(ex.name),
      csvField(cat ? cat.name : 'Other'),
      weight || '',
      weight ? unit : '',
      s.reps || '',
      dist,
      distUnit,
      s.time > 0 ? timeToString(s.time) : '',
      csvField(s.comment || ''),
    ].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function buildJSONBackup({ categories, exercises, sets, routines, settings, appVersion }) {
  return JSON.stringify({
    app: 'workout-log',
    format: 2,
    appVersion,
    exportedAt: new Date().toISOString(),
    settings,
    categories,
    exercises,
    sets,
    routines: routines || [],
  });
}

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles() {
  try {
    const f = new File(['x'], 'x.json', { type: 'application/json' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}

// Opens the Android share sheet — the route to Google Drive / Gmail backups.
export async function shareFile(filename, content, mime) {
  const file = new File([content], filename, { type: mime });
  await navigator.share({ files: [file], title: filename });
}

export function dateStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
