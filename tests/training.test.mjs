// 0.8.0: dengeli program (itiş/çekiş), süperset, süre tahmini, o günlük değişim, ilerleme özeti.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROGRAMS, EX, pairLabels, normalizePairs, estimateMinutes, shortItems, restAfterSet, alternativesFor, isAvailable,
  pairRestSec, PAIR_TRANSITION_SEC, warmupFor,
} from '../app/js/program.js';
import { ALTERNATIVES, videoUrl } from '../app/js/exercises.js';
import { workoutImprovements, improvementText } from '../app/js/stats.js';
import { parseProgram } from '../app/js/ai.js';

const PUSH = new Set(['pushup', 'wide_pushup', 'db_shoulder_press', 'band_shoulder_press', 'chair_dips']);
const PULL = new Set(['inverted_row', 'db_row', 'band_row', 'pullup', 'band_pulldown', 'db_rear_delt_fly', 'band_face_pull']);

test('her dönemde her gün itiş ve çekiş var; süperset çiftleri geçerli', () => {
  for (const [phase, days] of Object.entries(PROGRAMS)) {
    for (const day of ['A', 'B']) {
      const items = days[day];
      assert.ok(items.some((i) => PUSH.has(i.ex)), `${phase}/${day}: itiş yok`);
      assert.ok(items.some((i) => PULL.has(i.ex)), `${phase}/${day}: çekiş yok`);
      // Çiftler: aynı numara tam iki kez ve yan yana; normalizePairs değiştirmemeli
      assert.deepEqual(normalizePairs(items).map((i) => i.pair ?? null), items.map((i) => i.pair ?? null), `${phase}/${day}: çift hatalı`);
      for (const it of items) assert.ok(isAvailable(it.ex, phase), `${phase}/${day}: ${it.ex} bu dönemin ekipmanıyla yapılamaz`);
    }
  }
  // Ekipmansız dönemde artık sandalye dips (omuz riski) yok, sırt çekişi var
  const bw = [...PROGRAMS.bodyweight.A, ...PROGRAMS.bodyweight.B].map((i) => i.ex);
  assert.ok(!bw.includes('chair_dips'));
  assert.ok(bw.includes('inverted_row'));
  assert.equal(EX.inverted_row.variants[0], 'Yüzüstü Y-T kaldırma');
});

test('dambıl döneminde göğüs ve sırt haftada ~9 set (öncelik: omuz, sırt, göğüs)', () => {
  const weekly = (ids) => ['A', 'B'].reduce((n, d) => n + PROGRAMS.dumbbell[d].filter((i) => ids.includes(i.ex)).reduce((s, i) => s + i.sets, 0), 0) * 1.5;
  assert.ok(weekly(['pushup']) >= 9);
  assert.ok(weekly(['db_row', 'pullup']) >= 9);
  assert.ok(weekly(['goblet_squat', 'db_reverse_lunge']) >= 9);
});

test('süre tahmini: tam gün 30–40 dk, kısa ~20 dk; ısınmada padel hazırlığı', () => {
  for (const [phase, days] of Object.entries(PROGRAMS)) {
    for (const day of ['A', 'B']) {
      const m = estimateMinutes(days[day], 3, 75);
      assert.ok(m >= 25 && m <= 40, `${phase}/${day}: ${m} dk`);
      assert.ok(estimateMinutes(shortItems(days[day]), 3, 75) <= 20);
    }
  }
  assert.ok(warmupFor('dumbbell').some((x) => /Yana lunge/.test(x)));
  assert.equal(pairLabels([{ pair: 1 }, { pair: 1 }, {}, { pair: 2 }]).join(','), '1a,1b,,');
});

test('süperset dinlenmesi: eşe kısa geçiş, tur sonunda kısa dinlenme, sıradaki harekete kaydırma', () => {
  const ex = (name, done, total, pair = null) => ({ name, pair, sets: Array.from({ length: total }, (_, i) => ({ done: i < done })) });
  let L = [ex('Goblet squat', 1, 3, 1), ex('Dambıl row', 0, 3, 1), ex('Plank', 0, 3)];
  let r = restAfterSet(L, 0, 75);
  assert.deepEqual([r.seconds, r.nextIdx], [PAIR_TRANSITION_SEC, 1]);
  assert.match(r.label, /Dambıl row/);
  L = [ex('Goblet squat', 1, 3, 1), ex('Dambıl row', 1, 3, 1), ex('Plank', 0, 3)];
  r = restAfterSet(L, 1, 75);
  assert.deepEqual([r.seconds, r.nextIdx], [pairRestSec(75), 0]);
  assert.equal(pairRestSec(75), 45);
  assert.equal(pairRestSec(120), 90);
  L = [ex('Goblet squat', 3, 3, 1), ex('Dambıl row', 3, 3, 1), ex('Plank', 0, 3)];
  assert.equal(restAfterSet(L, 1, 75).nextIdx, 2);
  L = [ex('Goblet squat', 3, 3, 1), ex('Dambıl row', 3, 3, 1), ex('Plank', 1, 3)];
  r = restAfterSet(L, 2, 90);
  assert.deepEqual([r.seconds, r.nextIdx], [90, 2]);
  // Eş hareketin seti bittiyse (2 set + 3 set) geçiş değil dinlenme
  L = [ex('Lateral raise', 2, 2, 3), ex('Plank', 2, 3, 3)];
  assert.equal(restAfterSet(L, 1, 75).seconds, pairRestSec(75));
});

test('yapay zekâ programı: pair alanı okunur, hatalı çiftler temizlenir', () => {
  const json = {
    A: [{ ex: 'squat', sets: 3, min: 12, max: 15, pair: 1 }, { ex: 'pushup', sets: 3, min: 8, max: 12, pair: 1 }, { ex: 'plank', sets: 3, min: 20, max: 45, pair: 2 }],
    B: [{ ex: 'reverse_lunge', sets: 3, min: 8, max: 12, pair: 4 }, { ex: 'wide_pushup', sets: 3, min: 8, max: 12, pair: 4 }, { ex: 'inverted_row', sets: 3, min: 8, max: 12 }],
  };
  const p = parseProgram('```json\n' + JSON.stringify(json) + '\n```');
  assert.deepEqual(p.A.map((i) => i.pair ?? null), [1, 1, null]);
  assert.deepEqual(p.B.map((i) => i.pair ?? null), [1, 1, null]);
});

test('o günlük değişim: alternatifler tanımlı ve dönemde yapılabilir olanlarla sınırlı', () => {
  for (const [id, alts] of Object.entries(ALTERNATIVES)) {
    assert.ok(EX[id], id);
    for (const a of alts) assert.ok(EX[a], `${id} → ${a}`);
  }
  const NO_ALT = new Set(['db_wrist_ext']); // koruyucu küçük hareket: ağrı varsa o gün atlanır
  for (const [phase, days] of Object.entries(PROGRAMS)) {
    for (const it of [...days.A, ...days.B]) {
      const alts = alternativesFor(it.ex, phase);
      if (!NO_ALT.has(it.ex)) assert.ok(alts.length >= 1, `${phase}: ${it.ex} için seçenek yok`);
      for (const a of alts) assert.ok(isAvailable(a, phase), `${phase}: ${it.ex} → ${a}`);
    }
  }
  assert.ok(!alternativesFor('pullup', 'dumbbell').includes('band_pulldown'));
  assert.ok(alternativesFor('pullup', 'band').includes('band_pulldown'));
  assert.match(videoUrl('goblet_squat'), /^https:\/\/www\.youtube\.com\/results\?search_query=Goblet%20squat/);
});

test('antrenman sonu ilerleme özeti', () => {
  const ex = (exerciseId, reps, extra = {}) => ({ exerciseId, min: 8, max: 12, plannedSets: reps.length, sets: reps.map((r) => ({ reps: r, done: true })), ...extra });
  const prev = [{ id: 'p', date: '2026-11-20', exercises: [ex('pushup', [10, 9], { variant: 'Diz' }), ex('goblet_squat', [10, 10], { resistance: { kind: 'dumbbell', kg: 8 } }), ex('db_row', [12, 12], { resistance: { kind: 'dumbbell', kg: 10 } })] }];
  const cur = { id: 'c', date: '2026-11-22', exercises: [
    ex('pushup', [6, 5], { variant: 'Tam' }),
    ex('goblet_squat', [9, 8], { resistance: { kind: 'dumbbell', kg: 10 } }),
    ex('db_row', [10, 10], { resistance: { kind: 'dumbbell', kg: 10 } }), // geriledi
    ex('lateral_lunge', [8, 8], { min: 8, max: 8 }), // sabit sayılı → sayılmaz
  ] };
  const w = workoutImprovements(cur, prev);
  assert.deepEqual(w.map((x) => x.text), ['Şınav: Diz → Tam', 'Goblet squat: 8 → 10 kg']);
  assert.equal(improvementText('plank', { best: 40, total: 75 }, { best: 55, total: 100 }), 'Plank: en iyi set 40 → 55 sn');
  // İlk kez yapılan hareket ilerleme sayılmaz; düzenlemede kendisiyle kıyaslanmaz
  assert.deepEqual(workoutImprovements(cur, []), []);
  assert.deepEqual(workoutImprovements(prev[0], prev), []);
});
