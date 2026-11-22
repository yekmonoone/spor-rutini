// Yemek planı mantığı (saf fonksiyonlar — testlerde de kullanılır): besin hesabı, varsayılan haftalık plan,
// alışveriş listesi, "yedim" ile protein ekleme, öneriler ve yapay zekâ planını okuma.
import { INGREDIENTS, MEALS, OUT_OPTIONS, OUT_ESTIMATE, CATEGORIES, CATEGORY_ORDER } from './foods.js';
import { addDays, weekday, fmtNum, roundTo, clamp, WEEKDAYS } from './util.js';
import { extractJson, normText } from './extract-json.js';

/** Planda "dışarıda (ne yeneceği seçilmedi)" anlamına gelen değer. */
export const OUT = 'out';
export const SLOTS = ['first', 'dinner', 'snack1', 'snack2'];
export const SLOT_LABELS = { first: 'İlk öğün (öğle)', dinner: 'Akşam', snack1: 'Ara öğün', snack2: 'Ek ara öğün' };
export const SLOT_KIND = { first: 'first', dinner: 'dinner', snack1: 'snack', snack2: 'snack' };
export const KIND_LABELS = { first: 'İlk öğün', dinner: 'Akşam', snack: 'Ara öğün' };

export function defaultPrefs() {
  return { lunchOutDays: [], dinnerOutDays: [], tools: ['airfryer', 'toaster', 'stove'], shoppingDay: 6 };
}

export function mealById(id, plan) {
  if (!id || id === OUT) return null;
  return MEALS[id] ?? OUT_OPTIONS[id] ?? plan?.customMeals?.[id] ?? null;
}

export function allHomeMeals(plan) {
  return [...Object.values(MEALS), ...Object.values(plan?.customMeals ?? {}).filter((m) => m.place !== 'out')];
}

export function toolsOk(meal, tools = []) {
  return (meal?.tools ?? []).every((t) => tools.includes(t));
}

const range15 = (v) => [Math.round(v * 0.85), Math.round(v * 1.15)];

/** { protein: [alt, üst], kcal: [alt, üst] | null, mid, kcalMid } — yaklaşık. */
export function mealNutrition(meal) {
  if (!meal) return null;
  if (Array.isArray(meal.protein)) {
    const [pl, ph] = meal.protein;
    const k = Array.isArray(meal.kcal) ? meal.kcal : null;
    return { protein: [pl, ph], kcal: k, mid: Math.round((pl + ph) / 2), kcalMid: k ? roundTo((k[0] + k[1]) / 2, 10) : null };
  }
  let p = 0;
  let k = 0;
  if (Array.isArray(meal.ingredients) && Array.isArray(meal.ingredients[0])) {
    for (const [id, qty] of meal.ingredients) {
      const ing = INGREDIENTS[id];
      if (!ing) continue;
      p += ing.p * qty;
      k += ing.kcal * qty;
    }
  } else {
    p = Number(meal.protein) || 0;
    k = Number(meal.kcal) || 0;
  }
  return {
    protein: range15(p),
    kcal: k ? [roundTo(k * 0.85, 10), roundTo(k * 1.15, 10)] : null,
    mid: Math.round(p),
    kcalMid: k ? roundTo(k, 10) : null,
  };
}

/** Plan slotunun besin değeri ("dışarıda" için tahmini aralık). */
export function slotNutrition(value, slot, plan) {
  if (!value) return null;
  if (value === OUT) {
    const e = OUT_ESTIMATE[SLOT_KIND[slot]];
    return { protein: e.protein, kcal: e.kcal, mid: Math.round((e.protein[0] + e.protein[1]) / 2), kcalMid: roundTo((e.kcal[0] + e.kcal[1]) / 2, 10), out: true };
  }
  return mealNutrition(mealById(value, plan));
}

export function dayTotals(day, plan) {
  const t = { protein: [0, 0], kcal: [0, 0], mid: 0, kcalMid: 0 };
  for (const s of SLOTS) {
    const n = slotNutrition(day?.[s], s, plan);
    if (!n) continue;
    t.protein[0] += n.protein[0];
    t.protein[1] += n.protein[1];
    t.mid += n.mid;
    if (n.kcal) {
      t.kcal[0] += n.kcal[0];
      t.kcal[1] += n.kcal[1];
      t.kcalMid += n.kcalMid;
    }
  }
  return t;
}

function homeByKind(kind, tools, plan) {
  return allHomeMeals(plan).filter((m) => m.slot === kind && toolsOk(m, tools));
}

/** Protein açısından anlamlı atıştırmalar (≥15 g). */
const isProteinSnack = (m) => mealNutrition(m).mid >= 15;

/** Planın günlük kalori açığı (hedefin altı, kcal). Profil yoksa 0. */
export function kcalGap(day, plan, profile) {
  if (!profile?.kcalMin) return 0;
  return Math.max(0, profile.kcalMin - dayTotals(day, plan).kcalMid);
}

/**
 * İkinci atıştırmayı seçer: önce protein hedefi; protein tamamsa ama kalori hedefin çok altındaysa
 * kalori tamamlayan bir atıştırma (çok düşük kalori kas kaybını artırır).
 */
export function fillGaps(day, profile, plan, tools) {
  day.snack2 = null;
  const snacks = homeByKind('snack', tools, plan).filter((m) => m.id !== day.snack1);
  if (!snacks.length) return day;
  const target = profile?.proteinMin ?? 120;
  const gap = target - dayTotals(day, plan).mid;
  if (gap > 0) {
    const options = snacks.filter(isProteinSnack).map((m) => ({ m, p: mealNutrition(m).mid }));
    if (options.length) {
      const enough = options.filter((o) => o.p >= gap).sort((a, b) => a.p - b.p);
      day.snack2 = (enough[0] ?? options.sort((a, b) => b.p - a.p)[0]).m.id;
      return day;
    }
  }
  if (kcalGap(day, plan, profile) > 300) {
    const dense = snacks.map((m) => ({ m, k: mealNutrition(m).kcalMid ?? 0 })).sort((a, b) => b.k - a.k)[0];
    if (dense) day.snack2 = dense.m.id;
  }
  return day;
}

/** Tercihlere göre 7 günlük (Pazartesi → Pazar) varsayılan plan. */
export function buildDefaultPlan(prefs = defaultPrefs(), profile = null) {
  const tools = prefs.tools ?? [];
  const firsts = homeByKind('first', tools, null);
  const dinners = homeByKind('dinner', tools, null);
  // İlk atıştırma: proteinli ve doyurucu olanlar önce (kalori hedefinin çok altında kalmamak için).
  const snacks = homeByKind('snack', tools, null).filter(isProteinSnack)
    .sort((a, b) => (mealNutrition(b).kcalMid ?? 0) - (mealNutrition(a).kcalMid ?? 0));
  let fi = 0;
  let di = 0;
  const days = [];
  for (let wd = 0; wd < 7; wd++) {
    const day = {
      first: prefs.lunchOutDays?.includes(wd) || !firsts.length ? OUT : firsts[fi++ % firsts.length].id,
      dinner: prefs.dinnerOutDays?.includes(wd) || !dinners.length ? OUT : dinners[di++ % dinners.length].id,
      snack1: snacks.length ? snacks[wd % snacks.length].id : null,
      snack2: null,
    };
    days.push(fillGaps(day, profile, null, tools));
  }
  return days;
}

/** Bir slotta seçilebilecek öğünler (ev öğünleri, dışarıda, boş). */
export function choicesFor(slot, plan, tools) {
  const kind = SLOT_KIND[slot];
  return homeByKind(kind, tools, plan);
}

/* ---------------- Alışveriş listesi ---------------- */

const UNIT_ALIASES = { g: ['g', 'gr', 'gram'], ml: ['ml', 'mililitre', 'cc'], adet: ['adet', 'tane', 'ad', 'pcs'], dilim: ['dilim'], kutu: ['kutu', 'konserve'] };
function normUnit(u) {
  const s = normText(u ?? '', { fold: true });
  for (const [k, list] of Object.entries(UNIT_ALIASES)) if (list.includes(s)) return k;
  return s || 'adet';
}

/** Yalnızca tam eşleşme (ad, kimlik ya da tanımlı eş anlamlılar) — "somon balığı" ≠ "bal". */
let ingredientIndex = null;
function matchIngredient(name) {
  if (!ingredientIndex) {
    ingredientIndex = new Map();
    for (const [id, ing] of Object.entries(INGREDIENTS)) {
      for (const key of [ing.name, id.replace(/_/g, ' '), ...(ing.aliases ?? [])]) {
        const k = normText(key, { fold: true });
        if (k && !ingredientIndex.has(k)) ingredientIndex.set(k, id);
      }
    }
  }
  const id = ingredientIndex.get(normText(name, { fold: true }));
  return id ? { id, ...INGREDIENTS[id] } : null;
}

export function qtyText(qty, unit) {
  const small = (q) => (q < 100 ? Math.round(q) : roundTo(q, 10));
  if (unit === 'g') return qty >= 1000 ? `${fmtNum(qty / 1000, 1)} kg` : `${small(qty)} g`;
  if (unit === 'ml') return qty >= 1000 ? `${fmtNum(qty / 1000, 1)} L` : `${small(qty)} ml`;
  return `${Math.ceil(qty - 1e-9)} ${unit || 'adet'}`;
}

/** Plandaki ev öğünlerinin malzemelerini toplar; kategoriye göre gruplar ve raf ömrü notu ekler. */
export function shoppingList(plan) {
  const items = new Map();
  (plan?.days ?? []).forEach((day, wd) => {
    for (const s of SLOTS) {
      const meal = mealById(day?.[s], plan);
      if (!meal || meal.place === 'out') continue;
      for (const ing of meal.ingredients ?? []) {
        let it;
        if (Array.isArray(ing)) {
          const [id, qty] = ing;
          const d = INGREDIENTS[id];
          if (!d) continue;
          it = { key: id, name: d.name, cat: d.cat, unit: d.unit, qty, shelf: d.shelf, hint: d.hint ?? null };
        } else {
          const unit = normUnit(ing.unit);
          const qty = Number(ing.qty) > 0 ? Number(ing.qty) : 1;
          const m = matchIngredient(ing.name);
          it = m && m.unit === unit
            ? { key: m.id, name: m.name, cat: m.cat, unit, qty, shelf: m.shelf, hint: m.hint ?? null }
            : { key: `x:${normText(ing.name, { fold: true })}|${unit}`, name: String(ing.name), cat: 'other', unit, qty, shelf: null, hint: null };
        }
        const cur = items.get(it.key) ?? { ...it, qty: 0, days: new Set() };
        cur.qty += it.qty;
        cur.days.add(wd);
        items.set(it.key, cur);
      }
    }
  });
  const finalize = (it) => {
    const span = it.days.size ? Math.max(...it.days) - Math.min(...it.days) + 1 : 0;
    let note = it.hint;
    if (it.shelf != null && it.shelf <= 7) {
      note = span > it.shelf ? `⏳ ~${it.shelf} gün dayanır: yarısını hafta ortasında al` : `⏳ ~${it.shelf} gün dayanır`;
    }
    return { key: it.key, name: it.name, qtyText: qtyText(it.qty, it.unit), note, cat: it.cat };
  };
  return CATEGORY_ORDER
    .map((cat) => ({
      cat,
      label: CATEGORIES[cat],
      items: [...items.values()].filter((i) => i.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(finalize),
    }))
    .filter((g) => g.items.length);
}

export function shoppingText(groups, { extra = [], checked = {}, onlyUnchecked = true } = {}) {
  const lines = ['🛒 Haftalık alışveriş', ''];
  for (const g of groups) {
    const items = g.items.filter((i) => !onlyUnchecked || !checked[i.key]);
    if (!items.length) continue;
    lines.push(`${g.label}:`);
    for (const i of items) lines.push(`- ${i.name}: ${i.qtyText}`);
    lines.push('');
  }
  const ex = extra.filter((e) => !onlyUnchecked || !checked[e.id]);
  if (ex.length) {
    lines.push('Diğer:');
    for (const e of ex) lines.push(`- ${e.name}`);
  }
  return lines.join('\n').trim();
}

/** Alışveriş dönemi: en son alışveriş gününden başlar (işaretler her dönemde sıfırlanır). */
export function shoppingCycle(today, shoppingDay = 6) {
  return addDays(today, -((weekday(today) - shoppingDay + 7) % 7));
}

export function countShopping(groups, extra = [], checked = {}) {
  const keys = [...groups.flatMap((g) => g.items.map((i) => i.key)), ...extra.map((e) => e.id)];
  return { total: keys.length, done: keys.filter((k) => checked[k]).length };
}

/* ---------------- Güne özel değişiklikler ---------------- */

/** O tarih için geçerli plan günü: haftalık şablon + o güne özel değişiklikler (overrides). */
export function dayFor(plan, date) {
  if (!plan?.days) return {};
  return { ...(plan.days[weekday(date)] ?? {}), ...(plan.overrides?.[date] ?? {}) };
}

/** Güne özel değişiklik ekler (value undefined → kaldırır); 14 günden eski değişiklikleri temizler. */
export function withOverride(plan, date, slot, value, today = date) {
  const overrides = {};
  const cutoff = addDays(today, -14);
  for (const [d, v] of Object.entries(plan?.overrides ?? {})) if (d >= cutoff) overrides[d] = { ...v };
  const day = { ...(overrides[date] ?? {}) };
  if (value === undefined) delete day[slot]; else day[slot] = value;
  if (Object.keys(day).length) overrides[date] = day; else delete overrides[date];
  return { ...plan, overrides };
}

/** Listede olmayan yiyecek için kayıt (protein kabaca seçilir). */
export const FREE_PROTEIN = [
  { value: 8, label: 'Az (~8 g)', hint: 'çiğköfte, simit, makarna, tatlı' },
  { value: 20, label: 'Orta (~20 g)', hint: 'tost, mantı, pizza, kumpir' },
  { value: 35, label: 'Çok (~35 g)', hint: 'ızgara et/tavuk porsiyonu' },
];

export function freeEntry(name, protein, place = 'out') {
  return { id: 'free', name: String(name).trim().slice(0, 60), protein: Math.round(protein), place, free: true };
}

/**
 * Bu haftanın alışveriş listesiyle yapılabilen öğünler (yeni malzeme gerektirmeyenler) + dışarıda seçenekleri.
 * Gün sonu yapay zekâ değişiklikleri yalnızca bunlardan seçebilir.
 */
export function mealsWithoutNewGroceries(plan) {
  const have = new Set(shoppingList(plan).flatMap((g) => g.items.map((i) => i.key)));
  const inPlan = new Set((plan?.days ?? []).flatMap((d) => SLOTS.map((s) => d?.[s])).filter(Boolean));
  const ok = [];
  for (const m of allHomeMeals(plan)) {
    const lib = Array.isArray(m.ingredients?.[0]);
    if (inPlan.has(m.id) || (lib && m.ingredients.every(([id]) => have.has(id)))) ok.push(m);
  }
  return { home: ok, out: Object.values(OUT_OPTIONS) };
}

/* ---------------- "Yedim" ve öneriler ---------------- */

export function eatenEntry(meal) {
  const n = mealNutrition(meal);
  return { id: meal.id, name: meal.name, protein: n?.mid ?? 0, place: meal.place ?? 'home' };
}

/**
 * Günlük kayda öğün işaretler ya da kaldırır (entry = null). Proteini o slotun önceki değeri düşülerek günceller.
 * Dönen { meals, proteinG } saveDaily ile kaydedilir.
 */
export function applyMealToDaily(daily, slot, entry) {
  const meals = { ...(daily?.meals ?? {}) };
  const prev = meals[slot]?.protein ?? 0;
  let protein = (daily?.proteinG ?? 0) - prev;
  if (entry) meals[slot] = entry; else delete meals[slot];
  if (entry) protein += entry.protein;
  protein = Math.max(0, Math.round(protein));
  const nothing = !Object.keys(meals).length && protein === 0 && daily?.proteinG == null;
  return { meals, proteinG: nothing ? null : protein };
}

export function mealProteinTotal(daily) {
  return Object.values(daily?.meals ?? {}).reduce((a, m) => a + (m?.protein ?? 0), 0);
}

/** Kalan proteini kapatmaya en uygun 2–3 seçenek. */
export function suggest({ remaining, kind, place = 'home', plan = null, tools = [], limit = 3 }) {
  const pool = place === 'out'
    ? Object.values(OUT_OPTIONS).filter((o) => o.slots.includes(kind))
    : homeByKind(kind, tools, plan);
  const scored = pool.map((meal) => {
    const n = mealNutrition(meal);
    const short = Math.max(0, remaining - n.mid);
    const over = Math.max(0, n.mid - remaining);
    return { meal, n, score: short * 2 + over * 0.5 + (n.kcalMid ?? 500) / 200 };
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, limit);
}

/* ---------------- Yapay zekâ planını okuma ---------------- */

const DAY_ALIASES = [
  ['pazartesi', 'pzt', 'monday', 'mon', '1'],
  ['sali', 'sal', 'tuesday', 'tue', '2'],
  ['carsamba', 'car', 'wednesday', 'wed', '3'],
  ['persembe', 'per', 'thursday', 'thu', '4'],
  ['cuma', 'cum', 'friday', 'fri', '5'],
  ['cumartesi', 'cmt', 'saturday', 'sat', '6'],
  ['pazar', 'paz', 'sunday', 'sun', '7'],
];
const SLOT_ALIASES = {
  first: ['first', 'ilk', 'ilk ogun', 'ogle', 'lunch', 'breakfast', 'kahvalti', 'brunch'],
  dinner: ['dinner', 'aksam', 'aksam yemegi', 'supper'],
  snack1: ['snack1', 'snack', 'ara', 'ara ogun', 'atistirma', 'snack 1'],
  snack2: ['snack2', 'snack 2', 'ek', 'ek protein', 'ara ogun 2'],
};
const OUT_WORDS = ['out', 'disarida', 'disari', 'paket', 'restoran', 'eat out'];

function dayIndex(key) {
  const k = normText(key, { fold: true });
  return DAY_ALIASES.findIndex((list) => list.includes(k));
}

function slotOf(key) {
  const k = normText(key, { fold: true });
  return Object.keys(SLOT_ALIASES).find((s) => SLOT_ALIASES[s].includes(k)) ?? null;
}

function kindOf(v, fallback) {
  const k = normText(v ?? '', { fold: true });
  if (['first', 'dinner', 'snack'].includes(k)) return k;
  const s = slotOf(k);
  return s ? SLOT_KIND[s] : fallback;
}

function parseIngredient(x) {
  if (typeof x === 'string') return { name: x.slice(0, 40), qty: 1, unit: 'adet' };
  if (!x || typeof x !== 'object') throw new Error('Malzeme tanımı hatalı.');
  const name = String(x.name ?? x.ad ?? x.item ?? '').trim();
  if (!name || name.length > 40) throw new Error(`Malzeme adı 1–40 karakter olmalı: "${name.slice(0, 20)}"`);
  const qty = x.qty ?? x.miktar ?? x.amount ?? 1;
  const q = Number(String(qty).replace(',', '.'));
  if (!Number.isFinite(q) || q <= 0 || q > 5000) throw new Error(`"${name}": miktar 0–5000 arasında olmalı.`);
  return { name, qty: q, unit: normUnit(x.unit ?? x.birim) };
}

function parseCustomMeal(m, fallbackKind = 'dinner') {
  if (!m || typeof m !== 'object') throw new Error('Öğün tanımı hatalı.');
  const name = String(m.name ?? m.ad ?? '').trim();
  if (!name || name.length > 60) throw new Error(`Öğün adı 1–60 karakter olmalı: "${name.slice(0, 30)}"`);
  const protein = Number(m.protein ?? m.protein_g ?? m.proteinG);
  if (!Number.isFinite(protein) || protein < 0 || protein > 150) throw new Error(`"${name}": protein 0–150 g arasında bir sayı olmalı.`);
  const kRaw = m.kcal ?? m.kalori ?? m.calories;
  const kcal = kRaw == null || kRaw === '' ? null : Number(kRaw);
  if (kcal != null && (!Number.isFinite(kcal) || kcal < 0 || kcal > 2000)) throw new Error(`"${name}": kalori 0–2000 arasında olmalı.`);
  const placeText = normText(m.place ?? m.yer ?? '', { fold: true });
  const stepsIn = m.steps ?? m.adimlar ?? m['adımlar'] ?? [];
  const ingIn = m.ingredients ?? m.malzemeler ?? [];
  return {
    id: String(m.id ?? '').trim().slice(0, 40),
    name,
    slot: kindOf(m.slot ?? m.ogun ?? m['öğün'], fallbackKind),
    place: OUT_WORDS.some((w) => placeText.includes(w)) ? 'out' : 'home',
    protein: Math.round(protein),
    kcal: kcal == null ? null : Math.round(kcal),
    minutes: clamp(Math.round(Number(m.minutes ?? m.dakika) || 10), 1, 180),
    steps: (Array.isArray(stepsIn) ? stepsIn : [stepsIn]).filter(Boolean).slice(0, 8).map((s) => String(s).slice(0, 200)),
    ingredients: (Array.isArray(ingIn) ? ingIn : []).slice(0, 15).map(parseIngredient),
    tip: m.tip ?? m.ipucu ? String(m.tip ?? m.ipucu).slice(0, 200) : null,
    veg: !!m.veg,
    custom: true,
  };
}

function findMealByName(name, customs) {
  const n = normText(name, { fold: true });
  const pools = [Object.values(customs), Object.values(MEALS), Object.values(OUT_OPTIONS)];
  for (const pool of pools) for (const m of pool) if (normText(m.name, { fold: true }) === n) return m.id;
  return null;
}

function uniqueId(base, taken) {
  let id = base.replace(/[^a-z0-9_]/gi, '_').slice(0, 40) || 'ogun';
  if (MEALS[id] || OUT_OPTIONS[id]) id = `c_${id}`;
  let n = 2;
  let out = id;
  while (taken.has(out)) out = `${id}_${n++}`;
  taken.add(out);
  return out;
}

/** Yapay zekâ cevabındaki 7 günlük planı okur ve doğrular. Hata varsa Türkçe mesajla fırlatır. */
export function parseMealPlan(text) {
  const looksLikePlan = (o) => o != null && typeof o === 'object'
    && (Array.isArray(o) || ['days', 'gunler', 'günler', 'plan', 'mealPlan', 'meal_plan', 'yemek_plani'].some((k) => k in o));
  const { found, obj } = extractJson(text, looksLikePlan);
  if (!found) throw new Error('Metinde yemek planı bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  if (!obj) throw new Error('Yemek planı okunamadı: JSON bozuk. Yapay zekâya "Planı yalnızca geçerli JSON olarak, tek bir ```json bloğunda tekrar ver" yaz.');

  let root = Array.isArray(obj) ? { days: obj } : obj;
  for (const k of ['plan', 'mealPlan', 'meal_plan', 'yemek_plani']) {
    if (root[k] && typeof root[k] === 'object') {
      const inner = Array.isArray(root[k]) ? { days: root[k] } : root[k];
      root = { ...inner, note: inner.note ?? root.note, meals: inner.meals ?? root.meals };
      break;
    }
  }
  let days = root.days ?? root.gunler ?? root['günler'];
  if (days && !Array.isArray(days) && typeof days === 'object') {
    const arr = new Array(7).fill(null);
    for (const [k, v] of Object.entries(days)) {
      const i = dayIndex(k);
      if (i >= 0) arr[i] = v;
    }
    days = arr;
  }
  if (!Array.isArray(days) || days.length !== 7 || days.some((d) => !d || typeof d !== 'object')) {
    throw new Error('Plan 7 gün (Pazartesi → Pazar) içermeli; her gün için "first", "dinner", "snack1" alanları olmalı.');
  }

  const taken = new Set();
  const customs = {};
  const idMap = {};
  const declared = root.meals ?? root.ogunler ?? root['öğünler'] ?? [];
  for (const m of Array.isArray(declared) ? declared : Object.values(declared)) {
    const cm = parseCustomMeal(m);
    const original = cm.id;
    cm.id = uniqueId(original || `c_${normText(cm.name, { fold: true }).replace(/ /g, '_')}`, taken);
    customs[cm.id] = cm;
    if (original) idMap[original] = cm.id;
  }

  const resolve = (v, slot, dayNo) => {
    if (v == null || v === '' || v === false) return null;
    if (typeof v === 'object') {
      const cm = parseCustomMeal(v, SLOT_KIND[slot]);
      cm.id = uniqueId(cm.id || `c_${normText(cm.name, { fold: true }).replace(/ /g, '_')}`, taken);
      customs[cm.id] = cm;
      return cm.id;
    }
    const s = String(v).trim();
    if (OUT_WORDS.includes(normText(s, { fold: true }))) return OUT;
    if (MEALS[s] || OUT_OPTIONS[s]) return s;
    if (idMap[s]) return idMap[s];
    if (customs[s]) return s;
    const byName = findMealByName(s, customs);
    if (byName) return byName;
    throw new Error(`${WEEKDAYS[dayNo]}, ${SLOT_LABELS[slot]}: "${s.slice(0, 40)}" bulunamadı. Hazır öğün kimliği, "meals" içinde tanımlı bir öğün ya da "out" olmalı.`);
  };

  const outDays = days.map((d, i) => {
    const r = { first: null, dinner: null, snack1: null, snack2: null };
    for (const [k, v] of Object.entries(d)) {
      const slot = slotOf(k);
      if (slot) r[slot] = resolve(v, slot, i);
    }
    if (!r.first && !r.dinner) throw new Error(`${WEEKDAYS[i]}: en az bir ana öğün (first ya da dinner) olmalı.`);
    return r;
  });

  const used = new Set(outDays.flatMap((d) => SLOTS.map((s) => d[s])));
  const customMeals = Object.fromEntries(Object.entries(customs).filter(([id]) => used.has(id)));
  const note = root.note ?? root.not ?? root['açıklama'] ?? '';
  return { note: typeof note === 'string' ? note.slice(0, 500) : '', days: outDays, customMeals };
}
