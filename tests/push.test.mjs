// 0.7.0: bildirim mantığı ve Web Push şifrelemesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { REMINDERS, defaultPrefs, normalizePrefs, localParts, dueTypes, buildMessage, dataFromRows, dayType } from '../supabase/functions/send-reminders/logic.js';
import { b64urlEncode, b64urlDecode, concat, encryptPayload, vapidHeader, sendPush } from '../supabase/functions/send-reminders/webpush.js';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

/* ---------- Mantık ---------- */

test('yerel saat: İstanbul (UTC+3), gün sınırı ve haftanın günü', () => {
  assert.deepEqual(localParts(new Date('2026-11-22T05:30:00Z')), { date: '2026-11-22', minutes: 8 * 60 + 30, weekday: 6 });
  assert.deepEqual(localParts(new Date('2026-11-22T21:30:00Z')), { date: '2026-11-23', minutes: 30, weekday: 0 });
  assert.equal(localParts(new Date('2026-11-22T05:30:00Z'), 'Bilinmeyen/Yer').minutes, 510); // geçersiz → İstanbul
});

test('zamanı gelen türler: pencere, günde bir kez, Pazar kontrolü, kapalı olanlar', () => {
  const at = (date, hhmm, weekday) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), weekday });
  assert.deepEqual(dueTypes(null, {}, at('2026-11-19', '08:29', 3)), []);
  assert.deepEqual(dueTypes(null, {}, at('2026-11-19', '08:30', 3)), ['weigh']);
  assert.deepEqual(dueTypes(null, {}, at('2026-11-19', '09:59', 3)), ['weigh']);
  assert.deepEqual(dueTypes(null, {}, at('2026-11-19', '10:00', 3)), []);
  assert.deepEqual(dueTypes(null, { weigh: '2026-11-19' }, at('2026-11-19', '08:45', 3)), []);
  assert.deepEqual(dueTypes(null, { weigh: '2026-11-18' }, at('2026-11-19', '08:45', 3)), ['weigh']);
  assert.deepEqual(dueTypes(null, {}, at('2026-11-19', '20:05', 3)), ['workout']); // Perşembe: checkin yok
  assert.deepEqual(dueTypes(null, {}, at('2026-11-22', '20:05', 6)), ['workout', 'checkin']);
  assert.deepEqual(dueTypes({ weigh: { on: false } }, {}, at('2026-11-19', '08:45', 3)), []);
  assert.deepEqual(dueTypes({ weigh: { on: true, time: '07:15' } }, {}, at('2026-11-19', '07:20', 3)), ['weigh']);
});

test('tercihler doğrulanır', () => {
  const p = normalizePrefs({ weigh: { on: false, time: '25:00' }, dayEnd: { time: '23:05' }, bogus: { on: true } });
  assert.equal(p.weigh.on, false);
  assert.equal(p.weigh.time, REMINDERS.weigh.time);
  assert.equal(p.dayEnd.time, '23:05');
  assert.ok(!('bogus' in p));
  assert.deepEqual(Object.keys(defaultPrefs()), ['weigh', 'workout', 'dayEnd', 'checkin']);
});

test('akıllı koşullar: yalnızca gerekiyorsa gönder', () => {
  const thu = { date: '2026-11-19', minutes: 1200, weekday: 3 };
  const fri = { date: '2026-11-20', minutes: 1200, weekday: 4 };
  const settings = { schedule: ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'], scheduleOverrides: {} };
  assert.ok(buildMessage('weigh', {}, thu));
  assert.equal(buildMessage('weigh', { daily: { weight: 80 } }, thu), null);
  assert.ok(buildMessage('workout', { settings }, thu));
  assert.equal(buildMessage('workout', { settings }, fri), null); // yürüyüş günü
  assert.equal(buildMessage('workout', { settings, workouts: [{ day: 'A' }] }, thu), null);
  assert.equal(buildMessage('workout', { settings, daily: { workoutSkipped: true } }, thu), null);
  const moved = { ...settings, scheduleOverrides: { '2026-11-19': 'walk', '2026-11-20': 'strength' } };
  assert.equal(dayType(moved, thu), 'walk');
  assert.equal(buildMessage('workout', { settings: moved }, thu), null);
  assert.ok(buildMessage('workout', { settings: moved }, fri));
  assert.equal(buildMessage('workout', { settings: { ...settings, programStart: '2026-12-01' } }, thu), null);
  assert.ok(buildMessage('dayEnd', { daily: { weight: 80 } }, thu));
  assert.equal(buildMessage('dayEnd', { daily: { steps: 8000 } }, thu), null);
  const sun = { date: '2026-11-22', minutes: 1210, weekday: 6 };
  assert.equal(buildMessage('checkin', {}, sun).url, './#/haftalik');
  assert.equal(buildMessage('checkin', { meta: { lastCheckin: '2026-11-16' } }, sun), null);
  assert.ok(buildMessage('checkin', { meta: { lastCheckin: '2026-11-09' } }, sun));
});

test('sunucu satırlarından bugünün verisi', () => {
  const rows = [
    { store: 'kv', id: 'settings', data: { key: 'settings', value: { schedule: ['rest'] } } },
    { store: 'kv', id: 'meta', data: { key: 'meta', value: { lastCheckin: '2026-11-16' } } },
    { store: 'daily', id: '2026-11-19', data: { date: '2026-11-19', weight: 80 } },
    { store: 'daily', id: '2026-11-18', data: { date: '2026-11-18', weight: 81 } },
    { store: 'workouts', id: 'a', data: { date: '2026-11-19', day: 'A' } },
    { store: 'workouts', id: 'b', data: { date: '2026-11-19', day: 'B' }, deleted: true },
  ];
  const d = dataFromRows(rows, '2026-11-19');
  assert.deepEqual(d.settings, { schedule: ['rest'] });
  assert.equal(d.meta.lastCheckin, '2026-11-16');
  assert.equal(d.daily.weight, 80);
  assert.deepEqual(d.workouts.map((w) => w.day), ['A']);
});

/* ---------- Web Push şifreleme (RFC 8291) ---------- */

async function hmac(key, data) {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, data));
}

/** Tarayıcının yapacağı çözme: alıcı anahtarlarıyla. */
async function decrypt(body, ua, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  assert.equal(plain[plain.length - 1], 2); // son kayıt ayıracı
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function receiver() {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64urlEncode(await subtle.exportKey('raw', ua.publicKey));
  return { ua, authSecret, keys: { p256dh, auth: b64urlEncode(authSecret) } };
}

test('base64url gidiş-dönüş', () => {
  const b = Uint8Array.from([0, 251, 255, 62, 63, 1]);
  assert.deepEqual(b64urlDecode(b64urlEncode(b)), b);
  assert.ok(!/[+/=]/.test(b64urlEncode(b)));
});

test('şifrelenen yük alıcı anahtarıyla çözülür (aes128gcm)', async () => {
  const r = await receiver();
  const payload = { title: '⚖️ Günaydın', body: 'Tartıl — ğüşıöç', url: './#/bugun' };
  const body = await encryptPayload(payload, r.keys);
  assert.equal(body[20], 65);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 16, 0]);
  assert.deepEqual(JSON.parse(await decrypt(body, r.ua, r.authSecret)), payload);
  // Yanlış auth ile çözülemez
  await assert.rejects(decrypt(body, r.ua, new Uint8Array(16)));
});

async function vapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64urlEncode(await subtle.exportKey('raw', kp.publicKey));
  const privateKey = (await subtle.exportKey('jwk', kp.privateKey)).d;
  return { kp, vapid: { publicKey, privateKey, subject: 'https://example.com/' } };
}

test('VAPID başlığı: geçerli ES256 imzası, doğru aud ve sub', async () => {
  const { kp, vapid } = await vapidKeys();
  const hdr = await vapidHeader('https://web.push.apple.com/abc/def', vapid, Date.UTC(2026, 10, 22));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
  assert.ok(m);
  assert.equal(m[4], vapid.publicKey);
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://example.com/');
  assert.equal(claims.exp, Date.UTC(2026, 10, 22) / 1000 + 12 * 3600);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64urlDecode(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.ok(ok);
});

test('gönderim: başlıklar, 201 → ok, 410 → gone', async () => {
  const { vapid } = await vapidKeys();
  const r = await receiver();
  const calls = [];
  const fake = (status) => async (url, init) => { calls.push({ url, init }); return { ok: status < 300, status }; };
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...r.keys };
  const res = await sendPush(sub, { title: 'Deneme' }, vapid, { fetchImpl: fake(201) });
  assert.deepEqual(res, { ok: true, status: 201, gone: false });
  const { init } = calls[0];
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(init.headers.TTL, String(4 * 3600));
  assert.match(init.headers.Authorization, /^vapid t=/);
  assert.equal(JSON.parse(await decrypt(init.body, r.ua, r.authSecret)).title, 'Deneme');
  assert.equal((await sendPush(sub, 'x', vapid, { fetchImpl: fake(410) })).gone, true);
});

test('RFC 8291 Ek A örneğiyle bayt bayt aynı çıktı', async () => {
  const asPub = b64urlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64urlEncode(asPub.slice(1, 33)), y: b64urlEncode(asPub.slice(33)), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', ext: true };
  const ephemeral = {
    privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const body = await encryptPayload('When I grow up, I want to be a watermelon',
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), ephemeral });
  assert.equal(b64urlEncode(body), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('uygulamadaki hatırlatma türleri sunucuyla aynı', async () => {
  const { PUSH_TYPES, defaultPushPrefs } = await import('../app/js/push-types.js');
  assert.deepEqual(defaultPushPrefs(), defaultPrefs());
  assert.deepEqual(Object.keys(PUSH_TYPES), Object.keys(REMINDERS));
});
