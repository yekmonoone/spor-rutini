// 3. aşama (kopyala-yapıştır modu): verilerden yapay zekâ için hazır mesaj üretir ve
// yapay zekânın önerdiği programı okur. Ağ isteği yok; mesajı kullanıcı kendisi kopyalar.
// Saf fonksiyonlar — testlerde de kullanılır.
import { EX, PHASES, DAY_TYPES, programFor, programWeek, blockOf, targetText, plannedSets, resistanceText, isAvailable, normalizePairs } from './program.js';
import { weeklyAverages, weeklySessions, exerciseHistory, trackedItems, valuesInRange } from './stats.js';
import { ageFromBirthYear, effectiveTargets, inMaintenance } from './targets.js';
import { IFTHEN_TRIGGERS, normalizeIfThen } from './ifthen.js';
import { addDays, avg, daysBetween, fmtDate, fmtNum, weekStart, weekday, WEEKDAYS } from './util.js';
import { PAIN_AREAS } from './rules.js';
import { extractJson } from './extract-json.js';
import { MEALS, OUT_OPTIONS, TOOLS, EAT_OUT_RULES } from './foods.js';
import { defaultPrefs, buildDefaultPlan, mealNutrition, dayFor, mealById, mealsWithoutNewGroceries, OUT, SLOTS, SLOT_LABELS } from './mealplan.js';
import { dayPlanFor } from './program.js';
import { isStrength, testHistory, compareTests } from './stats.js';

const EFFORT_TR = { easy: 'kolay', good: 'iyi', hard: 'çok zor' };
const painText = (r) => (r.pain ?? []).map((k) => PAIN_AREAS[k]).filter(Boolean).join(', ');

export const AI_TARGETS = {
  claude: { label: 'Claude', url: 'https://claude.ai/new' },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/app' },
  other: { label: 'Diğer (yalnızca kopyala)', url: null },
};

/** Asistan türleri (sıra = ekrandaki sıra). input: serbest metin alanı gerekiyorsa yer tutucusu. */
export const PROMPT_KINDS = {
  review: { label: 'Haftayı değerlendir', icon: '📋', desc: 'İyi gidenler, sorunlar ve bu haftanın 3 odağı; gerekirse kaloriyi ve planlarını günceller.' },
  day: { label: 'Gün sonu', icon: '🌙', desc: 'Plandan saptıysan haftanın kalanına en fazla 3 küçük değişiklik (yeni malzeme ve ekipman yok).' },
  eatout: { label: 'Dışarıda ne yesem?', icon: '🍽️', desc: 'Mekâna ya da menüye göre 2 seçenek ve porsiyon; seçtiğini tek dokunuşla kaydedersin.', input: 'Mekân / menü (isteğe bağlı): ör. "kebapçı" ya da menüden birkaç satır. Menü fotoğrafını sohbete de ekleyebilirsin.' },
  program: { label: 'Yeni program', icon: '🗓️', desc: 'Verilerine göre 4 haftalık A/B programı; uygulamaya aktarılır.' },
  meals: { label: 'Yemek planı', icon: '🥗', desc: '7 günlük plan ve alışveriş listesi; uygulamaya aktarılır.' },
  question: { label: 'Serbest soru', icon: '💬', desc: 'Aklındaki herhangi bir soru; verilerinle birlikte sorulur.', input: 'Örn: Bu hafta dizim ağrıdı, B gününde neyi değiştirmeliyim?' },
};

/**
 * Her türe yalnızca gereken bölümler gider (daha kısa mesaj, daha az kişisel veri).
 * 'coach' (önceki öneriler) ve 'padel' yalnızca veri varsa eklenir.
 */
const SECTIONS = {
  review: ['profile', 'program', 'weeks', 'exercises', 'padel', 'feedback', 'meals', 'coach', 'alerts'],
  program: ['profile', 'program', 'weeks', 'exercises', 'padel', 'feedback', 'coach', 'alerts'],
  meals: ['profile', 'weeks', 'meals', 'coach', 'alerts'],
  day: ['profile', 'program', 'weeks', 'feedback', 'meals', 'coach', 'today', 'rest', 'alerts'],
  eatout: ['profile', 'todayFood'],
  question: ['profile', 'program', 'weeks', 'exercises', 'padel', 'feedback', 'meals', 'coach', 'alerts'],
};

export const SECTION_LABELS = {
  profile: 'profil ve hedefler', program: 'program', weeks: 'son 4 hafta', exercises: 'hareket geçmişi', padel: 'padel',
  feedback: 'geri bildirim ve testler', meals: 'yemek düzeni', coach: 'önceki öneriler', today: 'bugün', rest: 'haftanın kalanı',
  todayFood: 'bugün yediklerin', alerts: 'uyarılar',
};

/* ---------- Koç notları ve haftalık odak (kopyala-yapıştır modunda yapay zekânın "hafızası") ---------- */

export const MAX_COACH_NOTES = 8;
export const MAX_FOCUS = 3;

/** Cevaptan ```json bloklarını çıkarıp okunur metni bırakır (en fazla 2000 karakter). */
export function answerText(text) {
  return String(text ?? '').replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

export function addCoachNote(notes, { date, kind, text }) {
  const t = answerText(text);
  if (!t) return notes ?? [];
  return [...(notes ?? []), { id: `${date}-${Math.random().toString(36).slice(2, 8)}`, date, kind, text: t }].slice(-MAX_COACH_NOTES);
}

/** Son 8 gün içinde kaydedilmiş haftalık odak (yoksa null). */
export function currentFocus(meta, today) {
  const f = meta?.weeklyFocus;
  if (!f?.items?.length || !f.date) return null;
  const age = daysBetween(f.date, today);
  return age >= 0 && age <= 8 ? f : null;
}

function coachSection(state, today) {
  const lines = [];
  const f = state.meta?.weeklyFocus;
  if (f?.items?.length) lines.push(`- ${fmtDate(f.date)} tarihinde belirlediğimiz haftalık odak: ${f.items.join('; ')}`);
  const last = (state.meta?.coachNotes ?? []).filter((x) => x.date <= today).slice(-1)[0];
  if (last) {
    const short = last.text.replace(/\s+/g, ' ');
    lines.push(`- Son kaydettiğim öneri (${fmtDate(last.date)}, ${PROMPT_KINDS[last.kind]?.label ?? 'not'}): ${short.slice(0, 300)}${short.length > 300 ? '…' : ''}`);
  }
  return lines.join('\n');
}

function todayFoodSection(state, today) {
  const r = state.daily[today] ?? {};
  const p = effectiveTargets(state.profile, state.settings, today) ?? {};
  const eaten = Object.values(r.meals ?? {}).map((m) => `${m.name} ~${m.protein} g`);
  const protein = r.proteinG ?? 0;
  const need = p.proteinMin ? Math.max(0, p.proteinMin - protein) : null;
  return [
    `- Bugün yediklerim: ${eaten.length ? eaten.join('; ') : 'henüz kayıt yok'} (toplam ~${protein} g protein).`,
    `- Günlük hedef: protein ${p.proteinMin ?? '?'}–${p.proteinMax ?? '?'} g, kalori ${n(p.kcalMin, 0)}–${n(p.kcalMax, 0)} kcal.${need != null ? ` Kalan protein ~${need} g.` : ''}`,
    `- Dışarıda yeme kurallarım: ${EAT_OUT_RULES.join(' ')}`,
  ].join('\n');
}

/** Bu türde mesaja girecek bölümler (veri olmayan isteğe bağlı bölümler çıkarılır). */
export function promptSections(kind, state, today) {
  return (SECTIONS[kind] ?? SECTIONS.question).filter((s) => {
    if (s === 'coach') return !!coachSection(state, today);
    if (s === 'padel') return state.padel.some((p) => p.date >= addDays(today, -28));
    return true;
  });
}

/** Haftalık değerlendirme cevabı: { focus[], kcal (-150|0|150), kcalNote, ifThen|null }. */
export function parseWeeklyReview(text, { settings = null, today = null } = {}) {
  const { found, obj } = extractJson(text, (o) => o != null && typeof o === 'object' && !Array.isArray(o) && ('focus' in o || 'odak' in o));
  if (!found || !obj) throw new Error('Cevapta haftalık odak listesi bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  const raw = obj.focus ?? obj.odak;
  const focus = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x ?? '').trim().slice(0, 120)).filter(Boolean).slice(0, MAX_FOCUS);
  if (!focus.length) throw new Error('Odak listesi boş. Yapay zekâdan en fazla 3 kısa odak maddesi iste.');
  let kcal = Number(obj.kcal ?? obj.kalori ?? 0);
  if (!Number.isFinite(kcal) || Math.abs(kcal) < 75) kcal = 0;
  else kcal = Math.sign(kcal) * 150; // en fazla ±150 kcal adım
  let kcalNote = '';
  if (kcal !== 0 && today && inMaintenance(settings, today)) {
    kcal = 0;
    kcalNote = 'Bakım dönemindesin; kalori değişikliği uygulanmayacak.';
  }
  const ifRaw = obj.ifThen ?? obj.ifthen ?? obj.plans ?? null;
  const ifThen = Array.isArray(ifRaw) && ifRaw.length ? normalizeIfThen(ifRaw) : null;
  return { focus, kcal, kcalNote, ifThen: ifThen?.length ? ifThen : null };
}

/** "Dışarıda ne yesem?" cevabı: { options: [{ name, protein, kcal|null }] } (en fazla 3). */
export function parseEatOut(text) {
  const { found, obj } = extractJson(text, (o) => o != null && typeof o === 'object' && !Array.isArray(o) && ('options' in o || 'secenekler' in o));
  if (!found || !obj) throw new Error('Cevapta seçenek listesi bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  const list = obj.options ?? obj.secenekler;
  if (!Array.isArray(list)) throw new Error('"options" bir liste olmalı.');
  const options = list.slice(0, 3).map((o) => {
    const kcal = Math.round(Number(o?.kcal ?? o?.kalori));
    return {
      name: String(o?.name ?? o?.ad ?? '').trim().slice(0, 60),
      protein: Math.round(Number(o?.protein)),
      kcal: Number.isFinite(kcal) && kcal > 0 && kcal <= 3000 ? kcal : null,
    };
  }).filter((o) => o.name && Number.isFinite(o.protein) && o.protein >= 0 && o.protein <= 150);
  if (!options.length) throw new Error('Seçeneklerde ad ve protein (0–150 g) olmalı.');
  return { options };
}

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
  const wFb = w ? [EFFORT_TR[w.effort] ? `zorluk: ${EFFORT_TR[w.effort]}` : null, painText(w) ? `ağrı: ${painText(w)}` : null].filter(Boolean).join(', ') : '';
  const workout = w ? `yapıldı (Gün ${w.day}${w.short ? ', kısa' : ''}${wFb ? `; ${wFb}` : ''})` : r.workoutSkipped ? 'yapılamadı' : 'kaydedilmedi';
  const eaten = Object.entries(r.meals ?? {}).map(([slot, m]) => `${SLOT_LABELS[slot] ?? 'Ek'}: ${m.name}${m.free ? ' (plan dışı)' : ''} ~${m.protein} g`);
  const p = effectiveTargets(state.profile, state.settings, today) ?? {};
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
    ...(settings.equipmentNote?.trim() ? [`- Ekipman: ${settings.equipmentNote.trim()} — öneriler yalnızca bununla yapılabilmeli (yeni ekipman gerektirmesin).`] : []),
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

/** Son antrenmanların zorluk/ağrı geri bildirimi, güç testleri ve eğer–o zaman planları. */
function feedbackSection(state, today) {
  const lines = [];
  const recent = state.workouts.filter((w) => isStrength(w) && w.date >= addDays(today, -21)).slice(-6);
  const fb = recent.filter((w) => w.effort || (w.pain ?? []).length)
    .map((w) => `${fmtDate(w.date)} Gün ${w.day}: ${[EFFORT_TR[w.effort], painText(w) ? `ağrı: ${painText(w)}` : null].filter(Boolean).join(', ')}`);
  lines.push(`- Antrenman sonrası his: ${fb.length ? fb.join('; ') : 'kayıt yok'}`);
  const wins = recent.flatMap((w) => w.improvements ?? []);
  if (wins.length) lines.push(`- Son 3 haftadaki ilerlemeler (geçen sefere göre): ${wins.slice(-8).join('; ')}`);
  const tests = testHistory(state.measurements);
  if (tests.length) {
    const last = tests[tests.length - 1];
    const parts = [
      last.pushupReps != null ? `şınav (${last.pushupLevel ?? '?'}) ${last.pushupReps}` : null,
      last.plankSec != null ? `plank ${last.plankSec} sn` : null,
      last.squat60 != null ? `1 dk squat ${last.squat60}` : null,
    ].filter(Boolean);
    lines.push(`- Son güç testi (${fmtDate(last.date)}): ${parts.join(', ')}`);
    if (tests.length > 1) lines.push(`- İlk testten bu yana: ${compareTests(tests[0], last).join('; ')}`);
  }
  if (inMaintenance(state.settings, today)) lines.push(`- Şu an bakım (diyet arası) dönemindeyim: ${fmtDate(state.settings.maintenanceUntil)} tarihine kadar tahmini harcama kadar yiyorum.`);
  const plans = (state.settings.ifThen ?? []).map((x) => `"${IFTHEN_TRIGGERS[x.trigger]?.when ?? x.trigger}" → ${x.text}`);
  if (plans.length) lines.push(`- Eğer–o zaman planlarım: ${plans.join('; ')}`);
  return lines.join('\n');
}

function padelSection(state, today) {
  const recent = state.padel.filter((p) => p.date >= addDays(today, -28));
  if (!recent.length) return 'Son 4 haftada padel yok.';
  return recent.map((p) => {
    const pain = (p.pain ?? []).map((k) => PAIN_AREAS[k]).filter(Boolean);
    return `- ${fmtDate(p.date)}: ${p.kind === 'match' ? 'maç' : 'ders'}, ${p.durationMin ?? '?'} dk, his ${p.feel ?? '–'}/5${pain.length ? `, ağrı: ${pain.join(', ')}` : ''}`;
  }).join('\n');
}

/** Dönemde bulunmayan ekipmanı gerektiren hareketler (dambıl dönemi bant gerektirmez; ekipmansızda ikisi de yok). */
export function unavailableExercises(phase) {
  return Object.keys(EX).filter((id) => !isAvailable(id, phase));
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
  const maint = inMaintenance(state.settings, today);
  const task = {
    review: [
      'Görev: Son haftalarımı değerlendir: 1) neler iyi gidiyor, 2) en önemli 2–3 sorun, 3) bu hafta için en fazla 3 somut ve ölçülebilir odak (antrenman, beslenme, uyku, adım). "Önceki öneriler" bölümü varsa o odakları tutup tutmadığımı verilerle kısaca değerlendir.',
      `- Kalori hedefimi yalnızca 2–3 haftalık kilo trendi gerektiriyorsa değiştir: -150, 0 ya da 150 kcal; alt sınırın altına inme.${maint ? ' Şu an bakım dönemindeyim: 0 olmalı.' : ''}`,
      '- İstersen eğer–o zaman planlarımı güncelle (en fazla 3). Tetikleyiciler: busy = vakit yok, eatout = dışarıda yemek, craving = canım fast food/tatlı çekti, nowalk = yürüyüş olmadı, padelcancel = padel iptal. Yeni malzeme ya da ekipman gerektirmesin.',
      'En sonda TEK bir ```json bloğu ver (uygulama okuyup Bugün ekranında gösterir; geçerli JSON, çift tırnak):',
      '```json',
      JSON.stringify({ focus: ['Her gün en az 140 g protein', 'Pazartesi, Çarşamba, Perşembe kuvvet', 'Her gün 7.500+ adım'], kcal: 0, ifThen: [{ trigger: 'busy', text: '20 dakikalık kısa antrenmanı yaparım.' }] }),
      '```',
      '- "focus": en fazla 3 madde, her biri en fazla 100 karakter. "ifThen" isteğe bağlı; değiştirmeyeceksen yazma.',
    ].join('\n'),
    eatout: [
      `Görev: Şimdi dışarıda yemek yiyeceğim.${question.trim() ? ` Mekân / menü: ${question.trim()}` : ' Mekânı ya da menüyü aşağıya yazacağım veya fotoğrafını ekleyeceğim.'}`,
      '- 2 seçenek öner (en uygun + alternatif): ne sipariş edeyim, porsiyon / ekmek / pilav ne kadar, içecek ne olsun. Her biri için yaklaşık protein ve kalori yaz. Kısa tut.',
      '- Kalan protein ihtiyacımı bu öğünde mümkün olduğunca karşıla; günlük kalori hedefimi aşma.',
      '- Canım belli bir şey çekiyorsa (ör. çiğköfte, pizza) yasaklama: makul porsiyonu ve yanına ne ekleyeceğimi söyle.',
      'En sonda TEK bir ```json bloğu ver (uygulama "Yedim" olarak kaydedebilsin; geçerli JSON):',
      '```json',
      JSON.stringify({ options: [{ name: 'Tavuk şiş + salata + ayran', protein: 45, kcal: 650 }, { name: 'Yarım ekmek köfte + söğüş', protein: 35, kcal: 600 }] }),
      '```',
      '- En fazla 2 seçenek; "name" en fazla 60 karakter; protein gram, kcal yaklaşık.',
    ].join('\n'),
    program: [
      'Görev: Verilerime göre önümüzdeki 4 haftalık blok için Gün A ve Gün B programını öner. Önce kısa gerekçeni yaz.',
      'Sonra programı uygulamaya aktarabilmem için en sonda TEK bir ```json kod bloğu ver. Kurallar:',
      '- Yalnızca geçerli JSON: çift tırnak, yorum yok, sondaki virgül yok, "..." gibi kısaltma yok.',
      '- Alanlar: "phase", "note", "A", "B". A ve B listelerindeki her öğe: "ex" (kimlik), "sets" (sayı), "min" (sayı), "max" (sayı), isteğe bağlı "prep": true, isteğe bağlı "pair": süperset numarası (aynı numaralı TAM İKİ hareket yan yana; birbirine rakip olmayan kaslar, ör. bacak + itiş). Seans 35–40 dakikayı geçmesin.',
      `- "ex" yalnızca şu kimliklerden biri olabilir (adını değil kimliğini yaz): ${allowedExerciseList()}`,
      '- Her gün 4–9 hareket; sets 1–5; min ≤ max; süreli hareketlerde min/max saniyedir.',
      `- Şu anki dönem "${state.settings.phase}"; ekipmanım değişmediyse aynı dönemi kullan.`,
      ...(() => {
        const banned = unavailableExercises(state.settings.phase);
        return banned.length ? [`- Bu dönemde ekipmanım yok, şu kimlikleri kullanma: ${banned.join(', ')}`] : [];
      })(),
      'Şu anki programım bu biçimde (örnek olarak kullan, değiştirerek ver):',
      '```json',
      JSON.stringify({ phase: state.settings.phase, note: 'kısa açıklama', ...(() => { const p = programFor(state.settings); return { A: p.A.map(({ ex, sets, min, max, prep, pair }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}), ...(pair ? { pair } : {}) })), B: p.B.map(({ ex, sets, min, max, prep, pair }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}), ...(pair ? { pair } : {}) })) }; })() }),
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

  const render = {
    profile: () => `## Profil\n${profileSection(effectiveTargets(state.profile, state.settings, today) ?? state.profile, today)}`,
    program: () => `## Program\n${programSection(state.settings, startKey, today)}`,
    weeks: () => `## Son 4 hafta\n${weeksSection(state, today)}`,
    exercises: () => `## Hareketler (son 3 seans)\n${exercisesSection(state)}`,
    padel: () => `## Padel\n${padelSection(state, today)}`,
    feedback: () => `## Geri bildirim ve testler\n${feedbackSection(state, today)}`,
    meals: () => `## Yemek düzeni\n${mealsSection(state, today)}`,
    coach: () => `## Önceki öneriler\n${coachSection(state, today)}`,
    today: () => `## Bugün\n${todaySection(state, today)}`,
    rest: () => `## Haftanın kalanı (plan)\n${restOfWeekSection(state, today)}`,
    todayFood: () => `## Bugün\n${todayFoodSection(state, today)}`,
    alerts: () => `## Uygulamanın uyarıları\n${alerts.length ? alerts.map((a) => `- ${a.title}`).join('\n') : '- Yok'}`,
  };
  const intro = kind === 'eatout'
    ? 'Beslenme koçum gibi kısa ve pratik cevap ver. Aşağıda takip uygulamamdan güncel verilerim var.'
    : 'Kişisel spor koçum gibi davranmanı istiyorum. Aşağıda spor takip uygulamamdan aldığım güncel verilerim var.';
  return [
    intro,
    '',
    ...promptSections(kind, state, today).flatMap((s) => [render[s](), '']),
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
  return { phase, note: typeof note === 'string' ? note.slice(0, 500) : '', A: normalizePairs(parseDay(A, 'A')), B: normalizePairs(parseDay(B, 'B')) };
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
    const pair = Number(it.pair ?? it.superset ?? it.cift ?? it['çift']);
    return { ex: id, sets, min: lo, max: hi, ...(it.prep ? { prep: true } : {}), ...(Number.isInteger(pair) && pair > 0 ? { pair } : {}) };
  });
}
