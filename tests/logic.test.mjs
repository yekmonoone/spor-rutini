import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, daysBetween, parseNum, weekStart, weekday, fmtNum } from '../app/js/util.js';
import { computeTargets } from '../app/js/targets.js';
import { PROGRAMS, EX, nextStrengthDay, plannedSets, programWeek, blockOf, progressionHint, targetText } from '../app/js/program.js';
import { weeklyAverages, progressionDue, exerciseHistory, blockSummary, weekSummary } from '../app/js/stats.js';
import { validateBackup, buildBackup } from '../app/js/backup.js';

test('tarih yardımcıları', () => {
  assert.equal(weekday('2026-11-23'), 0); // Pazartesi
  assert.equal(weekday('2026-11-22'), 6); // Pazar
  assert.equal(weekStart('2026-11-21'), '2026-11-16');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-01', '2026-11-21'), 20);
});

test('sayı girişi virgül ve noktayı kabul eder', () => {
  assert.equal(parseNum('79,5'), 79.5);
  assert.equal(parseNum('79.5'), 79.5);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('abc'), null);
  assert.equal(fmtNum(79.5), '79,5');
});

test('hedef hesabı (örnek profil: 180 cm, 85 kg, erkek, 30 yaş, orta aktif)', () => {
  const t = computeTargets({ sex: 'male', weightKg: 85, heightCm: 180, birthYear: 1996, activity: 1.5 }, new Date(2026, 10, 21));
  assert.equal(t.age, 30);
  assert.equal(t.bmr, 1830);
  assert.equal(t.kcalMin, 2250);
  assert.equal(t.kcalMax, 2350);
  assert.equal(t.proteinMin, 140);
  assert.equal(t.proteinMax, 150);
  assert.ok(t.kcalMin >= t.kcalFloor);
  assert.equal(computeTargets({ sex: 'male', weightKg: 0, heightCm: 173, birthYear: 2001, activity: 1.5 }), null);
});

test('program yapısı: tüm hareketler kütüphanede tanımlı', () => {
  for (const [phase, days] of Object.entries(PROGRAMS)) {
    for (const day of ['A', 'B']) {
      assert.ok(days[day].length >= 5, `${phase} ${day}`);
      for (const item of days[day]) {
        assert.ok(EX[item.ex], `${phase}/${day}: ${item.ex} tanımsız`);
        assert.ok(item.min <= item.max);
      }
    }
  }
  assert.equal(targetText(PROGRAMS.band.B[0], 3), '3 × 8–12 · her bacak');
  assert.equal(targetText(PROGRAMS.band.A[4], 2), '2 × 20–45 sn');
});

test('ilk hafta 2 set, sonra 3; hafta/blok hesabı', () => {
  const item = PROGRAMS.band.A[0];
  assert.equal(plannedSets(item, 1), 2);
  assert.equal(plannedSets(item, 2), 3);
  assert.equal(programWeek('2026-11-23', '2026-11-23'), 1);
  assert.equal(programWeek('2026-11-23', '2026-11-30'), 2);
  assert.equal(programWeek('2026-11-23', '2026-11-20'), 0);
  assert.deepEqual(blockOf(5), { block: 2, weekInBlock: 1 });
});

test('A/B sırası dönüşümlü', () => {
  assert.equal(nextStrengthDay([]), 'A');
  assert.equal(nextStrengthDay([{ day: 'A' }]), 'B');
  assert.equal(nextStrengthDay([{ day: 'A' }, { day: 'B' }]), 'A');
});

function workout(date, exId, reps, extra = {}) {
  return {
    id: `w-${date}-${exId}`, date, day: 'A',
    exercises: [{ exerciseId: exId, plannedSets: reps.length, min: 12, max: 15, unit: 'reps', variant: extra.variant ?? null,
      resistance: extra.resistance ?? null, sets: reps.map((r) => ({ reps: r, rir: 2, done: true })) }],
  };
}

test('ilerleme: 2 seans üst üste üst sınır → zorlaştırma önerisi', () => {
  const r = { kind: 'miniband', level: 2 };
  const ws = [workout('2026-11-02', 'band_squat', [15, 15, 15], { resistance: r }), workout('2026-11-05', 'band_squat', [15, 15, 15], { resistance: r })];
  const due = progressionDue(ws, 'band_squat');
  assert.ok(due);
  assert.match(progressionHint('band_squat', due), /Orta/);
  // Bir set eksik kalırsa öneri yok
  const ws2 = [ws[0], workout('2026-11-05', 'band_squat', [15, 15, 13], { resistance: r })];
  assert.equal(progressionDue(ws2, 'band_squat'), null);
  // Yük değiştiyse öneri yok
  const ws3 = [ws[0], workout('2026-11-05', 'band_squat', [15, 15, 15], { resistance: { kind: 'miniband', level: 3 } })];
  assert.equal(progressionDue(ws3, 'band_squat'), null);
});

test('şınav seviyesi ilerleme önerisi', () => {
  assert.equal(progressionHint('pushup', { variant: 'Diz' }), 'Bir üst seviyeye geç: Tam.');
});

test('haftalık kilo ortalaması', () => {
  const daily = {
    '2026-11-02': { date: '2026-11-02', weight: 80 },
    '2026-11-04': { date: '2026-11-04', weight: 79 },
    '2026-11-10': { date: '2026-11-10', weight: 78.5 },
  };
  const w = weeklyAverages(daily, 'weight');
  assert.equal(w.length, 2);
  assert.equal(w[0].week, '2026-11-02');
  assert.equal(w[0].avg, 79.5);
  assert.equal(weeklyAverages(daily, 'weight', { minN: 2 }).length, 1);
});

test('hareket geçmişi yalnızca tamamlanan setleri sayar', () => {
  const w = workout('2026-11-02', 'squat', [12, 12]);
  w.exercises[0].sets.push({ reps: 20, done: false });
  const h = exerciseHistory([w], 'squat');
  assert.equal(h[0].total, 24);
  assert.equal(h[0].best, 12);
});

test('blok özeti ve hafta özeti', () => {
  const ws = [workout('2026-11-02', 'squat', [12, 12]), workout('2026-11-20', 'squat', [14, 14])];
  const s = blockSummary({ workouts: ws, padel: [], daily: {}, measurements: [] }, '2026-11-02', 1);
  assert.equal(s.strengthDone, 2);
  assert.equal(s.improved, 1);
  const ws2 = weekSummary({ workouts: ws, padel: [{ date: '2026-11-21' }], daily: { '2026-11-17': { date: '2026-11-17', brisk: true, sleepH: 7 } } }, '2026-11-21');
  assert.equal(ws2.strength, 1);
  assert.equal(ws2.padel, 1);
  assert.equal(ws2.brisk, 1);
  assert.equal(ws2.sleep, 7);
});

test('yedek doğrulama', () => {
  const b = buildBackup({ kv: [{ key: 'profile', value: {} }], workouts: [{ id: 'a', date: '2026-11-21' }], daily: [{ date: '2026-11-21', weight: 79 }] });
  const data = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(data.workouts.length, 1);
  assert.throws(() => validateBackup({ app: 'baska' }), /yedeği değil/);
  assert.throws(() => validateBackup({ ...b, format: 99 }), /daha yeni/);
  assert.throws(() => validateBackup({ ...b, data: { ...b.data, padel: [{ id: 'x' }] } }), /tarihsiz/);
});
