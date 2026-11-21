// IndexedDB katmanı. Veriler yalnızca bu cihazda, tarayıcının yerel veritabanında durur.

const DB_NAME = 'spor-rutini';
const DB_VERSION = 1;
export const STORES = ['kv', 'workouts', 'daily', 'padel', 'measurements'];

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' }).createIndex('date', 'date');
        if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('padel')) db.createObjectStore('padel', { keyPath: 'id' }).createIndex('date', 'date');
        if (!db.objectStoreNames.contains('measurements')) db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('date', 'date');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede açık. Diğer sekmeleri kapatıp tekrar deneyin.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('İşlem iptal edildi'));
  }));
}

export const idb = {
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),

  /** Tüm depoları tek işlemde boşaltıp verilen kayıtlarla doldurur (yedekten geri yükleme). */
  replaceAll: (data) => openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const s = tx.objectStore(name);
      s.clear();
      for (const rec of data?.[name] ?? []) s.put(rec);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Geri yükleme iptal edildi'));
  })),

  dumpAll: async () => {
    const out = {};
    for (const name of STORES) out[name] = await idb.getAll(name);
    return out;
  },
};

/** Tarayıcıdan verilerin kalıcı tutulmasını ister (destekleniyorsa). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* desteklenmiyor */ }
  return false;
}
