// 3. aşama (kopyala-yapıştır modu): verilerden yapay zekâ için hazır mesaj üretir ve
// yapay zekânın önerdiği programı okur. Ağ isteği yok; mesajı kullanıcı kendisi kopyalar.
// Saf fonksiyonlar — testlerde de kullanılır.
import { EX, PHASES, DAY_TYPES, programFor, programWeek, blockOf, targetText, plannedSets, resistanceText } from './program.js';
import { weeklyAverages, weeklySessions, exerciseHistory, trackedItems, valuesInRange } from './stats.js';
import { ageFromBirthYear } from './targets.js';
import { addDays, avg, fmtDate, fmtNum, weekStart, weekday, WEEKDAYS } from './util.js';
import { PAIN_AREAS } from './rules.js';
import { extractJson } from './extract-json.js';
import { MEALS, OUT_OPTIONS, TOOLS } from './foods.js';
import { defaultPrefs, buildDefaultPlan, mealNutrition, dayFor, mealById, mealsWithoutNewGroceries, OUT, SLOTS, SLOT_LABELS } from './mealplan.js';
import { dayPlanFor } from './program.js';
import { isStrength } from './stats.js';

export const AI_TARGETS = {
  claude: { label: 'Claude', url: 'https://claude.ai/new' },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/app' },
  other: { label: 'Diğer (yalnızca kopyala)', url: null },
};

export const PROMPT_KINDS = {
  review: { label: 'Değerlendir', icon: '📋' },
  program: { label: 'Program', icon: '🗓️' },
  meals: { label: 'Yemek', icon: '🍽️' },
  day: { label: 'Gün sonu', icon: '🌙' },
  question: { label: 'Soru', icon: '💬' },
};

export const MAX_DAY_CHANGES = 3;
const DAY_PLAN_TYPES = ['strength', 'walk', 'brisk', 'padel', 'rest'];

/** Gün sonu kontrolünde değiştirilebilecek tarihler: bugünden sonra haftanın kalanı (Pazar ise önümüzdeki 7 gün). */
export function changeableDates(today) {
  const out = [];
  const end = addDays(weekStart(today), 6);
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) out.push(d);
  if (!out.length) for (let i = 1; i <= 7; i++) out.push(addDays(today, i));
  return out;
}

function mealName(v, plan) {
  if (!v) return '—';
  if (v === OUT) return 'dışarıda';
  return mealById(v, plan)?.name ?? v;
}

function todaySection(state, today) {
  const r = state.daily[today] ?? {};
  const plan = dayPlanFor(state.settings, today, weekday(today));
  const w = state.workouts.filter((x) => x.date === today && isStrength(x)).pop();
  const workout = w ? `yapıldı (Gün ${w.day}${w.short ? ', kısa' : ''})` : r.workoutSkipped ? 'yapılamadı' : 'kaydedilmedi';
  const eaten = Object.entries(r.meals ?? {}).map(([slot, m]) => `${SLOT_LABELS[slot] ?? 'Ek'}: ${m.name}${m.free ? ' (plan dışı)' : ''} ~${m.protein} g`);
  const p = state.profile ?? {};
  return [
    `- Planlanan gün: ${DAY_TYPES[plan.type]?.label ?? plan.type}. Antrenman: ${workout}. Yürüyüş: ${r.walked ? (r.brisk ? 'yapıldı (tempolu)' : 'yapıldı') : 'kaydedilmedi'}.`,
    `- Yenenler: ${eaten.length ? eaten.join('; ') : 'kaydedilmedi'}.`,
    `- Protein: ${r.proteinG ?? 0} g (hedef ${p.proteinMin ?? '?'}–${p.proteinMax ?? '?'} g). Uyku: ${r.sleepH ?? '–'} sa. Adım: ${r.steps ?? '–'}.`,
    `- Notum: ${r.note?.trim() || '(yok)'}`,
  ].join('\n');
}

function restOfWeekSection(state, today) {
  const mp = state.mealplan;
  return changeableDates(today).map((d) => {
    const plan = dayPlanFor(state.settings, d, weekday(d));
    const md = mp?.days ? dayFor(mp, d) : null;
    const meals = md ? SLOTS.filter((s) => md[s]).map((s) => `${s}=${mealName(md[s], mp)}`).join(', ') : 'yemek planı yok';
    return `- ${d} (${WEEKDAYS[weekday(d)]}): ${DAY_TYPES[plan.type]?.label ?? plan.type}; ${meals}`;
  }).join('\n');
}

function dayTask(state, today) {
  const dates = changeableDates(today);
  const allowed = state.mealplan?.days ? mealsWithoutNewGroceries(state.mealplan) : { home: [], out: [] };
  const example = { note: 'kısa açıklama', changes: [{ type: 'day', date: dates[0], plan: 'strength' }] };
  if (state.mealplan?.days) example.changes.push({ type: 'meal', date: dates[0], slot: 'dinner', meal: allowed.home.find((m) => m.slot === 'dinner')?.id ?? OUT });
  return [
    'Görev: Bugün planımdan saptım (yukarıdaki "Bugün" bölümü ve notum). Haftanın kalanı için en fazla 3 küçük değişiklik öner; gerek yoksa değişiklik önerme. Önce 2–3 cümleyle açıkla.',
    'Sınırlar (uygulama bunları kontrol eder, dışına çıkan öneri reddedilir):',
    '- Yeni malzeme alınmayacak: yemek değişikliklerinde yalnızca aşağıdaki öğünleri ya da dışarıda seçeneklerini kullan.',
    '- Yeni ekipman yok, program değişmeyecek: antrenman tarafında yalnızca günün türünü değiştir (ör. kaçan kuvvet gününü başka güne kaydır).',
    `- Yalnızca şu tarihler değişebilir: ${dates.join(', ')}.`,
    '- Haftada en az 2, ideal 3 kuvvet günü; arka arkaya 3 kuvvet günü koyma; padel olan güne kuvvet koyma.',
    'En sonda TEK bir ```json bloğu ver (geçerli JSON: çift tırnak, yorum yok, sondaki virgül yok):',
    '- "changes": en fazla 3 öğe. Gün türü için {"type": "day", "date": "YYYY-AA-GG", "plan": "strength|walk|brisk|padel|rest"}; öğün için {"type": "meal", "date": "YYYY-AA-GG", "slot": "first|dinner|snack1|snack2", "meal": "kimlik" | "out" | null}.',
    `- Kullanılabilir ev öğünleri (bu haftanın alışveriş listesiyle yapılabilenler): ${allowed.home.map((m) => `${m.id} (${m.name}, ~${mealNutrition(m).mid} g)`).join('; ') || 'yok'}`,
    `- Dışarıda seçenekleri: ${allowed.out.map((o) => o.id).join(', ')}`,
    'Örnek biçim:',
    '```json',
    JSON.stringify(example),
    '```',
  ].join('\n');
}

/** Gün sonu cevabındaki değişiklikleri okur ve sınırları denetler. Hata varsa Türkçe mesajla fırlatır. */
export function parseDayChanges(text, { today, mealplan }) {
  const { found, obj } = extractJson(text, (o) => o != null && typeof o === 'object' && (Array.isArray(o) || 'changes' in o || 'degisiklikler' in o));
  if (!found) throw new Error('Metinde değişiklik listesi bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  if (!obj) throw new Error('Değişiklikler okunamadı: JSON bozuk. Yapay zekâdan aynı biçimde tekrar vermesini iste.');
  const list = Array.isArray(obj) ? obj : obj.changes ?? obj.degisiklikler ?? [];
  if (!Array.isArray(list)) throw new Error('"changes" bir liste olmalı.');
  if (list.length > MAX_DAY_CHANGES) throw new Error(`En fazla ${MAX_DAY_CHANGES} değişiklik olabilir; yapay zekâ ${list.length} önerdi. Daha az değişiklik iste.`);
  const dates = new Set(changeableDates(today));
  const allowedMeals = mealplan?.days ? new Set(mealsWithoutNewGroceries(mealplan).home.map((m) => m.id)) : new Set();
  const changes = list.map((c, i) => {
    const n = i + 1;
    if (!c || typeof c !== 'object') throw new Error(`${n}. değişiklik hatalı.`);
    const date = String(c.date ?? c.tarih ?? '').trim();
    if (!dates.has(date)) throw new Error(`${n}. değişiklik: ${date || 'tarih yok'} değiştirilemez (yalnızca ${[...dates][0]} – ${[...dates].pop()}).`);
    const type = String(c.type ?? c.tur ?? '').toLowerCase();
    if (type === 'day' || type === 'gun' || type === 'gün') {
      const plan = String(c.plan ?? '').toLowerCase();
      if (!DAY_PLAN_TYPES.includes(plan)) throw new Error(`${n}. değişiklik: "${plan}" geçerli bir gün türü değil (${DAY_PLAN_TYPES.join(', ')}).`);
      return { type: 'day', date, plan };
    }
    if (type === 'meal' || type === 'ogun' || type === 'öğün') {
      if (!mealplan?.days) throw new Error('Yemek planı olmadığı için öğün değiştirilemez.');
      const slot = String(c.slot ?? '');
      if (!SLOTS.includes(slot)) throw new Error(`${n}. değişiklik: "${slot}" geçerli bir öğün değil (${SLOTS.join(', ')}).`);
      const v = c.meal ?? c.ogun ?? null;
      if (v === null || v === '') return { type: 'meal', date, slot, meal: null };
      const meal = String(v);
      if (meal === OUT || OUT_OPTIONS[meal]) return { type: 'meal', date, slot, meal };
      if (!allowedMeals.has(meal)) {
        const known = mealById(meal, mealplan);
        throw new Error(known
          ? `${n}. değişiklik: "${known.name}" bu haftanın alışveriş listesinde olmayan malzeme gerektiriyor; yeni malzeme alınmayacak.`
          : `${n}. değişiklik: "${meal}" adlı öğün yok.`);
      }
      return { type: 'meal', date, slot, meal };
    }
    throw new Error(`${n}. değişiklik: tür "day" ya da "meal" olmalı.`);
  });
  const note = obj.note ?? obj.not ?? '';
  return { note: typeof note === 'string' ? note.slice(0, 500) : '', changes };
}

function mealsSection(state, today) {
  const plan = state.mealplan;
  const prefs = { ...defaultPrefs(), ...(plan?.prefs ?? {}) };
  const days = (list) => (list?.length ? list.map((i) => WEEKDAYS[i]).join(', ') : 'yok');
  let marked = 0;
  let out = 0;
  for (let i = 0; i < 7; i++) {
    for (const m of Object.values(state.daily[addDays(today, -i)]?.meals ?? {})) {
      marked++;
      if (m?.place === 'out') out++;
    }
  }
  return [
    '- Kahvaltı yapmıyorum; günde 2 öğün + ara öğün. İlk öğün öğlen (evdeysem kahvaltı tipi), akşam karışık (ev/paket/dışarı).',
    `- Öğleni dışarıda yediğim günler: ${days(prefs.lunchOutDays)}; akşamı dışarıda/paket: ${days(prefs.dinnerOutDays)}.`,
    `- Mutfak: ${prefs.tools.map((t) => TOOLS[t] ?? t).join(', ') || 'yok'}. Yemek yapmayı sevmiyorum; eksik malzeme, bozulan ürün ve bulaşık sorun oluyor. Besin kısıtlamam yok.`,
    plan?.days ? `- Son 7 günde uygulamada işaretlenen öğün: ${marked} (dışarıda: ${out}).` : '- Henüz uygulamada yemek planı yok.',
  ].join('\n');
}

function mealLibraryText() {
  const home = Object.values(MEALS).map((m) => `${m.id} (${m.name}, ~${mealNutrition(m).mid} g)`).join('; ');
  const out = Object.values(OUT_OPTIONS).map((o) => `${o.id} (${o.name}, ~${mealNutrition(o).mid} g)`).join('; ');
  return { home, out };
}

const n = (v, d = 1, unit = '') => (v == null ? '–' : `${fmtNum(v, d)}${unit}`);

function profileSection(p, today) {
  if (!p) return 'Profil: girilmemiş.';
  const age = p.birthYear ? ageFromBirthYear(p.birthYear, new Date(today)) : null;
  return [
    `- ${p.sex === 'female' ? 'Kadın' : 'Erkek'}, ${age ?? '?'} yaş, boy ${n(p.heightCm, 0, ' cm')}, başlangıç kilosu ${n(p.weightKg, 1, ' kg')}`,
    `- Hedef: yağ kaybı + kas kazanımı (fit görünüm), haftada ${n(p.lossMinKg)}–${n(p.lossMaxKg)} kg kayıp`,
    `- Günlük hedef: ${n(p.kcalMin, 0)}–${n(p.kcalMax, 0)} kcal (alt sınır ${n(p.kcalFloor, 0)} kcal), protein ${p.proteinMin}–${p.proteinMax} g`,
    '- Masa başı iş, akşamları ~1 saat yürüyüş, sosyal spor olarak padel; ev antrenmanı',
  ].join('\n');
}

function programSection(settings, startKey, today) {
  const week = Math.max(1, programWeek(startKey, today));
  const { block, weekInBlock } = blockOf(week);
  const prog = programFor(settings);
  const day = (d) => prog[d].map((it) => `  - ${EX[it.ex]?.name ?? it.ex}: ${targetText(it, plannedSets(it, week))}`).join('\n');
  const schedule = settings.schedule.map((t, i) => `${WEEKDAYS[i]}: ${DAY_TYPES[t]?.label ?? t}`).join(', ');
  return [
    `- Dönem: ${PHASES[settings.phase]?.label} · Program haftası ${week} (blok ${block}, ${weekInBlock}/4)${prog.custom ? ' · şu an yapay zekâ önerisi özel program kullanılıyor' : ''}`,
    `- Takvim: ${schedule}`,
    `- Gün A:\n${day('A')}`,
    `- Gün B:\n${day('B')}`,
    '- Kurallar: setler RIR 1–3 ile biter; 2 seans üst üste tüm setlerde üst sınır → zorlaştır.',
  ].join('\n');
}

function weeksSection(state, today, weeks = 4) {
  const cur = weekStart(today);
  const rows = weeklySessions(state.workouts, state.padel, today, weeks).map((r) => {
    const end = addDays(r.week, 6);
    const waist = state.measurements.filter((m) => m.waistCm != null && m.date >= r.week && m.date <= end).map((m) => m.waistCm);
    return `| ${fmtDate(r.week)}${r.week === cur ? ' (bu hafta)' : ''} | ${n(avg(valuesInRange(state.daily, 'weight', r.week, end)))} | ${n(waist.length ? waist[waist.length - 1] : null)} | ${r.strength} | ${r.padel} | ${n(avg(valuesInRange(state.daily, 'sleepH', r.week, end)))} | ${n(avg(valuesInRange(state.daily, 'proteinG', r.week, end)), 0)} | ${n(avg(valuesInRange(state.daily, 'steps', r.week, end)), 0)} |`;
  });
  const all = weeklyAverages(state.daily, 'weight');
  const first = all[0];
  return [
    '| Hafta | Kilo ort. | Bel (cm) | Kuvvet | Padel | Uyku (sa) | Protein (g) | Adım |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    first ? `İlk tartı haftası ${fmtDate(first.week)}: ortalama ${n(first.avg)} kg.` : '',
  ].join('\n');
}

function exercisesSection(state) {
  const lines = [];
  for (const it of trackedItems(programFor(state.settings))) {
    const h = exerciseHistory(state.workouts, it.ex).slice(-3);
    if (!h.length) continue;
    const s = h.map((e) => {
      const load = [e.variant, resistanceText(e.resistance)].filter(Boolean).join(', ');
      const rir = e.sets.some((x) => x.rir != null) ? ` RIR ${e.sets.map((x) => x.rir ?? '–').join('/')}` : '';
      return `${fmtDate(e.date)}: ${e.sets.map((x) => x.reps).join('-')}${load ? ` (${load})` : ''}${rir}`;
    }).join('; ');
    lines.push(`- ${EX[it.ex].name} [hedef ${it.min}–${it.max}]: ${s}`);
  }
  return lines.length ? lines.join('\n') : 'Henüz kayıtlı antrenman yok.';
}

function padelSection(state, today) {
  const recent = state.padel.filter((p) => p.date >= addDays(today, -28));
  if (!recent.length) return 'Son 4 haftada padel yok.';
  return recent.map((p) => {
    const pain = (p.pain ?? []).map((k) => PAIN_AREAS[k]).filter(Boolean);
    return `- ${fmtDate(p.date)}: ${p.kind === 'match' ? 'maç' : 'ders'}, ${p.durationMin ?? '?'} dk, his ${p.feel ?? '–'}/5${pain.length ? `, ağrı: ${pain.join(', ')}` : ''}`;
  }).join('\n');
}

export function allowedExerciseList() {
  return Object.entries(EX).map(([id, e]) => `${id} (${e.name}${e.unit === 'sec' ? ', saniye' : e.unit === 'steps' ? ', adım' : ''})`).join(', ');
}

const SAFETY = [
  'Kurallar:',
  '- Türkçe, kısa ve uygulanabilir yaz; madde işaretleri kullan.',
  '- Sen hekim değilsin: ağrı, sakatlık ya da sağlık belirtisinde teşhis koyma; dinlenmeyi ve bir fizyoterapist/hekime danışmayı öner.',
  '- Kalori önerin alt sınırın altına inmesin; haftalık kilo kaybı vücut ağırlığının %1\'ini geçmesin.',
  '- Mevcut ekipmanla yapılabilecek hareketler öner; zorlaştırmayı küçük adımlarla yap.',
].join('\n');

/**
 * kind: 'review' | 'program' | 'meals' | 'day' | 'question'
 * ctx: { state, today, startKey, alerts, question }
 */
export function buildPrompt(kind, { state, today, startKey, alerts = [], question = '' }) {
  const task = {
    review: 'Görev: Son haftalarımı değerlendir. 1) Neler iyi gidiyor, 2) en önemli 2–3 sorun, 3) önümüzdeki hafta için 3 somut öneri (antrenman, beslenme, uyku). Kalori hedefimi değiştirmem gerekiyorsa gerekçesiyle söyle.',
    program: [
      'Görev: Verilerime göre önümüzdeki 4 haftalık blok için Gün A ve Gün B programını öner. Önce kısa gerekçeni yaz.',
      'Sonra programı uygulamaya aktarabilmem için en sonda TEK bir ```json kod bloğu ver. Kurallar:',
      '- Yalnızca geçerli JSON: çift tırnak, yorum yok, sondaki virgül yok, "..." gibi kısaltma yok.',
      '- Alanlar: "phase", "note", "A", "B". A ve B listelerindeki her öğe: "ex" (kimlik), "sets" (sayı), "min" (sayı), "max" (sayı), isteğe bağlı "prep": true.',
      `- "ex" yalnızca şu kimliklerden biri olabilir (adını değil kimliğini yaz): ${allowedExerciseList()}`,
      '- Her gün 4–9 hareket; sets 1–5; min ≤ max; süreli hareketlerde min/max saniyedir.',
      `- Şu anki dönem "${state.settings.phase}"; ekipmanım değişmediyse aynı dönemi kullan.`,
      'Şu anki programım bu biçimde (örnek olarak kullan, değiştirerek ver):',
      '```json',
      JSON.stringify({ phase: state.settings.phase, note: 'kısa açıklama', ...(() => { const p = programFor(state.settings); return { A: p.A.map(({ ex, sets, min, max, prep }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}) })), B: p.B.map(({ ex, sets, min, max, prep }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}) })) }; })() }),
      '```',
    ].join('\n'),
    meals: (() => {
      const p = state.profile ?? {};
      const lib = mealLibraryText();
      const days = state.mealplan?.days ?? buildDefaultPlan({ ...defaultPrefs(), ...(state.mealplan?.prefs ?? {}) }, p);
      return [
        'Görev: Bana 7 günlük (Pazartesi → Pazar) yemek planı hazırla. Önce kısa bir açıklama yaz.',
        `- Her gün protein en az ${p.proteinMin ?? 120} g (hedef ${p.proteinMin ?? 120}–${p.proteinMax ?? 140} g). Günlük kalori ortalama ${fmtNum(p.kcalMin ?? 2000, 0)}–${fmtNum(p.kcalMax ?? 2200, 0)} kcal civarında olsun, çok düşük kalmasın.`,
        '- Ev öğünleri en fazla 10 dk aktif hazırlık ve en fazla 2 bulaşık; mutfaktaki aletlerimi kullan.',
        '- Kısa ömürlü taze malzemeyi (yeşillik, lor, hindi füme, muz) 3–4 gün içinde kullanacak şekilde planla; dondurulmuş, konserve ve uzun ömürlüleri tercih et; aynı malzemeyi birkaç öğünde kullan.',
        '- Dışarıda yediğim öğünler için "out" yaz ya da aşağıdaki dışarıda seçeneklerinden birinin kimliğini ver.',
        'En sonda TEK bir ```json bloğu ver. Kurallar:',
        '- Yalnızca geçerli JSON: çift tırnak, yorum yok, sondaki virgül yok.',
        '- "days": tam 7 öğe (Pazartesi → Pazar); her öğe {"first", "dinner", "snack1", "snack2"}. Değer: hazır öğün kimliği, "meals" içinde tanımladığın öğünün "id"si, "out" ya da null.',
        '- "meals" (isteğe bağlı, kendi öğünlerin): [{"id", "name", "slot": "first|dinner|snack", "protein": sayı, "kcal": sayı, "minutes": sayı, "steps": ["..."], "ingredients": [{"name", "qty": sayı, "unit": "g|ml|adet"}]}]',
        `- Hazır öğün kimlikleri: ${lib.home}`,
        `- Dışarıda seçenek kimlikleri: ${lib.out}`,
        'Şu anki planım bu biçimde (örnek olarak kullan, değiştirerek ver):',
        '```json',
        JSON.stringify({ note: 'kısa açıklama', days, meals: [] }),
        '```',
      ].join('\n');
    })(),
    day: dayTask(state, today),
    question: `Sorum: ${question.trim() || '(buraya sorunu yaz)'}`,
  }[kind];

  return [
    'Kişisel spor koçum gibi davranmanı istiyorum. Aşağıda spor takip uygulamamdan aldığım güncel verilerim var.',
    '',
    `## Profil\n${profileSection(state.profile, today)}`,
    '',
    `## Program\n${programSection(state.settings, startKey, today)}`,
    '',
    `## Son 4 hafta\n${weeksSection(state, today)}`,
    '',
    `## Hareketler (son 3 seans)\n${exercisesSection(state)}`,
    '',
    `## Padel\n${padelSection(state, today)}`,
    '',
    `## Yemek düzeni\n${mealsSection(state, today)}`,
    '',
    ...(kind === 'day' ? [`## Bugün\n${todaySection(state, today)}`, '', `## Haftanın kalanı (plan)\n${restOfWeekSection(state, today)}`, ''] : []),
    `## Uygulamanın uyarıları\n${alerts.length ? alerts.map((a) => `- ${a.title}`).join('\n') : '- Yok'}`,
    '',
    SAFETY,
    '',
    task,
    '',
    `(Tarih: ${fmtDate(today, { day: 'numeric', month: 'long', year: 'numeric' })})`,
  ].join('\n');
}

/** Yapay zekânın cevabındaki JSON programı okur ve doğrular. Hata varsa Türkçe mesajla fırlatır. */
export function parseProgram(text) {
  const { found, obj: raw } = extractJson(text, (o) => o != null && typeof o === 'object' && !Array.isArray(o));
  if (!found) throw new Error('Metinde program bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  if (!raw) throw new Error('Program okunamadı: JSON bozuk. Yapay zekâya "Programı yalnızca geçerli JSON olarak, tek bir ```json bloğunda tekrar ver" yaz.');
  const obj = unwrap(raw);

  const phase = obj.phase ?? obj.donem ?? obj['dönem'] ?? null;
  if (phase != null && !PHASES[phase]) throw new Error(`Bilinmeyen dönem: "${phase}". bodyweight, band ya da dumbbell olmalı.`);
  const A = pickDay(obj, 'A');
  const B = pickDay(obj, 'B');
  if (!A || !B) throw new Error('Programda Gün A ve Gün B listeleri bulunamadı ("A": [...], "B": [...]).');
  const note = obj.note ?? obj.not ?? obj['açıklama'] ?? '';
  return { phase, note: typeof note === 'string' ? note.slice(0, 500) : '', A: parseDay(A, 'A'), B: parseDay(B, 'B') };
}

function unwrap(obj) {
  for (const k of ['program', 'plan', 'block', 'blok']) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) return { ...obj[k], note: obj[k].note ?? obj.note, phase: obj[k].phase ?? obj.phase };
  }
  return obj;
}

function pickDay(obj, d) {
  const keys = [d, d.toLowerCase(), `day${d}`, `day_${d}`, `gun${d}`, `gün${d}`, `Gün ${d}`, `gun_${d}`, `Day ${d}`];
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k];
  const days = obj.days ?? obj.gunler ?? obj['günler'];
  if (days && Array.isArray(days[d] ?? days[d.toLowerCase()])) return days[d] ?? days[d.toLowerCase()];
  return null;
}

const norm = (t) => String(t ?? '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, ' ').trim();

/** Kimlik ya da adla hareketi bulur ("band_squat", "Bantlı squat", "bantli squat"). */
function findExercise(it) {
  const raw = it.ex ?? it.id ?? it.exercise ?? it.hareket ?? it.name ?? it.ad;
  if (raw && EX[raw]) return raw;
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (EX[key]) return key;
  const n = norm(raw);
  const ascii = (t) => t.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  for (const [id, e] of Object.entries(EX)) {
    const en = norm(e.name);
    if (en === n || ascii(en) === ascii(n) || norm(e.name.split('(')[0]) === n) return id;
  }
  return null;
}

function parseDay(list, name) {
  if (list.length < 1 || list.length > 12) throw new Error(`Gün ${name}: 1–12 hareket olmalı.`);
  return list.map((it, i) => {
    const id = it && typeof it === 'object' ? findExercise(it) : null;
    if (!id) throw new Error(`Gün ${name}, ${i + 1}. hareket: "${it?.ex ?? it?.name ?? it}" uygulamada yok.`);
    let min = it.min;
    let max = it.max;
    const reps = it.reps ?? it.tekrar ?? it.range;
    if ((min == null || max == null) && reps != null) {
      const m = String(reps).match(/(\d+)\s*(?:[-–—]|to|ile)?\s*(\d+)?/);
      if (m) { min = min ?? m[1]; max = max ?? m[2] ?? m[1]; }
    }
    let lo = Math.round(Number(min));
    let hi = Math.round(Number(max ?? min));
    if (lo > hi) [lo, hi] = [hi, lo];
    const sets = Math.round(Number(it.sets ?? it.set));
    if (!Number.isFinite(sets) || sets < 1 || sets > 5) throw new Error(`Gün ${name}, ${EX[id].name}: set sayısı 1–5 olmalı.`);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 1 || hi > 120) throw new Error(`Gün ${name}, ${EX[id].name}: tekrar aralığı hatalı.`);
    return { ex: id, sets, min: lo, max: hi, ...(it.prep ? { prep: true } : {}) };
  });
}
