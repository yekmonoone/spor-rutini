import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAlerts } from '../app/js/rules.js';
import { addDays } from '../app/js/util.js';

const profile = { proteinMin: 130, proteinMax: 140, kcalMin: 2150, kcalMax: 2250, kcalFloor: 1750 };
const base = (over = {}) => ({
  profile,
  settings: { phase: 'band' },
  meta: { dismissed: {}, lastBackupAt: '2026-11-20' },
  workouts: [],
  padel: [],
  measurements: [{ id: 'm1', date: '2026-11-20', waistCm: 92, photo: true }],
  daily: {},
  today: '2026-11-19', // Perşembe
  startKey: '2026-11-02',
  ...over,
});
const ids = (alerts) => alerts.map((a) => a.id.split('@')[0]);

test('perşembe ve 0 kuvvet → uyarı; 3 kuvvet → başarı', () => {
  assert.ok(ids(evaluateAlerts(base())).includes('str-low'));
  const ws = ['2026-11-16', '2026-11-17', '2026-11-18'].map((d, i) => ({ id: `w${i}`, date: d, day: i % 2 ? 'B' : 'A', exercises: [] }));
  const a = evaluateAlerts(base({ workouts: ws }));
  assert.ok(ids(a).includes('str-ok'));
  assert.ok(!ids(a).includes('str-low'));
});

test('gizlenen uyarı tekrar görünmez', () => {
  const a = evaluateAlerts(base());
  const id = a.find((x) => x.id.startsWith('str-low')).id;
  const b = evaluateAlerts(base({ meta: { dismissed: { [id]: '2026-11-19' }, lastBackupAt: '2026-11-20' } }));
  assert.ok(!b.some((x) => x.id === id));
});

test('protein 3 gün düşük → uyarı', () => {
  const daily = {};
  for (let i = 1; i <= 3; i++) {
    const d = addDays('2026-11-19', -i);
    daily[d] = { date: d, proteinG: 100 };
  }
  assert.ok(ids(evaluateAlerts(base({ daily }))).includes('prot'));
  daily['2026-11-18'].proteinG = 135;
  assert.ok(!ids(evaluateAlerts(base({ daily }))).includes('prot'));
});

test('uyku ortalaması 7 saatin altında → uyarı', () => {
  const daily = {};
  for (let i = 0; i < 4; i++) {
    const d = addDays('2026-11-19', -i);
    daily[d] = { date: d, sleepH: 6 };
  }
  assert.ok(ids(evaluateAlerts(base({ daily }))).includes('sleep'));
});

test('kilo çok hızlı düşerse uyarı', () => {
  const daily = {};
  const put = (d, w) => { daily[d] = { date: d, weight: w }; };
  put('2026-11-03', 80); put('2026-11-05', 80);      // hafta 2026-11-02 ort. 80
  put('2026-11-10', 78.9); put('2026-11-12', 78.9);  // hafta 2026-11-09 ort. 78,9 → %1,4
  assert.ok(ids(evaluateAlerts(base({ daily, today: '2026-11-17' }))).includes('wt-fast'));
});

test('3 hafta yavaş kilo kaybı → kalibrasyon önerisi', () => {
  const daily = {};
  const weeks = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
  weeks.forEach((wk, i) => {
    for (const off of [1, 3]) { const d = addDays(wk, off); daily[d] = { date: d, weight: 80 - i * 0.1 }; }
  });
  const a = evaluateAlerts(base({ daily, today: '2026-11-17', startKey: '2026-10-19' }));
  const slow = a.find((x) => x.id.startsWith('wt-slow'));
  assert.ok(slow);
  assert.match(slow.body, /2\.000–2\.100 kcal/);
});

test('padelde tekrarlayan dirsek ağrısı → uyarı', () => {
  const padel = [
    { id: 'p1', date: '2026-11-08', pain: ['elbow'] },
    { id: 'p2', date: '2026-11-15', pain: ['elbow', 'knee'] },
  ];
  const a = evaluateAlerts(base({ padel }));
  assert.ok(ids(a).includes('pain-elbow'));
  assert.ok(!ids(a).includes('pain-knee'));
});

test('ölçüm ve yedek hatırlatmaları', () => {
  const a = evaluateAlerts(base({ measurements: [], meta: { dismissed: {}, lastBackupAt: null }, daily: { '2026-11-18': { date: '2026-11-18', weight: 79 } }, workouts: [{ id: 'w', date: '2026-11-18', day: 'A', exercises: [] }, { id: 'w2', date: '2026-11-17', day: 'B', exercises: [] }] }));
  assert.ok(ids(a).includes('measure'));
  assert.ok(ids(a).includes('backup'));
});

test('blok sonu değerlendirmesi 5. haftanın ilk günlerinde görünür', () => {
  const a = evaluateAlerts(base({ today: '2026-11-30', startKey: '2026-11-02' }));
  assert.ok(ids(a).includes('block'));
});

test('uyarılar önem sırasına göre gelir', () => {
  const ws = ['2026-11-16', '2026-11-17', '2026-11-18'].map((d, i) => ({ id: `w${i}`, date: d, day: 'A', exercises: [] }));
  const daily = {};
  for (let i = 0; i < 4; i++) { const d = addDays('2026-11-19', -i); daily[d] = { date: d, sleepH: 5 }; }
  const a = evaluateAlerts(base({ workouts: ws, daily }));
  assert.equal(a[0].level, 'warn');
  assert.equal(a[a.length - 1].level, 'success');
});
