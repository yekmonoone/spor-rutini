// 0.7.1: ev seti = dambıl + kapı barfiks barı + mat (bantsız); ekipmansız → dambıl yolu.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROGRAMS, EX, PHASE_ORDER, warmupFor, progressionHint } from '../app/js/program.js';
import { evaluateAlerts } from '../app/js/rules.js';
import { isImprovement } from '../app/js/stats.js';
import { buildPrompt, unavailableExercises, allowedExerciseList } from '../app/js/ai.js';
import { addDays } from '../app/js/util.js';

const SCHEDULE = ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'];
const ids = (alerts) => alerts.map((a) => a.id.split('@')[0]);
const w = (date, day = 'A', exercises = []) => ({ id: `w-${date}`, date, day, exercises });
const base = (over = {}) => ({
  profile: { proteinMin: 130, proteinMax: 140, kcalMin: 2050, kcalMax: 2150, kcalFloor: 1750 },
  settings: { phase: 'bodyweight', schedule: SCHEDULE },
  meta: { dismissed: {}, lastBackupAt: '2026-11-18' },
  workouts: [],
  padel: [],
  measurements: [{ id: 'm1', date: '2026-11-17', waistCm: 92, photo: true }],
  daily: {},
  today: '2026-11-19', // program haftası 3 (başlangıç 2 Kasım)
  startKey: '2026-11-02',
  ...over,
});

test('dambıl programı bant gerektirmez; dönem sırası ekipmansız → dambıl → bant', () => {
  for (const item of [...PROGRAMS.dumbbell.A, ...PROGRAMS.dumbbell.B]) {
    assert.ok(EX[item.ex], `tanımsız hareket: ${item.ex}`);
    assert.ok(!['band', 'miniband'].includes(EX[item.ex].resist), `bant gerektiriyor: ${item.ex}`);
  }
  assert.ok(!warmupFor('dumbbell').some((x) => /bant/i.test(x)));
  assert.ok(warmupFor('dumbbell').some((x) => /dambılla dış rotasyon/.test(x)));
  assert.ok(warmupFor('band').some((x) => /Bant ile dış rotasyon/.test(x)));
  assert.ok(!warmupFor('bodyweight').some((x) => /rotasyon/.test(x)));
  assert.deepEqual(PHASE_ORDER, ['bodyweight', 'dumbbell', 'band']);
});

test('ev seti uyarısı: ekipmansız dönemde 3 hafta düzenli gidince', () => {
  const six = ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18'].map((d, i) => w(d, i % 2 ? 'B' : 'A'));
  const a = evaluateAlerts(base({ workouts: six })).find((x) => x.id.startsWith('weights'));
  assert.ok(a);
  assert.equal(a.action.to, '/ayarlar');
  assert.match(a.body, /barfiks/);
  assert.match(a.body, /Bant gerekmez/);
  // 5 seans → henüz yok
  assert.ok(!ids(evaluateAlerts(base({ workouts: six.slice(1) }))).includes('weights'));
  // 2. hafta → erken
  assert.ok(!ids(evaluateAlerts(base({ workouts: six.slice(0, 4).concat([w('2026-11-10'), w('2026-11-12', 'B')]), today: '2026-11-13' }))).includes('weights'));
  // Dambıl ya da bant dönemine geçildiyse yok
  for (const phase of ['dumbbell', 'band']) {
    assert.ok(!ids(evaluateAlerts(base({ workouts: six, settings: { phase, schedule: SCHEDULE } }))).includes('weights'));
  }
});

test('ev seti uyarısı: bacaklar vücut ağırlığını aştıysa az seansla da', () => {
  const top = { exerciseId: 'squat', min: 12, max: 15, plannedSets: 3, sets: [15, 15, 15].map((reps) => ({ done: true, reps })) };
  const a = evaluateAlerts(base({ workouts: [w('2026-11-16', 'A', [top]), w('2026-11-18', 'A', [top])] })).find((x) => x.id.startsWith('weights'));
  assert.ok(a);
  assert.match(a.title, /Bacaklar/);
});

test('varyant ilerlemesi: önce kilo, sonra zor varyant', () => {
  const kg = (n) => ({ kind: 'dumbbell', kg: n });
  assert.ok(isImprovement('db_reverse_lunge',
    { variant: 'Geriye lunge', resistance: kg(10), total: 36, best: 12 },
    { variant: 'Bulgar split squat', resistance: kg(6), total: 24, best: 8 }));
  assert.ok(isImprovement('pullup',
    { variant: 'Sandalye destekli', resistance: null, total: 30, best: 10 },
    { variant: 'Negatif (3–5 sn iniş)', resistance: null, total: 12, best: 4 }));
  assert.ok(isImprovement('db_rdl',
    { variant: 'İki bacak', resistance: kg(10), total: 36, best: 12 },
    { variant: 'Tek bacak', resistance: kg(8), total: 24, best: 8 }));
  assert.match(progressionHint('db_reverse_lunge', { variant: 'Geriye lunge', resistance: kg(10) }), /kg artır.*Bulgar split squat/);
  assert.equal(progressionHint('pullup', { variant: 'Negatif (3–5 sn iniş)', resistance: null }), 'Bir üst seviyeye geç: Barfiks.');
  assert.equal(progressionHint('db_reverse_lunge', { variant: 'Bulgar split squat', resistance: kg(10) }), 'Dambılı 1–2,5 kg artır.');
});

test('yapay zekâ: ekipman satırı ve dönemde olmayan hareketler', () => {
  const state = (settings) => ({
    profile: null, settings: { schedule: SCHEDULE, ...settings }, meta: {}, workouts: [], padel: [], daily: {},
    measurements: [], mealplan: null, shopping: null,
  });
  const args = { today: '2026-11-19', startKey: '2026-11-02', alerts: [] };
  const withNote = buildPrompt('program', { ...args, state: state({ phase: 'dumbbell', equipmentNote: '20 kg vidalı dambıl seti, kapı barfiks barı' }) });
  assert.match(withNote, /- Ekipman: 20 kg vidalı dambıl seti, kapı barfiks barı/);
  assert.match(withNote, /şu kimlikleri kullanma: .*band_squat/);
  assert.ok(!/şu kimlikleri kullanma: [^\n]*goblet_squat/.test(withNote));
  const noNote = buildPrompt('review', { ...args, state: state({ phase: 'band' }) });
  assert.ok(!/- Ekipman:/.test(noNote));
  assert.deepEqual(unavailableExercises('band'), []);
  assert.ok(!unavailableExercises('dumbbell').includes('pullup'));
  assert.ok(unavailableExercises('bodyweight').includes('goblet_squat'));
  const list = allowedExerciseList();
  assert.match(list, /db_rear_delt_fly/);
  assert.match(list, /db_wrist_ext/);
});
