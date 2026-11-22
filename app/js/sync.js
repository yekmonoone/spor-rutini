// 2. aşama: Supabase ile cihazlar arası eşitleme. Kütüphane yok; Supabase'in REST uçları doğrudan kullanılır.
// Bağlantı bilgileri ve oturum yalnızca bu cihazda (IndexedDB 'sync' anahtarı) tutulur; yedek dosyasına girmez.
// Şifre saklanmaz. Sunucu tarafında RLS herkesin yalnızca kendi satırlarını görmesini sağlar (supabase/schema.sql).
import { idb } from './db.js';
import { subscribe, applyRemote } from './store.js';
import { rowsToPush, planLocalWrites, maxTime, errorMessage } from './sync-core.js';

const KEY = 'sync';
const PAGE = 500;
const CHUNK = 200;

let cfg = null; // { url, anonKey, email, userId, accessToken, refreshToken, expiresAt, lastPushAt, pullCursor, lastSyncAt }
let status = { state: 'off', error: null };
const listeners = new Set();
let timer = null;
let running = null;
let again = false;

export const isConnected = () => !!cfg?.refreshToken;
export const getConfig = () => (cfg ? { url: cfg.url, anonKey: cfg.anonKey, email: cfg.email, lastSyncAt: cfg.lastSyncAt } : null);
export const getStatus = () => ({ ...status, connected: isConnected(), email: cfg?.email ?? null, lastSyncAt: cfg?.lastSyncAt ?? null });

export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(patch) {
  status = { ...status, ...patch };
  const s = getStatus();
  for (const fn of listeners) { try { fn(s); } catch (err) { console.error(err); } }
}

async function saveCfg() {
  if (cfg) await idb.put('kv', { key: KEY, value: cfg });
  else await idb.delete('kv', KEY);
}

function normalizeUrl(url) {
  let u = String(url ?? '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//.test(u)) u = `https://${u}`;
  // https zorunlu (yerel geliştirme sunucusu hariç).
  if (!/^https:\/\/[^/\s]+$/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) {
    throw new Error('Geçerli bir Supabase adresi gir (https://xxxx.supabase.co).');
  }
  return u;
}

async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}, retried = false) {
  if (!cfg?.url || !cfg?.anonKey) throw new Error('Eşitleme ayarlanmamış.');
  const h = { apikey: cfg.anonKey, 'Content-Type': 'application/json', ...headers };
  if (auth) {
    await ensureToken();
    h.Authorization = `Bearer ${cfg.accessToken}`;
  }
  let res;
  try {
    res = await fetch(cfg.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('İnternet bağlantısı yok — kayıtlar cihazda, bağlantı gelince eşitlenecek.'), { offline: true });
  }
  if (res.status === 401 && auth && !retried) {
    await refreshToken();
    return request(path, { method, body, auth, headers }, true);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw Object.assign(new Error(errorMessage(json, res.status)), { status: res.status });
  return json;
}

function storeSession(s) {
  cfg.accessToken = s.access_token;
  cfg.refreshToken = s.refresh_token;
  cfg.expiresAt = Date.now() + (s.expires_in ?? 3600) * 1000;
  cfg.userId = s.user?.id ?? cfg.userId;
  cfg.email = s.user?.email ?? cfg.email;
}

async function refreshToken() {
  const s = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: cfg.refreshToken } })
    .catch(async (err) => {
      if (err.status === 400 || err.status === 401) {
        // Oturum geçersiz: yeniden giriş gerekli (bağlantı adresi korunur).
        cfg.accessToken = null;
        cfg.refreshToken = null;
        await saveCfg();
        throw new Error('Oturum süresi doldu. Tekrar giriş yap.');
      }
      throw err;
    });
  storeSession(s);
  await saveCfg();
}

async function ensureToken() {
  if (!cfg?.refreshToken) throw new Error('Giriş yapılmamış.');
  if (!cfg.accessToken || Date.now() > (cfg.expiresAt ?? 0) - 60000) await refreshToken();
}

function startConfig(url, anonKey, email) {
  const u = normalizeUrl(url);
  const key = String(anonKey ?? '').trim();
  if (key.length < 20) throw new Error('Anahtar eksik görünüyor: "anon" ya da "publishable" anahtarının tamamını yapıştır.');
  if (/service_role|sb_secret_/.test(key)) throw new Error('Bu gizli (service_role/secret) anahtar! Onu asla uygulamaya girme; "anon/publishable" anahtarını kullan.');
  const same = cfg && cfg.url === u && cfg.email === email;
  cfg = { ...(same ? cfg : {}), url: u, anonKey: key, email: String(email ?? '').trim() };
  if (!same) { cfg.lastPushAt = null; cfg.pullCursor = null; }
}

export async function signIn({ url, anonKey, email, password }) {
  startConfig(url, anonKey, email);
  const s = await request('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: cfg.email, password } });
  storeSession(s);
  await saveCfg();
  setStatus({ state: 'idle', error: null });
  return syncNow();
}

/** Yeni hesap. E-posta onayı açıksa oturum dönmez; kullanıcı onaylayıp giriş yapar. */
export async function signUp({ url, anonKey, email, password }) {
  startConfig(url, anonKey, email);
  if (String(password ?? '').length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
  const s = await request('/auth/v1/signup', { method: 'POST', auth: false, body: { email: cfg.email, password } });
  if (s?.access_token) {
    storeSession(s);
    await saveCfg();
    setStatus({ state: 'idle', error: null });
    await syncNow();
    return { confirmed: true };
  }
  await saveCfg();
  return { confirmed: false };
}

export async function signOut() {
  if (cfg?.accessToken) {
    try { await request('/auth/v1/logout', { method: 'POST', auth: true }); } catch { /* yoksay */ }
  }
  if (cfg) {
    cfg = { url: cfg.url, anonKey: cfg.anonKey, email: cfg.email };
    await saveCfg();
  }
  setStatus({ state: 'off', error: null });
}

async function runOnce() {
  const raw = await idb.dumpAll();
  // 1) Gönder
  const push = rowsToPush(raw, cfg.lastPushAt);
  for (let i = 0; i < push.length; i += CHUNK) {
    await request('/rest/v1/rpc/sync_push', { method: 'POST', body: { rows: push.slice(i, i + CHUNK) } });
  }
  if (push.length) cfg.lastPushAt = maxTime(push, 'updated_at');
  // 2) Al
  let cursor = cfg.pullCursor ?? '1970-01-01T00:00:00Z';
  const remote = [];
  for (;;) {
    const q = `/rest/v1/records?select=store,id,data,updated_at,deleted,server_updated_at&server_updated_at=gt.${encodeURIComponent(cursor)}&order=server_updated_at.asc&limit=${PAGE}`;
    const page = await request(q);
    remote.push(...page);
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].server_updated_at;
  }
  const writes = planLocalWrites(raw, remote);
  if (remote.length) {
    // Aynı anda yazılan satırları kaçırmamak için 2 sn geriden devam et (yineleme zararsız).
    cfg.pullCursor = new Date(Date.parse(maxTime(remote, 'server_updated_at')) - 2000).toISOString();
  }
  cfg.lastSyncAt = new Date().toISOString();
  await saveCfg();
  await applyRemote(writes);
  return { pushed: push.length, pulled: writes.length };
}

/** Hemen eşitle. Çalışan bir eşitleme varsa bitince bir kez daha çalışır. */
export async function syncNow() {
  if (!isConnected()) return null;
  if (running) { again = true; return running; }
  setStatus({ state: 'syncing', error: null });
  running = (async () => {
    try {
      let result;
      do {
        again = false;
        result = await runOnce();
      } while (again);
      setStatus({ state: 'idle', error: null });
      return result;
    } catch (err) {
      console.warn('Eşitleme hatası:', err);
      setStatus({ state: isConnected() ? 'error' : 'off', error: err.message });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

export function scheduleSync(delay = 2500) {
  if (!isConnected()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, delay);
}

export async function initSync() {
  try {
    cfg = (await idb.get('kv', KEY))?.value ?? null;
  } catch { cfg = null; }
  setStatus({ state: isConnected() ? 'idle' : 'off', error: null });
  subscribe(() => scheduleSync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
  window.addEventListener('online', () => scheduleSync(500));
  if (isConnected()) scheduleSync(300);
}

/** Diğer modüller için oturumlu REST çağrısı (ör. bildirim aboneliği). Giriş yoksa hata fırlatır. */
export function rest(path, opts) {
  return request(path, opts);
}
export const currentUserId = () => cfg?.userId ?? null;

/** Edge Function çağrısı (oturumla). */
export function callFunction(name, body) {
  return request(`/functions/v1/${name}`, { method: 'POST', body });
}
