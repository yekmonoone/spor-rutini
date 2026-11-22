// Yemek sekmesi: Bugün · Plan · Alışveriş · Rehber (+ tercihler). Kalori sayılmaz; "Yedim" proteini günlük kayda ekler.
import { state, setKV, saveDaily } from '../store.js';
import { h, appendChildren, btn, card, segmented, chips, openSheet, confirmSheet, toast, selectEl, field } from '../ui.js';
import { INGREDIENTS, MEALS, OUT_OPTIONS, TOOLS, EAT_OUT_RULES, KCAL_FILLERS } from '../foods.js';
import {
  OUT, SLOTS, SLOT_LABELS, SLOT_KIND, KIND_LABELS, defaultPrefs, mealById, mealNutrition, slotNutrition, dayTotals,
  buildDefaultPlan, fillGaps, kcalGap, choicesFor, shoppingList, shoppingText, shoppingCycle, countShopping,
  eatenEntry, applyMealToDaily, suggest, toolsOk, qtyText, dayFor, FREE_PROTEIN, freeEntry, withOverride,
} from '../mealplan.js';
import { WEEKDAYS, WEEKDAYS_SHORT, weekday, weekStart, addDays, fmtNum, uid } from '../util.js';
import { today, go } from '../context.js';
import { setAssistantKind } from './assistant.js';

const PATHS = { bugun: '/yemek', plan: '/yemek/plan', alisveris: '/yemek/alisveris', rehber: '/yemek/rehber' };
const EXTRA_SLOTS = ['snack1', 'snack2', 'extra1', 'extra2', 'extra3'];
let guideFilter = 'home';

const rng = ([a, b], digits = 0) => (a === b ? fmtNum(a, digits) : `${fmtNum(a, digits)}–${fmtNum(b, digits)}`);
const prefsOf = (plan) => ({ ...defaultPrefs(), ...(plan?.prefs ?? {}) });
const slotLabel = (slot) => SLOT_LABELS[slot] ?? 'Ek ara öğün';

/* ---------- Ortak parçalar ---------- */

function mealInfo(meal) {
  const n = mealNutrition(meal);
  const badges = [];
  if (meal.place !== 'out' && meal.minutes) badges.push(`⏱ ${meal.minutes} dk`);
  if (meal.veg) badges.push('🥗 sebzeli');
  if (meal.tools?.length) badges.push(meal.tools.map((t) => TOOLS[t] ?? t).join(' + '));
  if (meal.custom) badges.push('🤖 yapay zekâ');
  return h('div', { class: 'meal-info' },
    h('div', { class: 'meal-name', text: meal.name }),
    h('div', { class: 'muted small', text: `~${rng(n.protein)} g protein${n.kcal ? ` · ~${rng(n.kcal)} kcal` : ''}` }),
    badges.length ? h('div', { class: 'badges' }, badges.map((b) => h('span', { class: 'badge', text: b }))) : null);
}

function mealDetails(meal) {
  if (meal.place === 'out') return meal.tip ? h('p', { class: 'small', text: `💡 ${meal.tip}` }) : null;
  const ings = (meal.ingredients ?? []).map((i) => {
    if (Array.isArray(i)) {
      const d = INGREDIENTS[i[0]];
      return d ? `${d.name} — ${qtyText(i[1], d.unit)}` : null;
    }
    return `${i.name} — ${qtyText(i.qty, i.unit)}`;
  }).filter(Boolean);
  if (!ings.length && !meal.steps?.length && !meal.tip) return null;
  return h('details', { class: 'how' },
    h('summary', { text: 'Malzemeler ve hazırlık' }),
    ings.length ? h('ul', null, ings.map((t) => h('li', { text: t }))) : null,
    meal.steps?.length ? h('ol', { class: 'steps' }, meal.steps.map((t) => h('li', { text: t }))) : null,
    meal.tip ? h('p', { class: 'small', text: `💡 ${meal.tip}` }) : null);
}

/** "Listede yok" — adını yaz, proteini kabaca seç. */
function openFreeFood(onDone) {
  const name = h('input', { type: 'text', class: 'input', placeholder: 'ör. Çiğköfte dürüm', maxlength: 60 });
  let protein = FREE_PROTEIN[0].value;
  const level = segmented(FREE_PROTEIN.map((f) => ({ value: f.value, label: f.label })), protein, (v) => { protein = v ?? protein; });
  let sheet;
  sheet = openSheet({
    title: 'Listede olmayan bir şey',
    content: h('div', { class: 'form' },
      field('Ne yedin?', name),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Protein (kabaca)' }), level,
        h('div', { class: 'hint', text: FREE_PROTEIN.map((f) => `${f.label}: ${f.hint}`).join(' · ') })),
      h('p', { class: 'muted small', text: 'Plan dışı yemek normal; günün kalanında protein önerisi çıkar.' })),
    actions: [btn('Kaydet', () => {
      const n = name.value.trim();
      if (!n) { toast('Ne yediğini yaz.'); return; }
      sheet.close();
      onDone(freeEntry(n, protein));
    }, 'primary')],
  });
}

/** Öğün seçici: Bugün'de "ne yedim", Plan'da slot düzenleme için. onFree verilirse "Listede yok" seçeneği çıkar. */
export function openMealPicker({ title, slot, plan, includeOutGeneric = false, includeNone = false, onPick, onFree = null }) {
  const kind = SLOT_KIND[slot] ?? 'snack';
  const tools = prefsOf(plan).tools;
  let sheet;
  const pick = (value) => { sheet.close(); onPick(value); };
  const row = (meal) => h('button', { type: 'button', class: 'entry', onClick: () => pick(meal.id) },
    h('span', { class: 'entry-main' }, mealInfo(meal)),
    h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
  const outs = Object.values(OUT_OPTIONS).filter((o) => o.slots.includes(kind));
  const homes = choicesFor(slot, plan, tools);
  sheet = openSheet({
    title,
    content: h('div', null,
      onFree ? h('button', { type: 'button', class: 'btn block', text: '✍️ Listede yok — kendim yazayım', onClick: () => { sheet.close(); openFreeFood(onFree); } }) : null,
      includeOutGeneric ? h('button', { type: 'button', class: 'btn block', text: '🍽️ Dışarıda (sonra seçerim)', onClick: () => pick(OUT) }) : null,
      includeNone ? h('button', { type: 'button', class: 'btn block ghost', text: '— Boş bırak', onClick: () => pick(null) }) : null,
      homes.length ? h('h3', { class: 'date-head', text: kind === 'snack' ? 'Ara öğünler' : 'Evde' }) : null,
      homes.map(row),
      outs.length ? h('h3', { class: 'date-head', text: 'Dışarıda / paket' }) : null,
      outs.map(row)),
  });
}

/** entryOrMeal: kütüphane öğünü, serbest kayıt (freeEntry) ya da null (geri al). */
export async function markEaten(t, slot, entryOrMeal) {
  const entry = !entryOrMeal ? null : entryOrMeal.free ? entryOrMeal : eatenEntry(entryOrMeal);
  await saveDaily(t, applyMealToDaily(state.daily[t], slot, entry));
  toast(entry ? `${entry.name.slice(0, 30)} ✓ +${entry.protein} g protein` : 'Geri alındı');
}

/** "Ne yedin?" seçicisi — Bugün ekranı ve Yemek sekmesi ortak kullanır. */
export function askWhatEaten(t, slot, plan) {
  openMealPicker({
    title: `${slotLabel(slot)}: ne yedin?`,
    slot,
    plan,
    onPick: (id) => id && markEaten(t, slot, mealById(id, plan)),
    onFree: (entry) => markEaten(t, slot, entry),
  });
}

function proteinMeter(protein, min, max) {
  const pct = max ? Math.min(100, Math.round((protein / max) * 100)) : 0;
  const reached = min && protein >= min;
  return h('div', { class: 'meter', role: 'img', 'aria-label': `Protein ${protein} gram, hedef ${min}–${max} gram` },
    h('div', { class: `meter-fill${reached ? ' done' : ''}`, style: { width: `${pct}%` } }));
}

/* ---------- Tercihler (ilk açılış ve sonradan) ---------- */

function renderSetup(root, existing) {
  const prefs = prefsOf(state.mealplan);
  const dayOpts = WEEKDAYS.map((_, i) => ({ value: i, label: WEEKDAYS_SHORT[i] }));
  const lunch = chips(dayOpts, prefs.lunchOutDays);
  const dinner = chips(dayOpts, prefs.dinnerOutDays);
  const tools = chips(Object.entries(TOOLS).map(([value, label]) => ({ value, label })), prefs.tools);
  const shopDay = selectEl(WEEKDAYS.map((n, i) => ({ value: i, label: n })), prefs.shoppingDay);
  const read = () => ({ lunchOutDays: lunch.getValue(), dinnerOutDays: dinner.getValue(), tools: tools.getValue(), shoppingDay: Number(shopDay.value) });

  const regenerate = async () => {
    if (existing && !(await confirmSheet({ title: 'Planı yeniden oluştur', message: 'Mevcut haftalık plan (yapay zekâdan gelen dahil) bu tercihlere göre yeniden oluşturulacak.', confirmLabel: 'Oluştur' }))) return;
    const p = read();
    await setKV('mealplan', { prefs: p, days: buildDefaultPlan(p, state.profile), customMeals: {}, source: 'default', note: '', updatedAt: new Date().toISOString() });
    toast('Yemek planı hazır ✓');
    go('/yemek/plan');
  };
  const saveOnly = async () => {
    await setKV('mealplan', { ...state.mealplan, prefs: read(), updatedAt: new Date().toISOString() });
    toast('Tercihler kaydedildi ✓');
    go('/yemek/plan');
  };

  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: existing ? 'Yemek tercihleri' : 'Yemek planı 🍽️' }),
      h('p', { class: 'muted', text: 'Kahvaltı yok, günde 2 öğün + ara öğün düzenine göre: öğlen ilk öğün (evdeysen kahvaltı tipi), akşam ve proteinli ara öğünler.' }))),
    card(
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Öğleni genelde dışarıda yediğin günler' }), lunch,
        h('div', { class: 'hint', text: 'Bu günlerde ilk öğün "dışarıda" olur; rehberden seçim yaparsın.' })),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Akşamı dışarıda / paket yediğin günler' }), dinner),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Mutfakta neler var?' }), tools),
      field('Alışveriş günü', shopDay, 'Liste işaretleri bu günde sıfırlanır; o gün hatırlatma görürsün.')),
    h('div', { class: 'actions-row' },
      existing ? btn('Sadece kaydet', saveOnly) : null,
      btn(existing ? 'Kaydet ve planı yeniden oluştur' : 'Planı oluştur', regenerate, 'primary')),
    h('p', { class: 'muted small center', text: 'Değerler yaklaşıktır. Plan protein öncelikli; kaloriyi tartı ortalamasıyla ayarlamaya devam ediyoruz.' }),
  ]);
}

/* ---------- Bugün ---------- */

function renderToday(root, plan) {
  const t = today();
  const wd = weekday(t);
  const day = dayFor(plan, t);
  const daily = state.daily[t] ?? {};
  const eaten = daily.meals ?? {};
  const p = state.profile ?? {};
  const protein = daily.proteinG ?? 0;
  const min = p.proteinMin ?? 120;
  const max = p.proteinMax ?? min;

  const slotKeys = [...new Set([...SLOTS.filter((s) => day[s] || eaten[s]), ...Object.keys(eaten)])];
  const plannedLeft = SLOTS.filter((s) => day[s] && !eaten[s]).reduce((a, s) => a + (slotNutrition(day[s], s, plan)?.mid ?? 0), 0);
  const projected = protein + plannedLeft;

  root.append(card(
    h('div', { class: 'card-head' }, h('h2', { text: 'Bugünkü protein' }), h('span', { class: 'badge', text: `hedef ${min}–${max} g` })),
    h('p', { class: 'stat-value', text: `${protein} g` }),
    proteinMeter(protein, min, max),
    h('p', { class: 'muted small', text: plannedLeft ? `Kalan öğünler planlandığı gibi yenirse ~${projected} g.` : (protein >= min ? '✓ Hedefe ulaştın.' : `Hedefe ~${min - protein} g kaldı.`) })));

  for (const slot of slotKeys) {
    const planned = day[slot] ?? null;
    const entry = eaten[slot] ?? null;
    const meal = planned && planned !== OUT ? mealById(planned, plan) : null;
    const isOut = planned === OUT || meal?.place === 'out';
    const c = h('section', { class: `card meal-card${entry ? ' eaten' : ''}` },
      h('div', { class: 'card-head' },
        h('h3', { text: slotLabel(slot) }),
        h('span', { class: 'badge', text: entry ? '✓ yendi' : isOut ? 'Dışarıda' : 'Ev' })));
    if (entry) {
      c.append(
        h('p', null, h('strong', { text: entry.name }), h('span', { class: 'muted', text: ` · ~${entry.protein} g protein` })),
        h('div', { class: 'actions-row' },
          btn('Değiştir', () => askWhatEaten(t, slot, plan), 'small'),
          btn('Geri al', () => markEaten(t, slot, null), 'small ghost')));
    } else if (planned === OUT) {
      c.append(
        h('p', { class: 'muted', text: 'Dışarıda yiyeceksin. Yediğinde seç; proteini kayda eklenir.' }),
        h('div', { class: 'actions-row' },
          btn('Ne yedim? Seç', () => askWhatEaten(t, slot, plan), 'primary'),
          btn('Kurallar', () => { guideFilter = 'out'; go('/yemek/rehber'); }, 'small ghost')));
    } else if (meal) {
      c.append(mealInfo(meal), mealDetails(meal),
        h('div', { class: 'actions-row' },
          btn('Başka bir şey yedim', () => askWhatEaten(t, slot, plan), 'small'),
          btn('Yedim ✓', () => markEaten(t, slot, meal), 'primary')));
    }
    root.append(c);
  }

  // Hedef için öneriler
  const gap = min - projected;
  if (gap > 0) {
    const free = EXTRA_SLOTS.find((s) => !eaten[s] && !day[s]) ?? EXTRA_SLOTS.find((s) => !eaten[s]);
    const sug = suggest({ remaining: gap, kind: 'snack', plan, tools: prefsOf(plan).tools });
    root.append(card(
      h('h3', { text: `Hedefe ~${gap} g kalıyor` }),
      h('p', { class: 'muted small', text: 'Proteinli bir ara öğün ekleyebilirsin:' }),
      h('div', { class: 'sug-list' }, sug.map(({ meal, n }) => h('div', { class: 'sug' },
        h('span', { text: `${meal.name} (~${n.mid} g)` }),
        free ? btn('Yedim', () => markEaten(t, free, meal), 'small') : null)))));
  }

  const kg = kcalGap(day, plan, p);
  if (kg > 300) {
    root.append(h('div', { class: 'notice' },
      h('strong', { text: `Bugünkü plan ~${fmtNum(dayTotals(day, plan).kcalMid, 0)} kcal; hedefinin ~${fmtNum(kg, 0)} kcal altında.` }),
      h('p', { class: 'small', text: `Çok düşük kalori kas kaybını artırır. Kolay eklemeler: ${KCAL_FILLERS.slice(0, 3).map((f) => `${f.name} (~${f.kcal} kcal)`).join(', ')}.` })));
  }
  root.append(h('p', { class: 'muted small center', text: 'Sebze: öğle ve akşam birer porsiyon · Değerler yaklaşıktır.' }));
}

/* ---------- Plan ---------- */

function renderPlan(root, plan) {
  const t = today();
  const twd = weekday(t);
  const prefs = prefsOf(plan);
  const p = state.profile ?? {};
  const min = p.proteinMin ?? 120;

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart(t), i));
  const save = async (next) => {
    await setKV('mealplan', { ...next, source: plan.source === 'ai' ? 'ai-edited' : plan.source, updatedAt: new Date().toISOString() });
  };
  const editSlot = (wd, slot) => {
    const kind = SLOT_KIND[slot];
    openMealPicker({
      title: `${WEEKDAYS[wd]} · ${slotLabel(slot)}`,
      slot,
      plan,
      includeOutGeneric: kind !== 'snack',
      includeNone: kind === 'snack',
      onPick: async (value) => {
        // Plan sekmesindeki düzenleme haftalık şablonu değiştirir; o güne özel değişiklik varsa kaldırılır.
        const days = plan.days.map((d) => ({ ...d }));
        days[wd][slot] = value;
        if (slot !== 'snack2' && !days[wd].snack2) fillGaps(days[wd], p, plan, prefs.tools);
        await save(withOverride({ ...plan, days }, weekDates[wd], slot, undefined, t));
      },
    });
  };

  // Hedefin %95'i "hedefte" sayılır (değerler zaten yaklaşık).
  const lowProtein = (d) => dayTotals(d, plan).mid < min * 0.95;
  let home = 0;
  let out = 0;
  let veg = 0;
  let below = 0;
  let kcalSum = 0;
  let gapSum = 0;
  plan.days.forEach((d) => {
    for (const s of ['first', 'dinner']) {
      if (d[s] === OUT || mealById(d[s], plan)?.place === 'out') out++;
      else if (d[s]) { home++; if (mealById(d[s], plan)?.veg) veg++; }
    }
    if (lowProtein(d)) below++;
    kcalSum += dayTotals(d, plan).kcalMid;
    gapSum += kcalGap(d, plan, p);
  });
  const avgKcal = Math.round(kcalSum / 7);
  const avgGap = Math.round(gapSum / 7);

  appendChildren(root, [
    h('div', { class: 'actions-row' },
      btn('Tercihler', () => go('/yemek/tercihler'), 'small'),
      state.settings.aiEnabled
        ? btn('🤖 Claude\'dan plan iste', () => { setAssistantKind('meals'); go('/asistan'); }, 'small primary')
        : null),
    plan.note ? h('div', { class: 'notice pre', text: `🤖 ${plan.note}` }) : null,
    h('p', { class: 'muted small', text: `Bu hafta: ${home} ev öğünü (${veg} tanesi sebzeli), ${out} dışarıda öğün.${below ? ` ${below} günde planlanan protein hedefin altında.` : ' Protein her gün hedefte.'}` }),
    avgGap > 250
      ? h('div', { class: 'notice' },
        h('strong', { text: `Plan günde ortalama ~${fmtNum(avgKcal, 0)} kcal; hedefin ~${fmtNum(avgGap, 0)} kcal altında.` }),
        h('p', { class: 'small', text: `Plan protein öncelikli. Çok düşük kalori kas kaybını artırır; günlerine şunlardan ekle: ${KCAL_FILLERS.slice(0, 3).map((f) => `${f.name} (~${f.kcal} kcal)`).join(', ')}.` }))
      : null,
  ]);

  // Bu haftadan sonraki günlere ait güne özel değişiklikler (ör. Pazar akşamı gün sonu kontrolü).
  const later = Object.entries(plan.overrides ?? {}).filter(([d]) => d > weekDates[6]).sort(([a], [b]) => (a < b ? -1 : 1));
  if (later.length) {
    root.append(h('div', { class: 'notice' },
      h('strong', { text: 'Önümüzdeki günlere özel değişiklikler' }),
      h('ul', { class: 'rules' }, later.flatMap(([d, slots]) => Object.entries(slots).map(([s, v]) =>
        h('li', { text: `${WEEKDAYS[weekday(d)]} (${d.slice(8)}.${d.slice(5, 7)}) · ${slotLabel(s)}: ${v === OUT ? 'Dışarıda' : v ? mealById(v, plan)?.name ?? v : '—'}` }))))));
  }

  plan.days.forEach((_, wd) => {
    const changed = plan.overrides?.[weekDates[wd]] ?? {};
    const d = dayFor(plan, weekDates[wd]);
    const tot = dayTotals(d, plan);
    const rows = SLOTS.filter((s) => s !== 'snack2' || d.snack2).map((slot) => {
      const v = d[slot];
      const meal = mealById(v, plan);
      const n = slotNutrition(v, slot, plan);
      const name = `${v === OUT ? '🍽️ Dışarıda' : meal ? meal.name : '—'}${slot in changed ? ' • bu haftaya özel' : ''}`;
      return h('button', { type: 'button', class: 'slot-row', onClick: () => editSlot(wd, slot) },
        h('span', { class: 'slot-label', text: KIND_LABELS[SLOT_KIND[slot]] }),
        h('span', { class: 'slot-name', text: name }),
        h('span', { class: 'muted small', text: n ? `~${n.mid} g` : '' }));
    });
    if (!d.snack2) {
      rows.push(h('button', { type: 'button', class: 'slot-row add', onClick: () => editSlot(wd, 'snack2') },
        h('span', { class: 'slot-label', text: '+' }), h('span', { class: 'slot-name muted', text: 'Ek ara öğün ekle' }), h('span')));
    }
    const warn = [];
    if (lowProtein(d)) warn.push('⚠️ Protein hedefin altında: dışarıda ızgara/şiş seç ya da ek ara öğün ekle.');
    root.append(h('section', { class: `card day-card${wd === twd ? ' today' : ''}` },
      h('div', { class: 'card-head' },
        h('h3', { text: `${WEEKDAYS[wd]}${wd === twd ? ' · bugün' : ''}` }),
        h('span', { class: 'badge', text: `~${tot.mid} g · ~${fmtNum(tot.kcalMid, 0)} kcal` })),
      rows,
      warn.length ? h('div', { class: 'small muted day-warn' }, warn.map((w) => h('p', { text: w }))) : null));
  });
}

/* ---------- Alışveriş ---------- */

function renderShopping(root, plan) {
  const t = today();
  const prefs = prefsOf(plan);
  const cycle = shoppingCycle(t, prefs.shoppingDay);
  const cur = state.shopping?.cycle === cycle ? state.shopping : { cycle, checked: {}, extra: [] };
  const groups = shoppingList(plan);
  const counter = h('span', { class: 'badge' });
  const updateCounter = (s) => {
    const { total, done } = countShopping(groups, s.extra ?? [], s.checked ?? {});
    counter.textContent = `${done}/${total} alındı`;
  };
  updateCounter(cur);
  let working = { ...cur, checked: { ...(cur.checked ?? {}) }, extra: [...(cur.extra ?? [])] };
  const toggle = async (key, on) => {
    if (on) working.checked[key] = true; else delete working.checked[key];
    updateCounter(working);
    await setKV('shopping', { ...working, checked: { ...working.checked } }, { silent: true });
  };
  const itemRow = (key, label, sub, note) => {
    const input = h('input', { type: 'checkbox', checked: !!working.checked[key] });
    input.addEventListener('change', () => toggle(key, input.checked));
    return h('label', { class: 'shop-item' }, input,
      h('span', { class: 'shop-text' }, h('span', { text: label }), sub ? h('span', { class: 'muted small', text: ` · ${sub}` }) : null,
        note ? h('span', { class: 'shop-note', text: note }) : null));
  };

  const extraInput = h('input', { type: 'text', class: 'input', placeholder: 'Ürün ekle (ör. deterjan)' });
  const addExtra = async () => {
    const name = extraInput.value.trim().slice(0, 60);
    if (!name) return;
    working.extra.push({ id: `e_${uid()}`, name });
    await setKV('shopping', { ...working });
  };
  const text = () => shoppingText(groups, { extra: working.extra, checked: working.checked, onlyUnchecked: true });
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); toast('Liste kopyalandı ✓'); } catch { toast('Kopyalanamadı.'); }
  };
  const share = async () => {
    try { await navigator.share({ title: 'Alışveriş listesi', text: text() }); } catch (err) { if (err?.name !== 'AbortError') copy(); }
  };

  appendChildren(root, [
    h('div', { class: 'card-head' },
      h('p', { class: 'muted small', text: `Alışveriş günü: ${WEEKDAYS[prefs.shoppingDay]} · plandaki ev öğünlerine göre` }),
      counter),
    groups.length ? null : card(h('p', { class: 'empty', text: 'Planda ev öğünü yok; liste boş.' })),
    groups.map((g) => card(h('h3', { text: g.label }), g.items.map((i) => itemRow(i.key, i.name, i.qtyText, i.note)))),
    card(
      h('h3', { text: 'Diğer' }),
      working.extra.map((e) => itemRow(e.id, e.name, null, null)),
      h('div', { class: 'add-row' }, extraInput, btn('Ekle', addExtra, 'small'))),
    h('div', { class: 'actions-row' },
      navigator.share ? btn('Paylaş', share) : null,
      btn('Listeyi kopyala', copy, 'primary')),
    h('p', { class: 'muted small', text: 'İpucu: tavuğu porsiyonlayıp dondur; lavaş ve ekmeği dondurucuda tut; kısa ömürlüleri (⏳) hafta ortasına böl.' }),
  ]);
}

/* ---------- Rehber ---------- */

function renderGuide(root, plan) {
  const tools = prefsOf(plan).tools;
  const filter = segmented([{ value: 'home', label: '🏠 Evde' }, { value: 'out', label: '🍽️ Dışarıda' }, { value: 'snack', label: '🥛 Ara öğün' }], guideFilter, (v) => {
    guideFilter = v ?? 'home';
    root.replaceChildren();
    renderMeals(root, 'rehber');
  });
  root.append(h('div', { class: 'filter-row' }, filter));
  const mealCard = (meal) => {
    const missing = meal.place !== 'out' && !toolsOk(meal, tools);
    return card(mealInfo(meal), missing ? h('p', { class: 'small muted', text: '⚠️ Gerekli alet tercihlerinde yok.' }) : null, mealDetails(meal));
  };
  if (guideFilter === 'out') {
    root.append(card(h('h3', { text: 'Dışarıda yeme kuralları' }), h('ul', { class: 'rules' }, EAT_OUT_RULES.map((r) => h('li', { text: r })))));
    Object.values(OUT_OPTIONS).forEach((o) => root.append(mealCard(o)));
  } else if (guideFilter === 'snack') {
    Object.values(MEALS).filter((m) => m.slot === 'snack').forEach((m) => root.append(mealCard(m)));
  } else {
    for (const kind of ['first', 'dinner']) {
      root.append(h('h3', { class: 'section-title', text: kind === 'first' ? 'İlk öğün (kahvaltı tipi)' : 'Akşam' }));
      [...Object.values(MEALS), ...Object.values(plan.customMeals ?? {})].filter((m) => m.slot === kind && m.place !== 'out').forEach((m) => root.append(mealCard(m)));
    }
  }
  root.append(h('p', { class: 'muted small center', text: 'Besin değerleri yaklaşıktır (USDA, TürKomp ve ürün etiketleri); markaya ve porsiyona göre değişir.' }));
}

/* ---------- Giriş ---------- */

export function renderMeals(root, sub = 'bugun') {
  const plan = state.mealplan;
  if (!plan?.days || sub === 'tercihler') {
    renderSetup(root, !!plan?.days);
    return;
  }
  const nav = segmented([
    { value: 'bugun', label: 'Bugün' },
    { value: 'plan', label: 'Plan' },
    { value: 'alisveris', label: 'Alışveriş' },
    { value: 'rehber', label: 'Rehber' },
  ], sub, (v) => go(PATHS[v ?? 'bugun']));
  nav.setAttribute('aria-label', 'Yemek bölümleri');
  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: 'Yemek' }),
      h('p', { class: 'muted', text: plan.source?.startsWith('ai') ? '🤖 Yapay zekâ planı' : 'Protein öncelikli, az uğraşlı plan' }))),
    h('div', { class: 'filter-row' }, nav),
  ]);
  if (sub === 'plan') renderPlan(root, plan);
  else if (sub === 'alisveris') renderShopping(root, plan);
  else if (sub === 'rehber') renderGuide(root, plan);
  else renderToday(root, plan);
}
