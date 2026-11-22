// Supabase Edge Function: zamanı gelen hatırlatmaları Web Push ile gönderir.
// - Zamanlayıcı (pg_cron, 15 dakikada bir) "x-cron-secret" başlığıyla çağırır → tüm abonelikler için akıllı hatırlatmalar.
// - Uygulama, giriş yapmış kullanıcının oturumuyla { "test": true } gönderirse → yalnızca o kullanıcıya deneme bildirimi.
// Gizli değerler (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik verilir.
import { buildMessage, dataFromRows, dueTypes, localParts } from './logic.js';
import { sendPush } from './webpush.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const URL_ = env('SUPABASE_URL');
const SERVICE_KEY = env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const VAPID = {
  publicKey: env('VAPID_PUBLIC_KEY'),
  privateKey: env('VAPID_PRIVATE_KEY'),
  subject: env('VAPID_SUBJECT') || 'https://yekmonoone.github.io/spor-rutini/',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Servis anahtarıyla REST (RLS'yi aşar; yalnızca bu fonksiyonda kullanılır). */
async function db(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) };
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; prefs: Record<string, unknown>; tz: string; last_sent: Record<string, string> };

async function userData(userId: string, date: string) {
  const u = `user_id=eq.${userId}`;
  const sel = 'select=store,id,data,deleted';
  const [kv, daily, workouts] = await Promise.all([
    db(`records?${sel}&${u}&store=eq.kv&id=in.(settings,meta)`),
    db(`records?${sel}&${u}&store=eq.daily&id=eq.${date}`),
    db(`records?${sel}&${u}&store=eq.workouts&data->>date=eq.${date}`),
  ]);
  return dataFromRows([...kv, ...daily, ...workouts], date);
}

async function removeSub(endpoint: string) {
  await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
}

async function runReminders(now: Date) {
  const subs: Sub[] = await db('push_subscriptions?select=*');
  const cache = new Map<string, Promise<ReturnType<typeof dataFromRows>>>();
  let sent = 0;
  let gone = 0;
  for (const sub of subs) {
    try {
      const local = localParts(now, sub.tz);
      const types = dueTypes(sub.prefs, sub.last_sent, local);
      if (!types.length) continue;
      const key = `${sub.user_id}|${local.date}`;
      if (!cache.has(key)) cache.set(key, userData(sub.user_id, local.date));
      const data = await cache.get(key)!;
      const last = { ...(sub.last_sent ?? {}) };
      let dead = false;
      for (const type of types) {
        last[type] = local.date; // gerek yoksa da işaretle: aynı gün tekrar bakılmaz
        const msg = buildMessage(type, data, local);
        if (!msg) continue;
        const r = await sendPush(sub, msg, VAPID);
        if (r.gone) { dead = true; break; }
        if (r.ok) sent++;
        else console.error('Gönderilemedi', r.status, new URL(sub.endpoint).host);
      }
      if (dead) { await removeSub(sub.endpoint); gone++; continue; }
      await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
        method: 'PATCH', body: JSON.stringify({ last_sent: last }), headers: { Prefer: 'return=minimal' },
      });
    } catch (err) {
      console.error('Abonelik atlandı:', (err as Error).message);
    }
  }
  return { subs: subs.length, sent, gone };
}

async function sendTest(token: string) {
  const res = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return json({ error: 'Oturum geçersiz' }, 401);
  const user = await res.json();
  const subs: Sub[] = await db(`push_subscriptions?select=*&user_id=eq.${user.id}`);
  let sent = 0;
  for (const sub of subs) {
    const r = await sendPush(sub, { title: '🔔 Deneme bildirimi', body: 'Bildirimler çalışıyor. Hatırlatmalar seçtiğin saatlerde, yalnızca gerekiyorsa gelir.', url: './#/ayarlar', tag: 'test' }, VAPID, { ttl: 600 });
    if (r.gone) await removeSub(sub.endpoint);
    else if (r.ok) sent++;
  }
  return json({ subs: subs.length, sent });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST gerekli' }, 405);
  if (!VAPID.publicKey || !VAPID.privateKey || !SERVICE_KEY) return json({ error: 'Sunucu ayarları eksik (VAPID / servis anahtarı)' }, 500);
  try {
    const secret = env('CRON_SECRET');
    if (secret && req.headers.get('x-cron-secret') === secret) return json(await runReminders(new Date()));
    const body = await req.json().catch(() => ({}));
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (body?.test && token) return await sendTest(token);
    return json({ error: 'Yetkisiz' }, 401);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
