// IndexedDB wrapper — all persistence lives here.

const DB_NAME = 'workout-log';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const cats = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      cats.createIndex('nameLower', 'nameLower', { unique: true });
      const ex = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
      ex.createIndex('nameLower', 'nameLower', { unique: true });
      ex.createIndex('categoryId', 'categoryId');
      const sets = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
      sets.createIndex('date', 'date');
      sets.createIndex('exerciseId', 'exerciseId');
      sets.createIndex('exerciseDate', ['exerciseId', 'date']);
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function reqP(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return reqP((await store(name)).getAll());
}

export async function get(name, key) {
  return reqP((await store(name)).get(key));
}

export async function getAllByIndex(name, index, key) {
  return reqP((await store(name)).index(index).getAll(key));
}

export async function put(name, value) {
  return reqP((await store(name, 'readwrite')).put(value));
}

export async function del(name, key) {
  return reqP((await store(name, 'readwrite')).delete(key));
}

export async function clearStore(name) {
  return reqP((await store(name, 'readwrite')).clear());
}

// Insert many records in a single transaction. Returns assigned keys.
export async function bulkPut(name, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const os = tx.objectStore(name);
    const keys = [];
    for (const v of values) {
      const r = os.put(v);
      r.onsuccess = () => keys.push(r.result);
    }
    tx.oncomplete = () => resolve(keys);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function bulkDelete(name, keys) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const os = tx.objectStore(name);
    for (const k of keys) os.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
