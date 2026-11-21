import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRemoteRows, rowsToPush, planLocalWrites, maxTime, errorMessage } from '../app/js/sync-core.js';
import { buildBackup } from '../app/js/backup.js';

const raw = {
  kv: [
    { key: 'profile', value: { weightKg: 80 }, updatedAt: '2026-11-20T10:00:00.000Z' },
    { key: 'draft', value: { day: 'A' }, updatedAt: '2026-11-21T10:00:00.000Z' },
    { key: 'sync', value: { refreshToken: 'gizli' } },
  ],
  workouts: [{ id: 'w1', date: '2026-11-20', updatedAt: '2026-11-20T18:00:00.000Z' }],
  daily: [{ date: '2026-11-21', weight: 79, updatedAt: '2026-11-21T08:00:00.000Z' }],
  padel: [{ id: 'p1', date: '2026-11-15', updatedAt: '2026-11-15T12:00:00.000Z', deletedAt: '2026-11-16T09:00:00.000Z' }],
  measurements: [],
};

test('yalnızca paylaşılan ayarlar gönderilir; taslak ve oturum cihazda kalır', () => {
  const rows = toRemoteRows(raw);
  const kv = rows.filter((r) => r.store === 'kv').map((r) => r.id);
  assert.deepEqual(kv, ['profile']);
  assert.ok(rows.find((r) => r.store === 'daily' && r.id === '2026-11-21'));
  assert.equal(rows.find((r) => r.store === 'padel').deleted, true);
});

test('son gönderimden sonra değişenler gönderilir', () => {
  const rows = rowsToPush(raw, '2026-11-20T12:00:00.000Z');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['2026-11-21', 'w1']);
  assert.equal(rowsToPush(raw, null).length, 4);
  assert.equal(maxTime(rows, 'updated_at'), '2026-11-21T08:00:00.000Z');
});

test('sunucudan yalnızca daha yeni kayıtlar alınır (son yazan kazanır)', () => {
  const remote = [
    { store: 'daily', id: '2026-11-21', data: { date: '2026-11-21', weight: 78.8 }, updated_at: '2026-11-21T09:00:00+00:00', deleted: false },
    { store: 'workouts', id: 'w1', data: { id: 'w1', date: '2026-11-20', note: 'eski' }, updated_at: '2026-11-19T09:00:00+00:00', deleted: false },
    { store: 'kv', id: 'settings', data: { key: 'settings', value: { phase: 'band' } }, updated_at: '2026-11-21T09:00:00+00:00', deleted: false },
    { store: 'kv', id: 'sync', data: { value: { refreshToken: 'x' } }, updated_at: '2030-01-01T00:00:00+00:00', deleted: false },
    { store: 'measurements', id: 'm1', data: { id: 'm1', date: '2026-11-21', waistCm: 92 }, updated_at: '2026-11-21T09:00:00+00:00', deleted: true },
  ];
  const w = planLocalWrites(raw, remote);
  assert.deepEqual(w.map((x) => `${x.store}/${x.record.key ?? x.record.id ?? x.record.date}`).sort(), ['daily/2026-11-21', 'kv/settings', 'measurements/m1']);
  assert.equal(w.find((x) => x.store === 'daily').record.weight, 78.8);
  assert.deepEqual(w.find((x) => x.store === 'kv').record, { key: 'settings', value: { phase: 'band' }, updatedAt: '2026-11-21T09:00:00.000Z' });
  assert.ok(w.find((x) => x.store === 'measurements').record.deletedAt);
});

test('yedek dosyasına oturum bilgisi girmez', () => {
  const b = buildBackup(raw);
  assert.ok(!b.data.kv.some((e) => e.key === 'sync'));
});

test('hata mesajları Türkçe', () => {
  assert.match(errorMessage({ error_code: 'invalid_credentials' }, 400), /hatalı/);
  assert.match(errorMessage({ code: 'PGRST202', message: 'Could not find the function public.sync_push' }, 404), /schema\.sql/);
});
