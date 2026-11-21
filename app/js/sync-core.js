// Eşitlemenin saf mantığı (testlerde de kullanılır): yerel kayıtları sunucu satırlarına çevirme
// ve sunucudan gelenlerden hangilerinin yerelde yazılacağını belirleme. Kural: son yazan kazanır.

export const SYNC_STORES = ['kv', 'workouts', 'daily', 'padel', 'measurements'];
/** Cihazlar arasında paylaşılan ayar anahtarları. 'draft' (yarım antrenman) ve 'sync' cihaza özeldir. */
export const SYNC_KV_KEYS = ['profile', 'settings', 'meta'];
const EPOCH = '2000-01-01T00:00:00.000Z';

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** dumpAll() çıktısını sunucu satırlarına çevirir. */
export function toRemoteRows(raw) {
  const out = [];
  for (const e of raw.kv ?? []) {
    if (!SYNC_KV_KEYS.includes(e.key)) continue;
    out.push({ store: 'kv', id: e.key, data: { key: e.key, value: e.value ?? null }, updated_at: e.updatedAt ?? EPOCH, deleted: false });
  }
  for (const store of ['workouts', 'daily', 'padel', 'measurements']) {
    for (const r of raw[store] ?? []) {
      const id = store === 'daily' ? r.date : r.id;
      if (!id) continue;
      out.push({ store, id, data: r, updated_at: r.updatedAt ?? EPOCH, deleted: !!r.deletedAt });
    }
  }
  return out;
}

/** Son gönderimden sonra değişen satırlar. since: ISO ya da null (hepsi). */
export function rowsToPush(raw, since) {
  const all = toRemoteRows(raw);
  if (!since) return all;
  const s = ms(since);
  return all.filter((r) => ms(r.updated_at) > s);
}

export function maxTime(rows, field) {
  let best = null;
  for (const r of rows) if (!best || ms(r[field]) > ms(best)) best = r[field];
  return best ? new Date(ms(best)).toISOString() : null;
}

/** Sunucudan gelen satırlardan yerelde daha yeni olanları { store, record } listesine çevirir. */
export function planLocalWrites(raw, remote) {
  const local = new Map(toRemoteRows(raw).map((r) => [`${r.store}/${r.id}`, ms(r.updated_at)]));
  const out = [];
  for (const r of remote) {
    if (!SYNC_STORES.includes(r.store)) continue;
    if (r.store === 'kv' && !SYNC_KV_KEYS.includes(r.id)) continue;
    const t = ms(r.updated_at);
    if (t <= (local.get(`${r.store}/${r.id}`) ?? -Infinity)) continue;
    const updatedAt = new Date(t).toISOString();
    if (r.store === 'kv') {
      out.push({ store: 'kv', record: { key: r.id, value: r.data?.value ?? null, updatedAt } });
    } else {
      const rec = { ...(r.data ?? {}), updatedAt };
      if (r.store === 'daily') rec.date = r.id; else rec.id = r.id;
      if (r.deleted && !rec.deletedAt) rec.deletedAt = updatedAt;
      out.push({ store: r.store, record: rec });
    }
  }
  return out;
}

/** Sunucu hata yanıtını Türkçe mesaja çevirir. */
export function errorMessage(json, status) {
  const code = json?.error_code ?? json?.code ?? json?.error ?? '';
  const msg = json?.msg ?? json?.message ?? json?.error_description ?? '';
  if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'E-posta veya şifre hatalı.';
  if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'E-postanı henüz onaylamadın. Gelen kutundaki bağlantıya tıkla, sonra giriş yap.';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'Bu e-postayla zaten hesap var. "Giriş yap"ı kullan.';
  if (code === 'weak_password' || /password should/i.test(msg)) return 'Şifre çok zayıf: en az 8 karakter kullan.';
  if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) return 'Bu projede yeni hesap açma kapalı.';
  if (code === 'over_email_send_rate_limit' || status === 429) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  if (code === 'PGRST202' || /sync_push/.test(msg)) return 'Veritabanı kurulmamış: schema.sql dosyasını Supabase SQL Editor\'da çalıştır.';
  if (code === '42P01') return 'Veritabanı tablosu yok: schema.sql dosyasını çalıştır.';
  if (status === 401 || status === 403) return 'Yetki hatası: tekrar giriş yap.';
  return msg ? `Sunucu hatası: ${msg}` : `Sunucu hatası (${status}).`;
}
