// FitNotes .fitnotes backup import. The backup file is a SQLite database;
// sql.js (WASM, vendored under vendor/) opens it in the browser.
// parseFitNotesDB() is pure given a sql.js Database, so it is testable in Node.

let sqlPromise = null;

// Browser-only: loads vendor/sql-wasm.js on first use (then runtime-cached by
// the service worker, so later imports work offline).
export function loadSqlJs() {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/sql-wasm.js';
      s.onload = () =>
        window.initSqlJs({ locateFile: f => 'vendor/' + f }).then(resolve, reject);
      s.onerror = () => {
        sqlPromise = null;
        reject(new Error('Could not load the SQLite engine — connect to the internet once and retry.'));
      };
      document.head.appendChild(s);
    });
  }
  return sqlPromise;
}

export function looksLikeSQLite(bytes) {
  const magic = 'SQLite format 3';
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

// Returns { rows, exerciseNotes, routines, allExercises }:
//   rows           — normalized sets (same shape the CSV importer produces)
//   exerciseNotes  — Map(exercise nameLower → notes text)
//   routines       — [{ name, exercises: [{ name, sets } in order] }]; sets is
//                    the backup's template set count, 0 when it has none
//   allExercises   — [{ name, category }] every exercise defined in the backup
// Every table/column read is defensive: FitNotes' schema is not documented,
// so anything missing simply yields an empty result for that feature.
export function parseFitNotesDB(db) {
  const q = sql => {
    try {
      const r = db.exec(sql);
      return r[0] || { columns: [], values: [] };
    } catch {
      return null;
    }
  };
  const rowsOf = res => !res ? [] :
    res.values.map(v => Object.fromEntries(res.columns.map((c, i) => [c.toLowerCase(), v[i]])));

  const cats = rowsOf(q('SELECT * FROM Category'));
  const exs = rowsOf(q('SELECT * FROM exercise'));
  const logs = rowsOf(q('SELECT * FROM training_log'));
  if (!exs.length || !logs.length) {
    throw new Error('This does not look like a FitNotes backup (no exercise / training_log tables).');
  }

  const catName = new Map(cats.map(c => [c._id, String(c.name ?? '')]));
  const exById = new Map(exs.map(e => [e._id, e]));

  // Comments live in a polymorphic Comment(owner_type_id, owner_id, comment)
  // table. The owner_type id for training_log isn't documented, so pick the
  // owner_type group whose owner_ids overlap the training_log ids the most.
  const commentByLog = new Map();
  const comments = rowsOf(q('SELECT * FROM Comment'));
  if (comments.length && 'owner_id' in comments[0] && 'comment' in comments[0]) {
    const logIds = new Set(logs.map(l => l._id));
    const groups = new Map();
    for (const c of comments) {
      const t = c.owner_type_id ?? 0;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(c);
    }
    let best = null, bestHits = 0;
    for (const list of groups.values()) {
      const hits = list.filter(c => logIds.has(c.owner_id)).length;
      if (hits > bestHits) { bestHits = hits; best = list; }
    }
    for (const c of best || []) {
      if (logIds.has(c.owner_id)) commentByLog.set(c.owner_id, String(c.comment ?? ''));
    }
  }

  const rows = [];
  for (const l of logs) {
    const ex = exById.get(l.exercise_id);
    if (!ex) continue;
    const date = String(l.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      date,
      exercise: String(ex.name ?? ''),
      category: catName.get(ex.category_id) || 'Other',
      weightKg: Number(l.metric_weight) || 0,   // FitNotes stores kg internally
      reps: Math.round(Number(l.reps) || 0),
      distanceM: Number(l.distance) || 0,        // stored in metres
      timeSec: Math.round(Number(l.duration_seconds) || 0),
      comment: commentByLog.get(l._id) || '',
    });
  }

  const exerciseNotes = new Map();
  for (const e of exs) {
    if (e.notes) exerciseNotes.set(String(e.name ?? '').toLowerCase(), String(e.notes));
  }

  const routines = [];
  const rts = rowsOf(q('SELECT * FROM Routine'));
  const sections = rowsOf(q('SELECT * FROM RoutineSection'));
  const secExs = rowsOf(q('SELECT * FROM RoutineSectionExercise'));
  // Template sets live one table deeper; count them per routine exercise.
  const tmplSetCount = new Map();
  for (const ts of rowsOf(q('SELECT * FROM RoutineSectionExerciseSet'))) {
    const k = ts.routine_section_exercise_id;
    tmplSetCount.set(k, (tmplSetCount.get(k) || 0) + 1);
  }
  if (rts.length && secExs.length) {
    const secsByRoutine = new Map();
    for (const s of sections) {
      if (!secsByRoutine.has(s.routine_id)) secsByRoutine.set(s.routine_id, []);
      secsByRoutine.get(s.routine_id).push(s);
    }
    const exsBySection = new Map();
    for (const se of secExs) {
      if (!exsBySection.has(se.routine_section_id)) exsBySection.set(se.routine_section_id, []);
      exsBySection.get(se.routine_section_id).push(se);
    }
    const order = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
    for (const r of rts) {
      const entries = [];
      for (const s of (secsByRoutine.get(r._id) || []).sort(order)) {
        for (const it of (exsBySection.get(s._id) || []).sort(order)) {
          const e = exById.get(it.exercise_id);
          if (e) entries.push({ name: String(e.name ?? ''), sets: tmplSetCount.get(it._id) || 0 });
        }
      }
      if (entries.length) routines.push({ name: String(r.name ?? 'Routine'), exercises: entries });
    }
  }

  const allExercises = exs.map(e => ({
    name: String(e.name ?? ''),
    category: catName.get(e.category_id) || 'Other',
  }));

  return { rows, exerciseNotes, routines, allExercises };
}
