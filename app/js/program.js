// Program: dönemler (ekipmansız / bant / dambıl), A-B günleri, haftalık takvim ve hedef kuralları.
import { EX } from './exercises.js';
import { daysBetween, fmtNum } from './util.js';

export { EX };

export const PHASES = {
  bodyweight: { label: 'Ekipmansız', desc: 'Bant ve mat gelene kadar' },
  band: { label: 'Bant + mat', desc: 'Direnç bandı dönemi' },
  dumbbell: { label: 'Dambıl', desc: 'Bant yetmemeye başlayınca' },
};
export const PHASE_ORDER = ['bodyweight', 'band', 'dumbbell'];

export const BAND_LEVELS = ['Çok hafif', 'Hafif', 'Orta', 'Ağır', 'Çok ağır'];

const it = (ex, sets, min, max = min, extra = {}) => ({ ex, sets, min, max, ...extra });
const PREP = { prep: true };

export const PROGRAMS = {
  bodyweight: {
    A: [it('squat', 3, 12, 15), it('pushup', 3, 8, 12), it('glute_bridge', 3, 12, 15), it('chair_dips', 3, 8, 12), it('plank', 3, 20, 45)],
    B: [it('reverse_lunge', 3, 8, 12), it('wide_pushup', 3, 8, 12), it('single_leg_bridge', 3, 8, 12), it('superman', 3, 10, 12),
      it('side_plank', 3, 15, 30), it('lateral_lunge', 2, 8, 8, PREP), it('squat_jump', 2, 8, 8, PREP)],
  },
  band: {
    A: [it('band_squat', 3, 12, 15), it('pushup', 3, 8, 12), it('band_row', 3, 12, 15), it('band_glute_bridge', 3, 12, 15),
      it('plank', 3, 20, 45), it('band_lateral_raise', 2, 15, 20)],
    B: [it('reverse_lunge', 3, 8, 12), it('band_shoulder_press', 3, 10, 12), it('band_pulldown', 3, 12, 15), it('monster_walk', 3, 10),
      it('side_plank', 3, 15, 30), it('band_face_pull', 2, 15), it('lateral_lunge', 2, 8, 8, PREP), it('squat_jump', 2, 8, 8, PREP),
      it('band_wrist_ext', 2, 15, 15, PREP)],
  },
  dumbbell: {
    A: [it('goblet_squat', 3, 8, 12), it('pushup', 3, 8, 12), it('db_row', 3, 8, 12), it('db_rdl', 3, 8, 12),
      it('plank', 3, 30, 60), it('db_lateral_raise', 2, 12, 15)],
    B: [it('db_reverse_lunge', 3, 8, 12), it('db_shoulder_press', 3, 8, 12), it('pullup', 3, 6, 12), it('db_glute_bridge', 3, 10, 15),
      it('side_plank', 3, 20, 40), it('band_face_pull', 2, 15), it('lateral_lunge', 2, 8, 8, PREP), it('squat_jump', 2, 8, 8, PREP),
      it('band_wrist_ext', 2, 15, 15, PREP)],
  },
};

/** Etkin program: yapay zekâdan aktarılmış özel program o dönem için varsa onu, yoksa varsayılanı döndürür. */
export function programFor(settings) {
  const phase = settings?.phase ?? 'bodyweight';
  const c = settings?.customProgram;
  if (c && c.phase === phase && Array.isArray(c.A) && Array.isArray(c.B)) return { A: c.A, B: c.B, custom: true, note: c.note ?? '' };
  return PROGRAMS[phase] ?? PROGRAMS.bodyweight;
}

export function warmupFor(phase) {
  const list = ['Yerinde yürüyüş veya hafif tempo — 1 dk', 'Kol çevirme — 30 sn', 'Kalça çevirme — 30 sn', 'Yarım squat — 10 tekrar'];
  if (phase !== 'bodyweight') list.push('Bant ile dış rotasyon — 2 × 12');
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
    if (i >= 0 && i < ex.variants.length - 1) return `Bir üst seviyeye geç: ${ex.variants[i + 1]}.`;
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
