// Service worker önbellek listesi app/ klasöründeki tüm dosyaları içermeli; sürümler eşleşmeli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../app/js/version.js';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

test('sw.js ASSETS listesi tam ve sürüm uyumlu', async () => {
  const sw = await readFile(join(appDir, 'sw.js'), 'utf8');
  const version = sw.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(version, APP_VERSION, 'sw.js VERSION ile version.js APP_VERSION aynı olmalı');
  const listed = new Set([...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]));
  const files = (await walk(appDir))
    .map((f) => './' + relative(appDir, f).split(sep).join('/'))
    .filter((f) => f !== './sw.js');
  for (const f of files) assert.ok(listed.has(f), `ASSETS listesinde eksik: ${f}`);
  for (const f of listed) {
    if (f === './') continue;
    assert.ok(files.includes(f), `ASSETS listesinde olup diskte olmayan dosya: ${f}`);
  }
});
