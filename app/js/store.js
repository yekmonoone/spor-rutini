// Uygulama durumu: tüm veriler açılışta belleğe yüklenir, her değişiklik IndexedDB'ye yazılır.
// Silmeler "yumuşak" yapılır (deletedAt) — 2. aşamadaki bulut eşitlemesi için.
import { idb } from './db.js';
import { byDate, deepCopy, dateKey } from './util.js';
import { validateBackup } from './backup.js';

const KV_KEYS = ['profile', 'settings', 'meta', 'draft', 'mealplan', 'shopping'];
const listeners = new Set();

export const state = {
  ready: false,
  profile: null,
  settings: null,
  meta: null,
  draft: null,
  mealplan: null,   // yemek planı { prefs, days, customMeals, source, note, updatedAt }
  shopping: null,   // alışveriş işaretleri { cycle, checked, extra }
  workouts: [],
  padel: [],
  measurements: [],
  daily: {},
};

export function defaultSettings() {
  return {
    phase: 'bodyweight',          // 'bodyweight' | 'band' | 'dumbbell'
    programStart: null,           // 'YYYY-AA-GG'
    restSec: 75,
    sound: true,
    aiEnabled: false,
    aiTarget: 'claude',           // 'claude' | 'chatgpt' | 'gemini' | 'other'
    customProgram: null,          // yapay zekâdan aktarılan program { phase, A, B, note, appliedAt }
    // Pazartesi → Pazar
    schedule: ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'],
  };
}

export function defaultMeta() {
  return { dismissed: {}, lastBackupAt: null };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

function applyRaw(raw) {
  state.profile = null;
  state.settings = defaultSettings();
  state.meta = defaultMeta();
  state.draft = null;
  state.mealplan = null;
  state.shopping = null;
  for (const { key, value } of raw?.kv ?? []) {
    if (key === 'settings') state.settings = { ...defaultSettings(), ...(value ?? {}) };
    else if (key === 'meta') state.meta = { ...defaultMeta(), ...(value ?? {}) };
    else if (KV_KEYS.includes(key)) state[key] = value ?? null;
  }
  const live = (arr) => (arr ?? []).filter((r) => r && !r.deletedAt);
  state.workouts = live(raw?.workouts).sort(byDate);
  state.padel = live(raw?.padel).sort(byDate);
  state.measurements = live(raw?.measurements).sort(byDate);
  state.daily = Object.fromEntries(live(raw?.daily).map((r) => [r.date, r]));
  state.ready = true;
}

export async function loadAll() {
  applyRaw(await idb.dumpAll());
}

export async function setKV(key, value, { silent = false } = {}) {
  state[key] = value;
  await idb.put('kv', { key, value: deepCopy(value), updatedAt: new Date().toISOString() });
  if (!silent) emit();
}

/** Eşitlemeden gelen daha yeni kayıtları yazar ve durumu yeniler. writes: [{ store, record }] */
export async function applyRemote(writes) {
  if (!writes.length) return;
  await idb.putMany(writes);
  await loadAll();
  emit();
}

export function updateSettings(patch) {
  return setKV('settings', { ...state.settings, ...patch });
}

export function updateMeta(patch, opts) {
  return setKV('meta', { ...state.meta, ...patch }, opts);
}

function stamp(rec) {
  const now = new Date().toISOString();
  const out = { ...rec, createdAt: rec.createdAt ?? now, updatedAt: now };
  delete out.deletedAt;
  return out;
}

/** workouts / padel / measurements için ekle-güncelle. */
export async function saveRecord(store, rec) {
  const r = stamp(rec);
  await idb.put(store, r);
  const list = state[store];
  const i = list.findIndex((x) => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  list.sort(byDate);
  emit();
  return r;
}

export async function deleteRecord(store, id) {
  const list = state[store];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  const now = new Date().toISOString();
  await idb.put(store, { ...list[i], deletedAt: now, updatedAt: now });
  list.splice(i, 1);
  emit();
}

/** Günlük kayıt: tarih başına tek kayıt, alanlar birleştirilir. */
export async function saveDaily(date, values) {
  const r = stamp({ ...(state.daily[date] ?? {}), ...values, date });
  await idb.put('daily', r);
  state.daily[date] = r;
  emit();
  return r;
}

export async function deleteDaily(date) {
  const prev = state.daily[date];
  if (!prev) return;
  const now = new Date().toISOString();
  await idb.put('daily', { ...prev, deletedAt: now, updatedAt: now });
  delete state.daily[date];
  emit();
}

export function dismissAlert(id) {
  const dismissed = { ...(state.meta.dismissed ?? {}), [id]: dateKey() };
  const keys = Object.keys(dismissed);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete dismissed[k];
  return updateMeta({ dismissed });
}

/** Yedekten geri yükler: mevcut tüm verilerin yerini alır. */
export async function importBackup(obj) {
  const data = validateBackup(obj);
  // Eşitleme bağlantısı cihaza özeldir; geri yüklemede korunur.
  const sync = await idb.get('kv', 'sync');
  data.kv = data.kv.filter((e) => e.key !== 'sync');
  if (sync) data.kv.push(sync);
  await idb.replaceAll(data);
  await loadAll();
  emit();
}

export async function wipeAll() {
  await idb.replaceAll({});
  applyRaw({});
  emit();
}

export async function dumpRaw() {
  return idb.dumpAll();
}
