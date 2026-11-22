// 0.6.0: ölçüm temeli, haftalık kontrol, eğer–o zaman, antrenman geri bildirimi, bakım, seri.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAlerts, checkinWeek, weightQuiet } from '../app/js/rules.js';
import { trendWeight, trendRate, movingAverageSeries, activeDays, weeklyStreak, compareTests, testHistory } from '../app/js/stats.js';
import { whtr, inMaintenance, effectiveTargets, maintenanceWeek, calibrate } from '../app/js/targets.js';
import { normalizeIfThen, planFor, suggestedIfThen, MAX_IFTHEN } from '../app/js/ifthen.js';
import { buildPrompt } from '../app/js/ai.js';
import { addDays } from '../app/js/util.js';

const daily = (pairs) => Object.fromEntries(pairs.map(([date, weight]) => [date, { date, weight }]));
const ids = (alerts) => alerts.map((a) => a.id.split('@')[0]);
const profile = { sex: 'male', weightKg: 85, heightCm: 180, birthYear: 1995, activity: 1.375, proteinMin: 130, proteinMax: 140, kcalMin: 2050, kcalMax: 2150, kcalFloor: 1750 };
const base = (over = {}) => ({
  profile,
  settings: { phase: 'bodyweight', schedule: ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'] },
  meta: { dismissed: {}, lastBackupAt: '2026-11-20' },
  workouts: [],
  padel: [],
  measurements: [{ id: 'm1', date: '2026-11-20', waistCm: 92, photo: true }],
  daily: {},
  today: '2026-11-19',
  startKey: '2026-11-02',
  ...over,
});

test('trend kilo: 7 günlük ortalama, en az 3 tartı', () => {
  const d = daily([['2026-11-10', 80], ['2026-11-12', 79.6], ['2026-11-14', 79.4], ['2026-11-17', 79.2], ['2026-11-19', 79], ['2026-11-21', 78.8]]);
  assert.equal(trendWeight(d, '2026-11-11'), null); // tek tartı
  assert.ok(Math.abs(trendWeight(d, '2026-11-21') - (79.2 + 79 + 78.8) / 3) < 1e-9);
  const rate = trendRate(d, '2026-11-21'); // 79,0 − 79,667
  assert.ok(rate < -0.6 && rate > -0.7);
  const series = movingAverageSeries(d);
  assert.deepEqual(series.map((p) => p.date), ['2026-11-14', '2026-11-17', '2026-11-19', '2026-11-21']);
});

test('bel/boy oranı ve NICE kategorisi', () => {
  const w = whtr(95, 180);
  assert.equal(w.ratio, 0.53);
  assert.equal(w.level, 'increased');
  assert.equal(w.targetWaist, 90);
  assert.equal(whtr(80, 180).level, 'healthy');
  assert.equal(whtr(110, 180).level, 'high');
  assert.equal(whtr(null, 180), null);
});

test('kalibrasyon tabanın altına inmez', () => {
  assert.deepEqual(calibrate(profile, -150), { kcalMin: 1900, kcalMax: 2000, shift: -150 });
  assert.deepEqual(calibrate({ ...profile, kcalMin: 1800, kcalMax: 1900 }, -150), { kcalMin: 1750, kcalMax: 1850, shift: -50 });
  assert.equal(calibrate({ ...profile, kcalMin: 1750, kcalMax: 1850 }, -150), null);
  assert.equal(calibrate(profile, 150).kcalMin, 2200);
});

test('yavaş kilo kaybı → −150 kcal aksiyonu; kalibrasyondan sonra 14 gün susar', () => {
  // 4 hafta, haftada ~0,1 kg kayıp (Pazartesi 2026-10-26'dan başlayarak)
  const pairs = [];
  for (let w = 0; w < 4; w++) for (const d of [0, 2, 4]) pairs.push([addDays('2026-10-26', w * 7 + d), 80 - w * 0.1]);
  const ctx = base({ daily: daily(pairs), today: '2026-11-25', startKey: '2026-10-26' });
  const slow = evaluateAlerts(ctx).find((a) => a.id.startsWith('wt-slow'));
  assert.ok(slow);
  assert.equal(slow.action.to, 'kcal:-150');
  const quiet = evaluateAlerts({ ...ctx, meta: { ...ctx.meta, lastCalibration: { date: '2026-11-20', delta: -150 } } });
  assert.ok(!ids(quiet).includes('wt-slow'));
  assert.ok(ids(evaluateAlerts({ ...ctx, meta: { ...ctx.meta, lastCalibration: { date: '2026-11-05', delta: -150 } } })).includes('wt-slow'));
});

test('bakım dönemi: hedef = tahmini harcama, kilo uyarıları susar, seri kırılmaz', () => {
  const settings = { maintenanceFrom: '2026-11-16', maintenanceUntil: '2026-11-29' };
  assert.ok(inMaintenance(settings, '2026-11-20'));
  assert.ok(!inMaintenance(settings, '2026-11-30'));
  const t = effectiveTargets(profile, settings, '2026-11-20', new Date('2026-11-20'));
  assert.ok(t.maintenance && t.kcalMin > profile.kcalMin);
  assert.equal(effectiveTargets(profile, settings, '2026-12-01').kcalMin, profile.kcalMin);
  assert.ok(weightQuiet({ settings, meta: {}, today: '2026-11-20' }));
  assert.ok(weightQuiet({ settings, meta: {}, today: '2026-12-05' })); // bitişten sonra 14 gün
  assert.ok(!weightQuiet({ settings, meta: {}, today: '2026-12-20' }));
  assert.ok(maintenanceWeek(settings, '2026-11-16'));
  assert.ok(maintenanceWeek(settings, '2026-11-23'));
  assert.ok(!maintenanceWeek(settings, '2026-11-09'));
});

test('bakım önerisi 13. haftada, bakımdayken çıkmaz', () => {
  const start = '2026-08-03';
  const week13 = addDays(start, 12 * 7 + 1);
  assert.ok(ids(evaluateAlerts(base({ today: week13, startKey: start }))).includes('maint'));
  assert.ok(!ids(evaluateAlerts(base({ today: addDays(week13, 7), startKey: start }))).includes('maint'));
  const inM = base({ today: week13, startKey: start, settings: { ...base().settings, maintenanceFrom: week13, maintenanceUntil: addDays(week13, 13) } });
  assert.ok(!ids(evaluateAlerts(inM)).includes('maint'));
});

test('haftalık seri: ≥2 kuvvet haftaları, bu hafta eksikse kırılmaz, bakım haftası atlanır', () => {
  const w = (date, day = 'A') => ({ id: date, date, day, exercises: [] });
  const workouts = [w('2026-11-02'), w('2026-11-04', 'B'), w('2026-11-09'), w('2026-11-11', 'B'), w('2026-11-16')];
  assert.equal(weeklyStreak({ workouts }, '2026-11-19'), 2); // bu hafta 1 → sayılmaz ama kırmaz
  assert.equal(weeklyStreak({ workouts: [...workouts, w('2026-11-18', 'B')] }, '2026-11-19'), 3);
  // 9 Kasım haftası boş ama bakım → zincir 2 Kasım'a uzanır
  const gap = [w('2026-11-02'), w('2026-11-04', 'B'), w('2026-11-16'), w('2026-11-18', 'B')];
  assert.equal(weeklyStreak({ workouts: gap }, '2026-11-19'), 1);
  assert.equal(weeklyStreak({ workouts: gap }, '2026-11-19', { isMaintenanceWeek: (k) => k === '2026-11-09' }), 2);
});

test('aktif gün: antrenman, padel ya da yürüyüş olan farklı günler', () => {
  const state = {
    workouts: [{ date: '2026-11-02' }, { date: '2026-11-03' }],
    padel: [{ date: '2026-11-03' }, { date: '2026-11-07' }],
    daily: { '2026-11-04': { date: '2026-11-04', walked: true }, '2026-11-05': { date: '2026-11-05', walked: false } },
  };
  assert.equal(activeDays(state, '2026-11-01'), 4);
  assert.equal(activeDays(state, '2026-11-04'), 2);
});

test('güç testi geçmişi ve karşılaştırma; test zamanı uyarısı', () => {
  const t1 = { id: 't1', kind: 'test', date: '2026-11-03', pushupLevel: 'Diz', pushupReps: 12, plankSec: 40, squat60: 30 };
  const t2 = { id: 't2', kind: 'test', date: '2026-12-01', pushupLevel: 'Tam', pushupReps: 6, plankSec: 65, squat60: 36 };
  const ms = [t2, { id: 'm', date: '2026-11-10', waistCm: 91 }, t1];
  assert.deepEqual(testHistory(ms).map((x) => x.id), ['t1', 't2']);
  assert.deepEqual(compareTests(t1, t2), ['Şınav: Diz 12 → Tam 6', 'Plank: 40 sn → 65 sn', 'Squat (1 dk): 30 → 36']);
  // İlk 14 gün test uyarısı yok (başlangıç kartı var), sonra "ilk test"
  assert.ok(!ids(evaluateAlerts(base({ today: '2026-11-10' }))).includes('test'));
  assert.ok(ids(evaluateAlerts(base({ today: '2026-11-17' }))).includes('test'));
  // Son test 26 günden yeniyse uyarı yok
  assert.ok(!ids(evaluateAlerts(base({ today: '2026-11-25', measurements: [t1] }))).includes('test'));
  assert.ok(ids(evaluateAlerts(base({ today: '2026-12-01', measurements: [t1] }))).includes('test'));
});

test('haftalık kontrol: Pazar ve Pazartesi, yapıldıysa çıkmaz', () => {
  assert.equal(checkinWeek('2026-11-22'), '2026-11-16'); // Pazar
  assert.equal(checkinWeek('2026-11-23'), '2026-11-16'); // Pazartesi → geçen hafta
  assert.equal(checkinWeek('2026-11-19'), null);
  assert.ok(ids(evaluateAlerts(base({ today: '2026-11-22' }))).includes('checkin'));
  assert.ok(!ids(evaluateAlerts(base({ today: '2026-11-22', meta: { dismissed: {}, lastBackupAt: '2026-11-20', lastCheckin: '2026-11-16' } }))).includes('checkin'));
  assert.ok(!ids(evaluateAlerts(base({ today: '2026-11-19' }))).includes('checkin'));
});

test('ağrı tekrarı padel + antrenmanı birlikte sayar; iki "çok zor" → uyarı', () => {
  const pad = [{ id: 'p1', date: '2026-11-10', pain: ['wrist'] }];
  const ws = [
    { id: 'w1', date: '2026-11-16', day: 'A', exercises: [], effort: 'hard', pain: ['wrist'] },
    { id: 'w2', date: '2026-11-18', day: 'B', exercises: [], effort: 'hard' },
  ];
  const a = evaluateAlerts(base({ padel: pad, workouts: ws }));
  const pain = a.find((x) => x.id.startsWith('pain-wrist'));
  assert.ok(pain && /padel \+ antrenman/.test(pain.body));
  assert.ok(ids(a).includes('effort'));
  ws[1].effort = 'good';
  assert.ok(!ids(evaluateAlerts(base({ padel: [], workouts: ws }))).includes('effort'));
});

test('eğer–o zaman: doğrulama, en fazla 3, bilinmeyen tetikleyici atılır', () => {
  const list = normalizeIfThen([
    { trigger: 'busy', text: '  Kısa antrenman  ' },
    { trigger: 'busy', text: 'tekrar' },
    { trigger: 'nope', text: 'x' },
    { trigger: 'eatout', text: '' },
    { trigger: 'craving', text: 'a'.repeat(300) },
    { trigger: 'nowalk', text: 'fazla' },
  ]);
  assert.equal(list.length, MAX_IFTHEN);
  assert.equal(list[0].text, 'Kısa antrenman');
  assert.ok(list[1].text.length > 5); // boş → öneri
  assert.equal(list[2].text.length, 140);
  assert.equal(planFor({ ifThen: list }, 'busy').text, 'Kısa antrenman');
  assert.equal(planFor({ ifThen: list }, 'padelcancel'), null);
  assert.equal(suggestedIfThen().length, 3);
});

test('yapay zekâ mesajı zorluk, ağrı, test ve planları içerir', () => {
  const state = {
    profile, settings: { ...base().settings, ifThen: [{ trigger: 'busy', text: '20 dk kısa antrenman' }] }, meta: {},
    workouts: [{ id: 'w', date: '2026-11-18', day: 'A', exercises: [], effort: 'hard', pain: ['knee'] }],
    padel: [], daily: {}, mealplan: null, shopping: null,
    measurements: [{ id: 't', kind: 'test', date: '2026-11-03', pushupLevel: 'Diz', pushupReps: 12, plankSec: 40 }],
  };
  const text = buildPrompt('review', { state, today: '2026-11-19', startKey: '2026-11-02', alerts: [] });
  assert.match(text, /çok zor/);
  assert.match(text, /ağrı: Diz/);
  assert.match(text, /plank 40 sn/);
  assert.match(text, /20 dk kısa antrenman/);
});
