// Program: dönemler (ekipmansız / bant / dambıl), A-B günleri, haftalık takvim ve hedef kuralları.
import { EX, ALTERNATIVES } from './exercises.js';
import { daysBetween, fmtNum } from './util.js';

export { EX };

// Önerilen yol: ekipmansız (ilk ~3 hafta: teknik + alışkanlık) → dambıl (dambıl seti + kapı barfiks barı + mat).
// Bant dönemi isteğe bağlı; dambıl programı bant gerektirmez.
export const PHASES = {
  bodyweight: { label: 'Ekipmansız', desc: 'Başlangıç: teknik ve alışkanlık' },
  dumbbell: { label: 'Dambıl', desc: 'Dambıl seti + kapı barfiks barı + mat' },
  band: { label: 'Bant + mat', desc: 'İsteğe bağlı: yalnızca bantla' },
};
export const PHASE_ORDER = ['bodyweight', 'dumbbell', 'band'];

export const BAND_LEVELS = ['Çok hafif', 'Hafif', 'Orta', 'Ağır', 'Çok ağır'];

const it = (ex, sets, min, max = min, extra = {}) => ({ ex, sets, min, max, ...extra });
const PREP = { prep: true };
/** Süperset çifti: aynı numaralı iki hareket sırayla yapılır, sonra dinlenilir (birbirine rakip olmayan kaslar). */
const P = (pair) => ({ pair });

// Haftalık set (3 seans, A/B dönüşümlü ≈ her gün 1,5×): göğüs, sırt, bacak, kalça ~9; omuz ön/yan/arka ayrı ayrı.
// Kaynaklar: Iversen 2021 (zaman verimli antrenman: süperset, kas başına haftada ≥4 set, 6–15 tekrar),
// Zhang/Weakley 2025 meta-analizi (süperset: benzer hacim, daha kısa seans; aynı kası çalıştıran çiftlerden kaçın).
// Padel hazırlığı (yana lunge, hafif squat jump) ısınmanın içinde; bilek ekstansiyonu dirsek koruması için ayrı hareket.
export const PROGRAMS = {
  bodyweight: {
    A: [it('squat', 3, 12, 15, P(1)), it('pushup', 3, 8, 12, P(1)), it('inverted_row', 3, 8, 12, P(2)), it('glute_bridge', 3, 12, 15, P(2)),
      it('plank', 3, 20, 45)],
    B: [it('reverse_lunge', 3, 8, 12, P(1)), it('wide_pushup', 3, 8, 12, P(1)), it('inverted_row', 3, 8, 12, P(2)), it('single_leg_bridge', 3, 8, 12, P(2)),
      it('side_plank', 2, 15, 30)],
  },
  band: {
    A: [it('band_squat', 3, 12, 15, P(1)), it('pushup', 3, 8, 12, P(1)), it('band_row', 3, 12, 15, P(2)), it('band_glute_bridge', 3, 12, 15, P(2)),
      it('plank', 3, 20, 45, P(3)), it('band_lateral_raise', 2, 15, 20, P(3))],
    B: [it('reverse_lunge', 3, 8, 12, P(1)), it('band_shoulder_press', 3, 10, 12, P(1)), it('band_pulldown', 3, 12, 15, P(2)), it('monster_walk', 3, 10, 10, P(2)),
      it('side_plank', 2, 15, 30, P(3)), it('band_face_pull', 2, 15, 15, P(3)), it('band_wrist_ext', 2, 15, 15)],
  },
  dumbbell: {
    A: [it('goblet_squat', 3, 8, 12, P(1)), it('db_row', 3, 8, 12, P(1)), it('db_rdl', 3, 8, 12, P(2)), it('pushup', 3, 8, 12, P(2)),
      it('db_lateral_raise', 2, 12, 15, P(3)), it('plank', 3, 30, 60, P(3))],
    B: [it('db_reverse_lunge', 3, 8, 12, P(1)), it('db_shoulder_press', 3, 8, 12, P(1)), it('db_glute_bridge', 3, 10, 15, P(2)), it('pullup', 3, 5, 10, P(2)),
      it('pushup', 3, 8, 12, P(3)), it('db_rear_delt_fly', 2, 12, 15, P(3)), it('side_plank', 2, 20, 40, P(4)), it('db_wrist_ext', 2, 15, 15, P(4))],
  },
};

/** Dönemde bulunmayan ekipman türleri (dambıl dönemi bant gerektirmez; ekipmansızda ikisi de yok). */
const MISSING_GEAR = { bodyweight: ['band', 'miniband', 'dumbbell'], dumbbell: ['band', 'miniband'] };
export function isAvailable(exId, phase) {
  const ex = EX[exId];
  return !!ex && !(MISSING_GEAR[phase] ?? []).includes(ex.resist);
}

/** O gün için değişim seçenekleri (ağrı / eksik ekipman): dönemde yapılabilenler. */
export function alternativesFor(exId, phase) {
  return (ALTERNATIVES[exId] ?? []).filter((id) => id !== exId && isAvailable(id, phase));
}

/**
 * Süperset çiftlerini doğrular: yalnızca yan yana, hazırlık olmayan TAM İKİ hareket çift sayılır; numaralar 1'den
 * yeniden verilir. Yapay zekâdan gelen programlar için.
 */
export function normalizePairs(items) {
  const out = items.map(({ pair, ...rest }) => rest);
  let n = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (a.pair == null || a.prep || b.prep || b.pair !== a.pair || items[i + 2]?.pair === a.pair || items[i - 1]?.pair === a.pair) continue;
    n++;
    out[i].pair = n;
    out[i + 1].pair = n;
    i++;
  }
  return out;
}

/** Süperset etiketleri: dizideki her hareket için '1a' / '1b' ya da null. */
export function pairLabels(list) {
  return list.map((e, i) => {
    if (e.pair == null) return null;
    if (list[i + 1]?.pair === e.pair) return `${e.pair}a`;
    if (list[i - 1]?.pair === e.pair) return `${e.pair}b`;
    return null;
  });
}

/** Süperset turu sonrası dinlenme: her kas yine ~2 dk dinlenir (eş hareketin seti + geçiş + bu süre). */
export const PAIR_TRANSITION_SEC = 20;
export const PREP_REST_SEC = 30;
export const pairRestSec = (restSec = 75) => Math.max(45, restSec - 30);

/**
 * Set bitince ne kadar dinlenilecek (aktif antrenman listesi üzerinde): süperset eşinin bu turda seti varsa kısa
 * geçiş, tur bitince kısaltılmış dinlenme, tek hareketlerde ayarlardaki süre.
 */
export function restAfterSet(exercises, idx, restSec = 75) {
  const e = exercises[idx];
  const doneOf = (x) => x.sets.filter((s) => s.done).length;
  const open = (i) => !!exercises[i] && exercises[i].sets.some((s) => !s.done);
  const labels = pairLabels(exercises);
  const partnerIdx = labels[idx]?.endsWith('a') ? idx + 1 : labels[idx]?.endsWith('b') ? idx - 1 : -1;
  const partner = partnerIdx >= 0 ? exercises[partnerIdx] : null;
  // Sıradaki hareket (ekran oraya kaydırılır): önce bu grup, sonra ilk yarım kalan hareket.
  const nextOpen = (from) => {
    for (let k = 0; k < exercises.length; k++) {
      const i = (from + k) % exercises.length;
      if (open(i)) return i;
    }
    return -1;
  };
  if (partner && doneOf(partner) < doneOf(e) && doneOf(partner) < partner.sets.length) {
    return { seconds: PAIR_TRANSITION_SEC, label: `Geçiş → ${partner.name}`, done: `Şimdi: ${partner.name}`, nextIdx: partnerIdx };
  }
  if (e.prep) return { seconds: PREP_REST_SEC, label: 'Dinlenme', done: 'Sıradaki set!', nextIdx: open(idx) ? idx : nextOpen(idx + 1) };
  if (partner) {
    const firstIdx = Math.min(idx, partnerIdx);
    const nextIdx = open(firstIdx) ? firstIdx : open(firstIdx + 1) ? firstIdx + 1 : nextOpen(firstIdx + 2);
    const nextName = exercises[nextIdx]?.name;
    return { seconds: pairRestSec(restSec), label: 'Tur bitti — dinlenme', done: nextName ? `Sıradaki: ${nextName}` : 'Sıradaki set!', nextIdx };
  }
  const nextIdx = open(idx) ? idx : nextOpen(idx + 1);
  return { seconds: restSec, label: 'Dinlenme', done: nextIdx === idx || nextIdx < 0 ? 'Dinlenme bitti — sıradaki set!' : `Sıradaki: ${exercises[nextIdx].name}`, nextIdx };
}

function workSec(item) {
  const ex = EX[item.ex];
  const per = ex?.unit === 'sec' ? item.max : (ex?.unit === 'steps' ? item.max * 2 : item.max * 3);
  return (per + 10) * (ex?.side ? 2 : 1);
}

/** Tahmini süre (dk, 5'e yuvarlı): ısınma + soğuma + setler + dinlenmeler. */
export function estimateMinutes(items, week = 2, restSec = 75) {
  let sec = 7 * 60;
  const main = items.filter((i) => !i.prep);
  const labels = pairLabels(main);
  for (let i = 0; i < main.length; i++) {
    const a = main[i];
    if (labels[i]?.endsWith('a')) {
      const b = main[i + 1];
      const rounds = Math.max(plannedSets(a, week), plannedSets(b, week));
      sec += rounds * (workSec(a) + workSec(b) + PAIR_TRANSITION_SEC + pairRestSec(restSec));
      i++;
    } else {
      sec += plannedSets(a, week) * (workSec(a) + restSec);
    }
  }
  for (const p of items.filter((i) => i.prep)) sec += plannedSets(p, week) * (workSec(p) + PREP_REST_SEC);
  return Math.max(10, Math.round(sec / 300) * 5);
}

/** Etkin program: yapay zekâdan aktarılmış özel program o dönem için varsa onu, yoksa varsayılanı döndürür. */
export function programFor(settings) {
  const phase = settings?.phase ?? 'bodyweight';
  const c = settings?.customProgram;
  if (c && c.phase === phase && Array.isArray(c.A) && Array.isArray(c.B)) return { A: c.A, B: c.B, custom: true, note: c.note ?? '' };
  return PROGRAMS[phase] ?? PROGRAMS.bodyweight;
}

export function warmupFor(phase) {
  const list = [
    'Yerinde yürüyüş veya hafif tempo — 1 dk',
    'Kol ve kalça çevirme — 30 sn',
    'Yarım squat — 10 tekrar',
    'Yana lunge — her taraf 6 (padel hazırlığı)',
    'Hafif squat jump — 6, yumuşak iniş (dizde rahatsızlık varsa atla)',
  ];
  if (phase === 'band') list.push('Bant ile dış rotasyon — 2 × 12');
  else if (phase === 'dumbbell') list.push('Yan yatarak dambılla dış rotasyon (1–2 kg) — her kol 2 × 12');
  return list;
}

export const COOLDOWN = 'Kalça fleksör esnetmesi — her taraf 2 × 30 sn';

export const DAY_TYPES = {
  strength: { label: 'Kuvvet + yürüyüş', short: 'Kuvvet', icon: '💪', tip: 'Akşam yürüyüşünden sonra yapabilirsin; yatmadan en az 2 saat önce bitir.' },
  brisk: { label: 'Tempolu yürüyüş', short: 'Tempolu', icon: '🚶', tip: 'Yürüyüşün 10–20 dakikasını tempolu yap: konuşabilirsin ama şarkı söyleyemezsin.' },
  walk: { label: 'Yürüyüş', short: 'Yürüyüş', icon: '🚶', tip: 'Normal akşam yürüyüşü. Günlük hedef 7.000+ adım.' },
  padel: { label: 'Padel', short: 'Padel', icon: '🎾', tip: 'Maç öncesi 5–10 dk ısın; ilk haftalarda 60 dakikayı geçme. Bugün yürüyüş şart değil.' },
  flex: { label: 'Kuvvet veya padel', short: 'Kuvvet/padel', icon: '🔀', tip: 'Padel varsa padel, yoksa kuvvet antrenmanı.' },
  rest: { label: 'Dinlenme / hafif yürüyüş', short: 'Dinlenme', icon: '😌', tip: 'Dinlen. İstersen hafif bir yürüyüş.' },
};

export const WEEKLY_STRENGTH_TARGET = 3;
export const WEEKLY_STRENGTH_MIN = 2;

export function programStartKey(settings, fallbackKey) {
  return settings?.programStart ?? fallbackKey ?? null;
}

/** 1'den başlayan program haftası; başlangıç ileri bir tarihteyse 0. */
export function programWeek(startKey, today) {
  if (!startKey) return 1;
  const d = daysBetween(startKey, today);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

export function blockOf(week) {
  const w = Math.max(1, week);
  return { block: Math.ceil(w / 4), weekInBlock: ((w - 1) % 4) + 1 };
}

/** İlk hafta 2 set, sonra programdaki set sayısı. */
export function plannedSets(item, week) {
  return week <= 1 ? Math.min(item.sets, 2) : item.sets;
}

export function rirTarget(week) {
  return week <= 2
    ? { min: 3, max: 4, label: 'RIR 3–4', hint: 'İlk iki hafta tekniğe odaklan: setleri "3–4 tekrar daha yapabilirdim" noktasında bitir.' }
    : { min: 1, max: 3, label: 'RIR 1–3', hint: 'Setleri "1–3 tekrar daha yapabilirdim" noktasında bitir — kas gelişimini asıl bu belirliyor.' };
}

/** Sıradaki kuvvet günü: son kuvvet antrenmanının tersi (ilk seferde A). */
export function nextStrengthDay(workouts) {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const d = workouts[i].day;
    if (d === 'A' || d === 'B') return d === 'A' ? 'B' : 'A';
  }
  return 'A';
}

export function sideText(ex) {
  return ex?.side ? `her ${ex.side}` : '';
}

export function unitSuffix(unit) {
  return unit === 'sec' ? ' sn' : unit === 'steps' ? ' adım' : '';
}

export function targetText(item, sets) {
  const ex = EX[item.ex];
  const range = item.min === item.max ? `${item.min}` : `${item.min}–${item.max}`;
  const side = ex.side ? ` · ${sideText(ex)}` : '';
  return `${sets} × ${range}${unitSuffix(ex.unit)}${side}`;
}

export function defaultResistance(ex) {
  if (ex.resist === 'band' || ex.resist === 'miniband') return { kind: ex.resist, level: 2 };
  if (ex.resist === 'dumbbell') return { kind: 'dumbbell', kg: null };
  return null;
}

export function resistanceText(r) {
  if (!r) return '';
  if (r.kind === 'dumbbell') return r.kg ? `${fmtNum(r.kg)} kg` : 'kg girilmedi';
  const lvl = BAND_LEVELS[(r.level ?? 2) - 1] ?? '';
  return `${lvl} ${r.kind === 'miniband' ? 'mini bant' : 'bant'}`;
}

/** Üst sınıra ulaşıldığında ne yapılacağı. */
export function progressionHint(exId, entry) {
  const ex = EX[exId];
  if (!ex) return '';
  if (ex.variants && entry?.variant) {
    const i = ex.variants.indexOf(entry.variant);
    if (i >= 0 && i < ex.variants.length - 1) {
      // Dambıllı harekette önce ağırlık; eldeki dambıl yetmeyince zor varyant (ör. Bulgar split squat).
      if (ex.resist === 'dumbbell') return `Dambılı 1–2,5 kg artır; elindeki ağırlık yetmiyorsa bir üst seviyeye geç: ${ex.variants[i + 1]}.`;
      return `Bir üst seviyeye geç: ${ex.variants[i + 1]}.`;
    }
  }
  const r = entry?.resistance;
  if (r && (r.kind === 'band' || r.kind === 'miniband')) {
    const lvl = r.level ?? 2;
    if (lvl < BAND_LEVELS.length) return `Bir üst bant direncine geç (${BAND_LEVELS[lvl]}).`;
    return 'En güçlü bantla üst sınırdasın: inişi 3–4 sn yap ya da dambıla geçmeyi düşün.';
  }
  if (r && r.kind === 'dumbbell') return 'Dambılı 1–2,5 kg artır.';
  return ex.harder ?? 'Hareketi zorlaştır: inişi 3–4 sn yap.';
}

/** O gün için takvimdeki plan. */
export function dayPlan(settings, weekdayIndex) {
  const type = settings?.schedule?.[weekdayIndex] ?? 'rest';
  return { type, ...(DAY_TYPES[type] ?? DAY_TYPES.rest) };
}

/** Tarihe göre plan: güne özel değişiklik (ör. gün sonu kontrolünde kaydırılan antrenman) varsa o geçerli. */
export function dayPlanFor(settings, date, weekdayIndex) {
  const o = settings?.scheduleOverrides?.[date];
  if (o && DAY_TYPES[o]) return { type: o, ...DAY_TYPES[o], override: true };
  return dayPlan(settings, weekdayIndex);
}

/** Kısa antrenman (~20 dk): günün ilk 4 ana hareketi, 2'şer set. */
export function shortItems(items) {
  return items.filter((i) => !i.prep).slice(0, 4).map((i) => ({ ...i, sets: 2 }));
}
