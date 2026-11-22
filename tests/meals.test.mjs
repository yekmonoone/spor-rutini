import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEALS, OUT_OPTIONS, INGREDIENTS } from '../app/js/foods.js';
import {
  OUT, SLOTS, defaultPrefs, mealNutrition, dayTotals, buildDefaultPlan, kcalGap, shoppingList, shoppingText,
  shoppingCycle, countShopping, applyMealToDaily, eatenEntry, suggest, parseMealPlan, qtyText,
} from '../app/js/mealplan.js';
import { SYNC_KV_KEYS } from '../app/js/sync-core.js';
import { evaluateAlerts } from '../app/js/rules.js';
import { buildPrompt } from '../app/js/ai.js';
import { defaultSettings } from '../app/js/store.js';

const profile = { proteinMin: 130, proteinMax: 140, kcalMin: 2150, kcalMax: 2250, kcalFloor: 1750 };

test('kütüphane tutarlı: tüm malzemeler tanımlı, değerler makul', () => {
  for (const m of Object.values(MEALS)) {
    for (const [id, qty] of m.ingredients) {
      assert.ok(INGREDIENTS[id], `${m.id}: ${id} tanımsız`);
      assert.ok(qty > 0);
    }
    const n = mealNutrition(m);
    assert.ok(n.mid > 0 && n.mid < 80, `${m.id}: ${n.mid} g`);
    assert.ok(n.kcalMid > 50 && n.kcalMid < 1000, `${m.id}: ${n.kcalMid} kcal`);
    assert.ok(n.protein[0] <= n.mid && n.mid <= n.protein[1]);
  }
  for (const o of Object.values(OUT_OPTIONS)) assert.ok(o.protein[0] <= o.protein[1] && o.kcal[0] <= o.kcal[1]);
});

test('besin hesabı: 3 yumurta ≈ 19 g protein', () => {
  assert.equal(mealNutrition(MEALS.yumurta3).mid, 19);
  assert.deepEqual(mealNutrition(OUT_OPTIONS.tavuk_sis).protein, [35, 45]);
});

test('varsayılan plan: evde geçen günler protein hedefine ulaşır', () => {
  const plan = { days: buildDefaultPlan(defaultPrefs(), profile) };
  assert.equal(plan.days.length, 7);
  for (const d of plan.days) {
    assert.ok(dayTotals(d, plan).mid >= 128, `günlük ${dayTotals(d, plan).mid} g`);
    for (const s of SLOTS) if (d[s]) assert.ok(MEALS[d[s]], d[s]);
  }
});

test('dışarıda günleri ve alet tercihleri dikkate alınır', () => {
  const prefs = { ...defaultPrefs(), lunchOutDays: [0, 2], dinnerOutDays: [4], tools: [] };
  const plan = { days: buildDefaultPlan(prefs, profile) };
  assert.equal(plan.days[0].first, OUT);
  assert.equal(plan.days[2].first, OUT);
  assert.equal(plan.days[4].dinner, OUT);
  for (const d of plan.days) for (const s of SLOTS) {
    const m = MEALS[d[s]];
    if (m) assert.equal(m.tools.length, 0, `${m.id} alet gerektiriyor`);
  }
});

test('kalori açığı hesaplanır', () => {
  const plan = { days: buildDefaultPlan(defaultPrefs(), profile) };
  const gap = kcalGap(plan.days[0], plan, profile);
  assert.equal(gap, Math.max(0, 2150 - dayTotals(plan.days[0], plan).kcalMid));
  assert.equal(kcalGap(plan.days[0], plan, null), 0);
});

test('alışveriş listesi birleştirir, raf ömrü notu düşer, dışarıdakileri saymaz', () => {
  const plan = { days: Array.from({ length: 7 }, (_, i) => ({ first: i < 2 ? 'lorlu_omlet' : OUT, dinner: 'tavuk_lavas', snack1: null, snack2: null })) };
  const groups = shoppingList(plan);
  const all = groups.flatMap((g) => g.items);
  const egg = all.find((i) => i.key === 'yumurta');
  assert.equal(egg.qtyText, '6 adet');
  const yesillik = all.find((i) => i.key === 'yesillik');
  assert.match(yesillik.note, /hafta ortasında/);
  assert.equal(all.find((i) => i.key === 'tavuk_gogus').qtyText, '1,3 kg');
  const text = shoppingText(groups, { extra: [{ id: 'e1', name: 'Deterjan' }], checked: { yumurta: true } });
  assert.ok(!text.includes('Yumurta') && text.includes('Deterjan') && text.includes('Lavaş'));
  assert.deepEqual(countShopping(groups, [{ id: 'e1' }], { yumurta: true }), { total: all.length + 1, done: 1 });
});

test('yapay zekânın özel öğün malzemeleri katalogla eşleşir', () => {
  const plan = { days: Array.from({ length: 7 }, () => ({ first: 'c1', dinner: OUT })), customMeals: { c1: { id: 'c1', name: 'X', slot: 'first', place: 'home', protein: 30, kcal: 500, ingredients: [{ name: 'yumurta', qty: 2, unit: 'adet' }, { name: 'Kinoa', qty: 50, unit: 'g' }] } } };
  const all = shoppingList(plan).flatMap((g) => g.items);
  assert.equal(all.find((i) => i.key === 'yumurta').qtyText, '14 adet');
  assert.equal(all.find((i) => i.name === 'Kinoa').cat, 'other');
});

test('malzeme eşleştirme tam eşleşmeyle yapılır (yanlış eşleşme yok)', () => {
  const ing = (name, unit = 'g') => ({ name, qty: 100, unit });
  const plan = { days: [{ first: 'c1' }, {}, {}, {}, {}, {}, {}], customMeals: { c1: { id: 'c1', name: 'X', slot: 'first', place: 'home', protein: 30, kcal: 500,
    ingredients: [ing('Somon balığı'), ing('yoğurt'), ing('Tavuk'), ing('Ton balığı', 'kutu'), ing('Marul')] } } };
  const byName = Object.fromEntries(shoppingList(plan).flatMap((g) => g.items).map((i) => [i.name, i]));
  assert.equal(byName['Somon balığı'].cat, 'other');
  assert.ok(!byName.Bal, '"bal" ile eşleşmemeli');
  assert.ok(byName['Yoğurt'] && !byName['Süzme yoğurt']);
  assert.ok(byName['Tavuk göğsü']);
  assert.ok(byName['Ton balığı konservesi']);
  assert.ok(byName['Hazır yeşillik / salata']);
});

test('miktar yazımı', () => {
  assert.equal(qtyText(15, 'g'), '15 g');
  assert.equal(qtyText(250, 'g'), '250 g');
  assert.equal(qtyText(0.5, 'adet'), '1 adet');
});

test('alışveriş dönemi alışveriş gününden başlar', () => {
  assert.equal(shoppingCycle('2026-11-22', 6), '2026-11-22'); // Pazar
  assert.equal(shoppingCycle('2026-11-25', 6), '2026-11-22'); // Çarşamba → önceki Pazar
  assert.equal(shoppingCycle('2026-11-21', 6), '2026-11-15'); // Cumartesi → önceki Pazar
});

test('"Yedim" proteini ekler, değiştirince çift eklemez, geri alınca düşer', () => {
  const tavuk = eatenEntry(MEALS.airfryer_tavuk);
  let d = { date: '2026-11-22', proteinG: 20 };
  d = { ...d, ...applyMealToDaily(d, 'dinner', tavuk) };
  assert.equal(d.proteinG, 20 + tavuk.protein);
  const kofte = eatenEntry(MEALS.airfryer_kofte);
  d = { ...d, ...applyMealToDaily(d, 'dinner', kofte) };
  assert.equal(d.proteinG, 20 + kofte.protein);
  d = { ...d, ...applyMealToDaily(d, 'dinner', null) };
  assert.equal(d.proteinG, 20);
  assert.deepEqual(d.meals, {});
  const fresh = applyMealToDaily(undefined, 'snack1', eatenEntry(MEALS.whey_su));
  assert.equal(fresh.proteinG, 23);
  assert.deepEqual(applyMealToDaily({ meals: fresh.meals, proteinG: 5 }, 'snack1', null).proteinG, 0);
  assert.equal(applyMealToDaily({ meals: fresh.meals, proteinG: null }, 'snack1', null).proteinG, null);
});

test('öneriler kalan proteine yakın seçenekleri getirir', () => {
  const s = suggest({ remaining: 22, kind: 'snack', tools: defaultPrefs().tools });
  assert.equal(s.length, 3);
  assert.ok(s.every((x) => x.meal.slot === 'snack'));
  assert.ok(s[0].n.mid >= 17);
  const out = suggest({ remaining: 40, kind: 'dinner', place: 'out' });
  assert.ok(out.every((x) => x.meal.place === 'out'));
});

const aiAnswer = `Plan hazır!
\`\`\`json
{
  "note": "Protein dengeli",
  "days": [
    {"first": "menemen_peynir", "dinner": "c_somon", "snack1": "whey_su", "snack2": null},
    {"first": "out", "dinner": "Airfryer tavuklu lavaş + patates + ayran", "snack1": "suzme_meyve"},
    {"first": "suzme_kase", "dinner": "tavuk_sis", "snack1": "lor_bal"},
    {"first": "lorlu_omlet", "dinner": {"name": "Hindi köfte + bulgur", "protein": 45, "kcal": 650, "ingredients": [{"name": "Hindi kıyma", "qty": 200, "unit": "gr"}]}, "snack1": "whey_su"},
    {"first": "whey_shake", "dinner": "out", "snack1": "yumurta3"},
    {"first": "tost_yumurta", "dinner": "airfryer_tavuk", "snack1": "kefir_whey"},
    {"ilk": "hindi_durum", "akşam": "tavuk_sote", "ara öğün": "suzme_meyve",}
  ],
  "meals": [
    {"id": "c_somon", "name": "Airfryer somon + salata", "slot": "dinner", "protein": 40, "kcal": 600, "minutes": 15, "steps": ["Somonu pişir"], "ingredients": [{"name": "Somon", "qty": 180, "unit": "g"}, {"name": "yeşillik", "qty": 100, "unit": "g"}]},
    {"id": "kullanilmayan", "name": "Fazla", "protein": 10}
  ]
}
\`\`\``;

test('yapay zekâ yemek planı okunur (ad, satır içi öğün, Türkçe anahtarlar)', () => {
  const p = parseMealPlan(aiAnswer);
  assert.equal(p.days.length, 7);
  assert.equal(p.days[0].dinner, 'c_somon');
  assert.equal(p.days[1].first, OUT);
  assert.equal(p.days[1].dinner, 'tavuk_lavas');
  assert.equal(p.days[2].dinner, 'tavuk_sis');
  assert.ok(p.customMeals[p.days[3].dinner].name.startsWith('Hindi köfte'));
  assert.equal(p.days[6].first, 'hindi_durum');
  assert.equal(p.days[6].snack1, 'suzme_meyve');
  assert.ok(!Object.values(p.customMeals).some((m) => m.name === 'Fazla'), 'kullanılmayan öğün atılmalı');
  assert.equal(p.note, 'Protein dengeli');
  const all = shoppingList({ days: p.days, customMeals: p.customMeals }).flatMap((g) => g.items);
  assert.ok(all.some((i) => i.name === 'Somon'));
  assert.ok(all.find((i) => i.key === 'yesillik'));
});

test('hatalı yemek planı reddedilir', () => {
  assert.throws(() => parseMealPlan('merhaba'), /bulunamadı/);
  assert.throws(() => parseMealPlan('```json\n{"days":[{"first":"menemen_peynir"}]}\n```'), /7 gün/);
  const bad = JSON.stringify({ days: Array.from({ length: 7 }, () => ({ first: 'pizza_yok', dinner: 'out' })) });
  assert.throws(() => parseMealPlan(bad), /bulunamadı/);
  const badMeal = JSON.stringify({ days: Array.from({ length: 7 }, () => ({ first: { name: 'X', protein: 999 } })) });
  assert.throws(() => parseMealPlan(badMeal), /protein/);
});

test('yemek planı ve alışveriş cihazlar arasında eşitlenir', () => {
  assert.ok(SYNC_KV_KEYS.includes('mealplan') && SYNC_KV_KEYS.includes('shopping'));
});

test('alışveriş gününde liste hatırlatılır, tamamlanınca gizlenir', () => {
  const mealplan = { prefs: { ...defaultPrefs(), shoppingDay: 6 }, days: buildDefaultPlan(defaultPrefs(), profile) };
  const base = { profile, settings: { phase: 'band' }, meta: { dismissed: {}, lastBackupAt: '2026-11-21' }, workouts: [], padel: [], measurements: [{ id: 'm', date: '2026-11-21', waistCm: 90, photo: true }], daily: {}, startKey: '2026-11-16', mealplan };
  const ids = (a) => a.map((x) => x.id.split('@')[0]);
  assert.ok(ids(evaluateAlerts({ ...base, today: '2026-11-22' })).includes('shop'));
  assert.ok(!ids(evaluateAlerts({ ...base, today: '2026-11-23' })).includes('shop'));
  const groups = shoppingList(mealplan);
  const checked = Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.key, true])));
  assert.ok(!ids(evaluateAlerts({ ...base, today: '2026-11-22', shopping: { cycle: '2026-11-22', checked, extra: [] } })).includes('shop'));
});

test('yemek mesajı düzeni, kimlikleri ve geçerli örnek JSON\'u içerir', () => {
  const state = { profile: { ...profile, sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 85 }, settings: defaultSettings(), workouts: [], padel: [], measurements: [], daily: {}, mealplan: null };
  const p = buildPrompt('meals', { state, today: '2026-11-22', startKey: '2026-11-02' });
  assert.ok(p.includes('Kahvaltı yapmıyorum') && p.includes('menemen_peynir') && p.includes('tavuk_sis'));
  const block = p.split('```json').pop().split('```')[0];
  const parsed = parseMealPlan('```json' + block + '```');
  assert.equal(parsed.days.length, 7);
});
