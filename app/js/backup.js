// Yedek dosyası biçimi ve doğrulaması (saf fonksiyonlar — testlerde de kullanılır).
import { APP_VERSION } from './version.js';
import { isDateKey } from './util.js';

export const BACKUP_APP = 'spor-rutini';
export const BACKUP_FORMAT = 1;
const LIST_STORES = ['workouts', 'daily', 'padel', 'measurements'];

export function buildBackup(raw, now = new Date()) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      // Eşitleme bilgileri (oturum anahtarları) yedek dosyasına girmez.
      kv: (raw.kv ?? []).filter((e) => e.key !== 'sync'),
      workouts: raw.workouts ?? [],
      daily: raw.daily ?? [],
      padel: raw.padel ?? [],
      measurements: raw.measurements ?? [],
    },
  };
}

export function backupFileName(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `spor-rutini-yedek-${d}.json`;
}

/** Yedek nesnesini doğrular; geçerliyse depolanacak veriyi döndürür, değilse Türkçe hata fırlatır. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Dosya okunamadı: geçerli bir yedek değil.');
  if (obj.app !== BACKUP_APP) throw new Error('Bu dosya Spor Rutini yedeği değil.');
  if (typeof obj.format !== 'number' || obj.format > BACKUP_FORMAT) {
    throw new Error('Bu yedek daha yeni bir uygulama sürümüyle alınmış. Önce uygulamayı güncelleyin.');
  }
  const data = obj.data;
  if (!data || typeof data !== 'object') throw new Error('Yedekte veri bölümü yok.');

  const out = { kv: [] };
  if (!Array.isArray(data.kv ?? [])) throw new Error('Yedek bozuk: ayarlar bölümü hatalı.');
  for (const item of data.kv ?? []) {
    if (!item || typeof item.key !== 'string') throw new Error('Yedek bozuk: ayar kaydı hatalı.');
    out.kv.push(item);
  }
  for (const name of LIST_STORES) {
    const arr = data[name] ?? [];
    if (!Array.isArray(arr)) throw new Error(`Yedek bozuk: "${name}" bölümü hatalı.`);
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object' || !isDateKey(rec.date)) {
        throw new Error(`Yedek bozuk: "${name}" içinde tarihsiz kayıt var.`);
      }
      if (name !== 'daily' && typeof rec.id !== 'string') {
        throw new Error(`Yedek bozuk: "${name}" içinde kimliksiz kayıt var.`);
      }
    }
    out[name] = arr;
  }
  return out;
}

export function countRecords(data) {
  return LIST_STORES.reduce((n, name) => n + (data?.[name]?.filter((r) => !r.deletedAt).length ?? 0), 0);
}
