import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEALS } from '../app/js/foods.js';
import { OUT, dayFor, withOverride, freeEntry, applyMealToDaily, mealsWithoutNewGroceries } from '../app/js/mealplan.js';
import { PROGRAMS, dayPlanFor, shortItems } from '../app/js/program.js';
import { buildPrompt, parseDayChanges, changeableDates } from '../app/js/ai.js';
import { defaultSettings } from '../app/js/store.js';

// 2026-11-25 Çarşamba
const TODAY = '2026-11-25';
const template = Array.from({ length: 7 }, () => ({ first: 'menemen_peynir', dinner: 'airfryer_tavuk', snack1: 'whey_su', snack2: null }));
const mealplan = { prefs: { tools: ['airfryer', 'toaster', 'stove'] }, days: template };

test('güne özel değişiklik yalnızca o tarihi etkiler, eskiler temizlenir', () => {
  let p = withOverride(mealplan, '2026-11-26', 'dinner', OUT, TODAY);
  assert.equal(dayFor(p, '2026-11-26').dinner, OUT);
  assert.equal(dayFor(p, '2026-12-03').dinner, 'airfryer_tavuk'); // bir sonraki Perşembe şablondan
  p = withOverride(p, '2026-11-26', 'dinner', undefined, TODAY);
  assert.deepEqual(p.overrides, {});
  const old = { ...mealplan, overrides: { '2026-10-01': { first: OUT } } };
  assert.ok(!('2026-10-01' in withOverride(old, '2026-11-26', 'first', OUT, TODAY).overrides));
});

test('plan dışı yemek proteini ekler ve geri alınabilir', () => {
  const e = freeEntry('  Çiğköfte dürüm ', 8);
  assert.equal(e.name, 'Çiğköfte dürüm');
  let d = { proteinG: 40, meals: {} };
  d = { ...d, ...applyMealToDaily(d, 'extra1', e) };
  assert.equal(d.proteinG, 48);
  d = { ...d, ...applyMealToDaily(d, 'extra1', null) };
  assert.equal(d.proteinG, 40);
});

test('kısa antrenman: ilk 4 ana hareket, 2 set; hazırlık hareketleri yok', () => {
  const s = shortItems(PROGRAMS.band.B);
  assert.equal(s.length, 4);
  assert.ok(s.every((i) => i.sets === 2 && !i.prep));
});

test('gün türü değişikliği takvimi o gün için geçersiz kılar', () => {
  const settings = { ...defaultSettings(), scheduleOverrides: { [TODAY]: 'walk' } };
  assert.equal(dayPlanFor(settings, TODAY, 2).type, 'walk');
  assert.equal(dayPlanFor(settings, TODAY, 2).override, true);
  assert.equal(dayPlanFor(settings, '2026-11-26', 3).type, 'strength');
});

test('değiştirilebilir tarihler: haftanın kalanı; Pazar ise önümüzdeki 7 gün', () => {
  assert.deepEqual(changeableDates(TODAY), ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(changeableDates('2026-11-29').length, 7);
});

test('yeni malzeme gerektiren öğünler gün sonu önerisine kapalı', () => {
  const { home } = mealsWithoutNewGroceries(mealplan);
  const ids = home.map((m) => m.id);
  assert.ok(ids.includes('menemen_peynir') && ids.includes('whey_su'));
  assert.ok(!ids.includes('ton_durum'), 'ton balığı listede yok');
  assert.ok(ids.every((id) => MEALS[id]));
});

const answer = (changes) => `Tamam.\n\`\`\`json\n${JSON.stringify({ note: 'Kaydırdım', changes })}\n\`\`\``;

test('gün sonu değişiklikleri okunur', () => {
  const r = parseDayChanges(answer([
    { type: 'day', date: '2026-11-28', plan: 'strength' },
    { type: 'meal', date: '2026-11-26', slot: 'dinner', meal: 'out' },
    { type: 'meal', date: '2026-11-27', slot: 'first', meal: 'menemen_peynir' },
  ]), { today: TODAY, mealplan });
  assert.equal(r.changes.length, 3);
  assert.equal(r.note, 'Kaydırdım');
  assert.deepEqual(parseDayChanges(answer([]), { today: TODAY, mealplan }).changes, []);
});

test('sınır dışı öneriler reddedilir', () => {
  const ctx = { today: TODAY, mealplan };
  const four = Array.from({ length: 4 }, () => ({ type: 'day', date: '2026-11-28', plan: 'rest' }));
  assert.throws(() => parseDayChanges(answer(four), ctx), /En fazla 3/);
  assert.throws(() => parseDayChanges(answer([{ type: 'day', date: '2026-11-24', plan: 'rest' }]), ctx), /değiştirilemez/);
  assert.throws(() => parseDayChanges(answer([{ type: 'meal', date: '2026-11-26', slot: 'dinner', meal: 'ton_durum' }]), ctx), /alışveriş listesinde olmayan/);
  assert.throws(() => parseDayChanges(answer([{ type: 'meal', date: '2026-11-26', slot: 'dinner', meal: 'pizza_ev' }]), ctx), /öğün yok/);
  assert.throws(() => parseDayChanges(answer([{ type: 'workout', date: '2026-11-26', exercise: 'barfiks' }]), ctx), /"day" ya da "meal"/);
  assert.throws(() => parseDayChanges(answer([{ type: 'day', date: '2026-11-26', plan: 'crossfit' }]), ctx), /gün türü/);
});

test('gün sonu mesajı bugünü, haftanın kalanını, sınırları ve geçerli örneği içerir', () => {
  const state = {
    profile: { sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 85, proteinMin: 140, proteinMax: 150, kcalMin: 2250, kcalMax: 2350 },
    settings: defaultSettings(),
    workouts: [], padel: [], measurements: [],
    daily: { [TODAY]: { date: TODAY, workoutSkipped: true, walked: true, proteinG: 48, note: 'Toplantı uzadı', meals: { extra1: freeEntry('Çiğköfte dürüm', 8) } } },
    mealplan,
  };
  const p = buildPrompt('day', { state, today: TODAY, startKey: '2026-11-02' });
  for (const s of ['## Bugün', 'yapılamadı', 'Çiğköfte dürüm (plan dışı)', 'Toplantı uzadı', '## Haftanın kalanı', '2026-11-29', 'Yeni malzeme alınmayacak', 'Yeni ekipman yok']) {
    assert.ok(p.includes(s), `eksik: ${s}`);
  }
  const block = p.split('```json').pop().split('```')[0];
  assert.ok(parseDayChanges('```json' + block + '```', { today: TODAY, mealplan }).changes.length >= 1);
});
