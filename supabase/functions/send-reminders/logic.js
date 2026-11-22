// Hatırlatmaların saf mantığı (Edge Function ve Node testleri ortak kullanır).
// "Akıllı": yalnızca gerekiyorsa gönderilir — tartı girildiyse sabah bildirimi gelmez vb.

export const REMINDERS = {
  weigh: { label: 'Sabah tartı', time: '08:30', url: './#/bugun' },
  workout: { label: 'Antrenman', time: '19:45', url: './#/bugun' },
  dayEnd: { label: 'Gün sonu', time: '22:30', url: './#/bugun' },
  checkin: { label: 'Pazar haftalık kontrol', time: '20:00', url: './#/haftalik' },
};

/** Zaman geldikten sonra bu kadar dakika içinde gönderilebilir (zamanlayıcı gecikse de kaçmasın). */
export const SEND_WINDOW_MIN = 90;

export const DEFAULT_SCHEDULE = ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'];

export function defaultPrefs() {
  return Object.fromEntries(Object.entries(REMINDERS).map(([k, r]) => [k, { on: true, time: r.time }]));
}

export function normalizePrefs(p) {
  const out = defaultPrefs();
  for (const k of Object.keys(out)) {
    const v = p?.[k];
    if (!v) continue;
    if (typeof v.on === 'boolean') out[k].on = v.on;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time ?? '')) out[k].time = v.time;
  }
  return out;
}

const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Saat dilimine göre yerel tarih ('YYYY-AA-GG'), gün içi dakika ve haftanın günü (0 = Pazartesi). */
export function localParts(now, tz = 'Europe/Istanbul') {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    return localParts(now, 'Europe/Istanbul');
  }
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')), weekday: WD[g('weekday')] };
}

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function addDays(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Zamanı gelmiş ve bugün henüz gönderilmemiş hatırlatma türleri. */
export function dueTypes(prefs, lastSent, local) {
  const p = normalizePrefs(prefs);
  return Object.keys(REMINDERS).filter((k) => {
    if (!p[k].on || lastSent?.[k] === local.date) return false;
    if (k === 'checkin' && local.weekday !== 6) return false;
    const t = toMin(p[k].time);
    return local.minutes >= t && local.minutes < t + SEND_WINDOW_MIN;
  });
}

/** O günün planı (güne özel değişiklik öncelikli). */
export function dayType(settings, local) {
  const o = settings?.scheduleOverrides?.[local.date];
  if (o) return o;
  return (settings?.schedule ?? DEFAULT_SCHEDULE)[local.weekday] ?? 'rest';
}

const isStrength = (w) => w?.day === 'A' || w?.day === 'B';

/**
 * Gönderilecek bildirim ya da null. data: { settings, meta, daily (bugünün kaydı), workouts (bugünün antrenmanları) }
 */
export function buildMessage(type, data, local) {
  const { settings = null, meta = null, daily = null, workouts = [] } = data ?? {};
  const url = REMINDERS[type]?.url ?? './#/bugun';
  if (type === 'weigh') {
    if (daily?.weight != null) return null;
    return { title: '⚖️ Günaydın', body: 'Tuvaletten sonra, aç karnına tartıl — 10 saniye. Uykunu da yaz.', url, tag: 'weigh' };
  }
  if (type === 'workout') {
    if (settings?.programStart && settings.programStart > local.date) return null;
    const t = dayType(settings, local);
    if (t !== 'strength' && t !== 'flex') return null;
    if (workouts.some(isStrength) || daily?.workoutSkipped) return null;
    return { title: '💪 Bugün antrenman günü', body: 'Yürüyüşten sonra başla. Vaktin azsa 20 dakikalık kısa antrenman da sayılır.', url, tag: 'workout' };
  }
  if (type === 'dayEnd') {
    if (daily?.steps != null) return null;
    return { title: '🌙 Günü kapat', body: 'Adımını yaz; plandan saptıysan bir cümle not bırak.', url, tag: 'dayEnd' };
  }
  if (type === 'checkin') {
    const wk = addDays(local.date, -local.weekday);
    if (meta?.lastCheckin && meta.lastCheckin >= wk) return null;
    return { title: '🗓️ Haftalık kontrol', body: '3 dakika: haftanı özetle, gelecek haftayı ve planlarını gözden geçir.', url, tag: 'checkin' };
  }
  return null;
}

/** Sunucu satırlarından (records) bugünün verisini çıkarır. rows: [{ store, id, data, deleted }] */
export function dataFromRows(rows, date) {
  const live = (rows ?? []).filter((r) => !r.deleted);
  const kv = (key) => live.find((r) => r.store === 'kv' && r.id === key)?.data?.value ?? null;
  return {
    settings: kv('settings'),
    meta: kv('meta'),
    daily: live.find((r) => r.store === 'daily' && r.id === date)?.data ?? null,
    workouts: live.filter((r) => r.store === 'workouts' && r.data?.date === date).map((r) => r.data),
  };
}
