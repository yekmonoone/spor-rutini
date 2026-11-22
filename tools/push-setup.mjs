// Bildirim kurulumu için anahtarları üretir (bağımlılık yok).
// Kullanım: node tools/push-setup.mjs https://xxxx.supabase.co
//  - supabase/.secrets.local       → VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET (gizli, depoya girmez)
//  - supabase/push-setup.local.sql → push.sql'in doldurulmuş hâli (gizli değer içerir, depoya girmez)
//  - app/js/config.js              → yalnızca AÇIK anahtar (gizli değil, uygulamada gerekir)
// Anahtarlar zaten varsa yeniden üretilmez (aksi halde mevcut abonelikler geçersiz olur); --yeni ile zorla.
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secretsPath = join(root, 'supabase', '.secrets.local');
const sqlPath = join(root, 'supabase', 'push-setup.local.sql');
const configPath = join(root, 'app', 'js', 'config.js');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const url = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.error('Supabase proje adresini ver: node tools/push-setup.mjs https://xxxx.supabase.co');
  process.exit(1);
}

let secrets = {};
if (existsSync(secretsPath) && !process.argv.includes('--yeni')) {
  for (const line of readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) secrets[m[1]] = m[2];
  }
}
if (!secrets.VAPID_PUBLIC_KEY || !secrets.VAPID_PRIVATE_KEY) {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  secrets.VAPID_PUBLIC_KEY = b64url(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  secrets.VAPID_PRIVATE_KEY = (await webcrypto.subtle.exportKey('jwk', kp.privateKey)).d;
  console.log('Yeni VAPID anahtar çifti üretildi.');
}
if (!secrets.CRON_SECRET) secrets.CRON_SECRET = b64url(webcrypto.getRandomValues(new Uint8Array(24)));

writeFileSync(secretsPath, Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
const sql = readFileSync(join(root, 'supabase', 'push.sql'), 'utf8')
  .replaceAll('__PROJECT_URL__', url)
  .replaceAll('__CRON_SECRET__', secrets.CRON_SECRET);
writeFileSync(sqlPath, sql);
writeFileSync(configPath, [
  '// Bildirimler (Web Push) için VAPID AÇIK anahtarı — gizli değildir; tools/push-setup.mjs üretir.',
  `export const VAPID_PUBLIC_KEY = '${secrets.VAPID_PUBLIC_KEY}';`,
  '',
].join('\n'));
console.log('Yazıldı: supabase/.secrets.local, supabase/push-setup.local.sql, app/js/config.js');
