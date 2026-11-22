// 0.7.0: Web Push bildirimleri. Abonelik Supabase'teki push_subscriptions tablosunda tutulur;
// hatırlatmaları sunucudaki zamanlayıcı gönderir (supabase/functions/send-reminders).
import { VAPID_PUBLIC_KEY } from './config.js';
import { isConnected, rest, callFunction } from './sync.js';
import { isIOS, isStandalone } from './env.js';
import { defaultPushPrefs, PUSH_TYPES } from './push-types.js';

const PREFS_KEY = 'push-prefs';

function urlB64ToUint8Array(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function localPrefs() {
  const base = defaultPushPrefs();
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    for (const k of Object.keys(base)) if (saved?.[k]) base[k] = { ...base[k], ...saved[k] };
  } catch { /* yoksay */ }
  return base;
}

function storePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* yoksay */ }
}

/** Bildirimlerin bu cihazda kullanılıp kullanılamayacağı ve neden. */
export function pushSupport() {
  if (!isConnected()) return { ok: false, reason: 'sync' };
  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-browser' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  return { ok: true };
}

async function registration() {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Uygulama arka plan bileşeni hazır değil. Uygulamayı kapatıp tekrar aç.')), 8000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentSubscription() {
  if (!pushSupport().ok) return null;
  try {
    const reg = await registration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';
const byEndpoint = (endpoint) => `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;

async function saveSubscription(sub, prefs) {
  const j = sub.toJSON();
  await rest('/rest/v1/push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs, tz: tz(), updated_at: new Date().toISOString() },
  });
}

/** Dokunuşla çağrılmalı (iOS izni yalnızca kullanıcı etkileşiminde sorar). */
export async function enablePush(prefs = localPrefs()) {
  const perm = await Notification.requestPermission(); // ilk await: izin isteği dokunuşa bağlı kalmalı
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Bildirim izni verilmedi. iPhone Ayarlar → Bildirimler → Spor Rutini\'den açabilirsin.'
    : 'Bildirim izni verilmedi.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
  try {
    await saveSubscription(sub, prefs);
  } catch (err) {
    if (err.status === 404) throw new Error('Sunucuda bildirim tablosu yok — kurulum (supabase/BILDIRIM-KURULUM.md) henüz yapılmamış.');
    throw err;
  }
  storePrefs(prefs);
  return sub;
}

export async function updatePushPrefs(prefs) {
  const sub = await currentSubscription();
  storePrefs(prefs);
  if (!sub) return;
  // Satır silinmişse (ör. sunucu temizlediyse) yeniden oluştur.
  await saveSubscription(sub, prefs);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await rest(byEndpoint(sub.endpoint), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch (err) { console.warn(err); }
  await sub.unsubscribe();
}

export async function sendTestPush() {
  const r = await callFunction('send-reminders', { test: true });
  if (!r?.subs) throw new Error('Bu hesapta kayıtlı bildirim aboneliği bulunamadı.');
  return r;
}

export { PUSH_TYPES };
