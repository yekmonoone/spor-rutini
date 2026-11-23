// Kural tabanlı uyarılar (yapay zekâ gerektirmez). Her kural saf bir fonksiyondur.
// Uyarı: { id, level: 'warn'|'info'|'success', icon, title, body, action?: { label, to } }
// action.to: bir sayfa yolu ('/antrenman') ya da 'form:daily' | 'form:padel' | 'form:measure' | 'form:test' | 'backup'
//            | 'kcal:-150' / 'kcal:+150' (kalori hedefini ayarla) | 'maint:on' / 'maint:off' (bakım haftası)
import { addDays, avg, daysBetween, fmtNum, weekStart, weekday } from './util.js';
import { EX, WEEKLY_STRENGTH_MIN, WEEKLY_STRENGTH_TARGET, blockOf, programFor, programWeek, progressionHint } from './program.js';
import { countInWeek, isStrength, isTest, progressionDue, trackedItems, valuesInRange, weeklyAverages } from './stats.js';
import { inMaintenance } from './targets.js';
import { shoppingList, shoppingCycle, countShopping } from './mealplan.js';

export const PAIN_AREAS = { elbow: 'Dirsek', shoulder: 'Omuz', wrist: 'Bilek', knee: 'Diz', back: 'Bel' };

/** Kalibrasyondan ya da bakımdan sonra kilo hızı uyarıları 14 gün susar (yeni hedefin etkisi görülsün). */
export const CALIBRATION_QUIET_DAYS = 14;

export function weightQuiet({ settings, meta, today }) {
  if (inMaintenance(settings, today)) return true;
  const end = settings?.maintenanceUntil;
  if (end && daysBetween(end, today) < CALIBRATION_QUIET_DAYS) return true;
  const cal = meta?.lastCalibration?.date;
  return !!cal && daysBetween(cal, today) < CALIBRATION_QUIET_DAYS;
}

const LEVEL_ORDER = { warn: 0, info: 1, success: 2 };

function strengthThisWeek({ workouts, today, startKey }) {
  const wk = weekStart(today);
  const n = countInWeek(workouts, wk, isStrength);
  if (n >= WEEKLY_STRENGTH_TARGET) {
    return { id: `str-ok@${wk}`, level: 'success', icon: '💪', title: `Bu hafta ${n} kuvvet antrenmanı — hedef tamam`, body: 'Harika. Haftanın kalanında yürüyüş ve padel yeterli.' };
  }
  if (startKey && startKey > addDays(wk, 2)) return null; // program bu hafta perşembeden sonra başladı
  const wd = weekday(today);
  if (wd < 3 || n >= WEEKLY_STRENGTH_MIN) return null;
  const left = 7 - wd; // bugün dahil
  const reachable = n + left >= WEEKLY_STRENGTH_MIN;
  return {
    id: `str-low@${wk}`,
    level: 'warn',
    icon: '⚠️',
    title: `Bu hafta ${n} kuvvet antrenmanı`,
    body: reachable
      ? `Minimum hedef ${WEEKLY_STRENGTH_MIN}, ideal ${WEEKLY_STRENGTH_TARGET}. Haftanın bitmesine ${left} gün var — 2 setlik kısa bir seans da sayılır.`
      : 'Bu hafta minimuma ulaşmak zor; sorun değil. Kaçan gün telafi edilmez — gelecek haftanın planına devam et.',
    action: reachable ? { label: 'Antrenmana başla', to: '/antrenman' } : null,
  };
}

function longGap({ workouts, today, startKey }) {
  if (!startKey || daysBetween(startKey, today) < 8 || weekday(today) >= 3) return null;
  let last = null;
  for (let i = workouts.length - 1; i >= 0; i--) if (isStrength(workouts[i])) { last = workouts[i]; break; }
  const gap = daysBetween(last ? last.date : startKey, today);
  if (gap < 8) return null;
  return {
    id: `gap@${last ? last.date : startKey}`,
    level: 'warn',
    icon: '⏳',
    title: `${gap} gündür kuvvet antrenmanı yok`,
    body: 'Ara vermek normal. Bugün 2 setlik kısa bir seansla geri dön — en zor kısım başlamak.',
    action: { label: 'Antrenmana başla', to: '/antrenman' },
  };
}

function lastWeek({ workouts, today, startKey }) {
  if (weekday(today) > 1) return null;
  const prev = addDays(weekStart(today), -7);
  if (!startKey || startKey > prev) return null;
  const n = countInWeek(workouts, prev, isStrength);
  if (n >= WEEKLY_STRENGTH_MIN) return null;
  return {
    id: `str-prev@${prev}`,
    level: 'info',
    icon: '📅',
    title: `Geçen hafta ${n} kuvvet antrenmanı`,
    body: `Hedef ${WEEKLY_STRENGTH_TARGET} (en az ${WEEKLY_STRENGTH_MIN}). Bu hafta takvimdeki kuvvet günlerine odaklan.`,
  };
}

function proteinLow({ daily, today, profile }) {
  const min = profile?.proteinMin;
  if (!min) return null;
  const days = [1, 2, 3].map((i) => daily[addDays(today, -i)]?.proteinG);
  if (days.some((v) => v == null) || !days.every((v) => v < min)) return null;
  return {
    id: `prot@${addDays(today, -1)}`,
    level: 'warn',
    icon: '🥚',
    title: 'Protein 3 gündür hedefin altında',
    body: `Son 3 gün ortalama ${fmtNum(avg(days), 0)} g (hedef ${min}–${profile.proteinMax ?? min} g). Kolay kaynaklar: yoğurt/kefir, yumurta, ton balığı, tavuk/köfte, nohut; gerekirse 1 ölçek whey.`,
  };
}

function sleepLow({ daily, today }) {
  const v = valuesInRange(daily, 'sleepH', addDays(today, -6), today);
  if (v.length < 3) return null;
  const a = avg(v);
  if (a >= 7) return null;
  return {
    id: `sleep@${weekStart(today)}`,
    level: 'warn',
    icon: '😴',
    title: `Uyku ortalaması ${fmtNum(a)} saat`,
    body: 'Hedef 7,5+ saat. Kalori açığındayken kısa uyku, verilen kilonun yağdan gelen payını azaltıp kas kaybını artırıyor. Her gün aynı saatte yatmayı dene.',
  };
}

function weightRate(ctx) {
  const { daily, today, profile } = ctx;
  if (weightQuiet(ctx)) return [];
  const cur = weekStart(today);
  const weeks = weeklyAverages(daily, 'weight', { minN: 2 }).filter((w) => w.week < cur);
  const out = [];
  if (weeks.length >= 2) {
    const a = weeks[weeks.length - 2];
    const b = weeks[weeks.length - 1];
    if (daysBetween(a.week, b.week) === 7 && daysBetween(b.week, cur) === 7) {
      const loss = a.avg - b.avg;
      const pct = (loss / a.avg) * 100;
      if (pct > 1) {
        out.push({
          id: `wt-fast@${b.week}`,
          level: 'warn',
          icon: '⚖️',
          title: 'Kilo çok hızlı düşüyor',
          body: `Geçen hafta ortalaman ${fmtNum(loss)} kg (%${fmtNum(pct)}) düştü. Hedef haftada %0,5–1. Kas kaybını önlemek için günlük kaloriyi ~150 kcal artır, protein hedefini koru.`,
          action: profile?.kcalMin ? { label: 'Hedefi +150 kcal yap', to: 'kcal:+150' } : { label: 'Hedefleri aç', to: '/ayarlar' },
        });
      }
    }
  }
  if (weeks.length >= 4) {
    const a = weeks[weeks.length - 4];
    const b = weeks[weeks.length - 1];
    if (daysBetween(a.week, b.week) === 21 && daysBetween(b.week, cur) === 7) {
      const perWeek = (a.avg - b.avg) / 3;
      if (perWeek < 0.3) {
        const canCut = profile?.kcalMin && profile?.kcalFloor ? profile.kcalMin - 150 >= profile.kcalFloor : true;
        const trend = perWeek >= 0 ? `haftada ortalama ${fmtNum(perWeek, 2)} kg kayıp` : `haftada ortalama ${fmtNum(-perWeek, 2)} kg artış`;
        const advice = canCut && profile?.kcalMin
          ? `Günlük kaloriyi ~150–200 kcal azaltmayı düşün (ör. ${fmtNum(profile.kcalMin - 150, 0)}–${fmtNum(profile.kcalMax - 150, 0)} kcal).`
          : 'Kalori hedefin alt sınıra yakın; azaltmak yerine günlük adımı artır ve porsiyonları gözden geçir.';
        out.push({
          id: `wt-slow@${b.week}`,
          level: 'info',
          icon: '⚖️',
          title: perWeek >= 0 ? 'Kilo kaybı yavaş' : 'Kilo son 3 haftada arttı',
          body: `Son 3 haftada ${trend}. ${advice} Kreatine yeni başladıysan ilk haftalardaki 0,5–1 kg su tutumunu hesaba kat.`,
          action: canCut && profile?.kcalMin ? { label: 'Hedefi −150 kcal yap', to: 'kcal:-150' } : { label: 'Hedefleri aç', to: '/ayarlar' },
        });
      }
    }
  }
  return out;
}

/** Aynı bölgede son 3 haftada ≥2 kez ağrı (padel + antrenman). */
function painRepeat({ padel, workouts = [], today }) {
  const recent = [...padel.map((p) => ({ ...p, src: 'padel' })), ...workouts.map((w) => ({ ...w, src: 'workout' }))]
    .filter((r) => {
      const d = daysBetween(r.date, today);
      return d >= 0 && d <= 21 && Array.isArray(r.pain) && r.pain.length;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = [];
  for (const [key, label] of Object.entries(PAIN_AREAS)) {
    const hits = recent.filter((r) => r.pain.includes(key));
    if (hits.length < 2) continue;
    const lower = label.toLocaleLowerCase('tr-TR');
    const nPadel = hits.filter((r) => r.src === 'padel').length;
    const where = nPadel === hits.length ? 'padel seansında' : nPadel === 0 ? 'antrenmanda' : 'seansta (padel + antrenman)';
    out.push({
      id: `pain-${key}@${hits[hits.length - 1].date}`,
      level: 'warn',
      icon: '🩹',
      title: `${label} ağrısı tekrarlıyor`,
      body: `Son 3 haftada ${hits.length} ${where} ${lower} ağrısı işaretledin. 1–2 seans o bölgeyi zorlayan hareketleri hafiflet ya da süreyi kısalt. `
        + (key === 'elbow' && nPadel ? 'Raketinin yumuşak ve hafif olduğundan emin ol, tekniğini hocana kontrol ettir; bilek ekstansiyonuna devam et. ' : '')
        + 'Ağrı sürerse ya da artarsa bir fizyoterapiste veya hekime danış.',
    });
  }
  return out;
}

/** Son iki kuvvet antrenmanı "çok zor" geldiyse. */
function effortHard({ workouts, today }) {
  const last = workouts.filter((w) => isStrength(w) && w.effort).slice(-2);
  if (last.length < 2 || !last.every((w) => w.effort === 'hard')) return null;
  if (daysBetween(last[1].date, today) > 10) return null;
  return {
    id: `effort@${last[1].date}`,
    level: 'info',
    icon: '🥵',
    title: 'Son iki antrenman çok zor geldi',
    body: 'Bir sonraki seansta her harekette 1 set az yap ya da bir kolay seviyeye dön; setleri bitirdiğinde 2–3 tekrar daha yapabilecek gibi hissetmelisin. Uyku ve protein de toparlanmayı etkiler.',
  };
}

/** 4 haftada bir 5 dakikalık güç testi. */
function testDue({ measurements, today, startKey }) {
  if (!startKey) return null;
  const tests = measurements.filter(isTest);
  const last = tests.length ? tests[tests.length - 1] : null;
  if (!last) {
    if (daysBetween(startKey, today) < 14) return null; // ilk iki hafta başlangıç kartı hatırlatır
  } else if (programWeek(startKey, today) < 5 || daysBetween(last.date, today) < 26) return null;
  return {
    id: `test@${last ? last.date : 'first'}`,
    level: 'info',
    icon: '🏅',
    title: last ? '4 haftalık güç testi zamanı' : 'İlk güç testini yap',
    body: '5 dakika: şınav (temiz tekrar), plank (süre) ve 1 dakikada squat. Aynı koşullarda tekrarlarsan ilerlemeni net görürsün.',
    action: { label: 'Testi yap', to: 'form:test' },
  };
}

/** Haftalık kontrolün ait olduğu hafta: Pazar → bu hafta, Pazartesi → geçen hafta, diğer günler null. */
export function checkinWeek(today) {
  const wd = weekday(today);
  if (wd === 6) return weekStart(today);
  if (wd === 0) return addDays(weekStart(today), -7);
  return null;
}

function checkinDue({ meta, today, startKey }) {
  const wk = checkinWeek(today);
  if (!wk || (startKey && startKey > addDays(wk, 6))) return null;
  if (meta?.lastCheckin && meta.lastCheckin >= wk) return null;
  return {
    id: `checkin@${wk}`,
    level: 'info',
    icon: '🗓️',
    title: 'Haftalık kontrol (3 dk)',
    body: 'Haftanı özetle, gerekirse kaloriyi ayarla, gelecek haftayı ve "eğer–o zaman" planlarını gözden geçir.',
    action: { label: 'Kontrolü aç', to: '/haftalik' },
  };
}

/** Program haftası 13'te (sonra her 12 haftada) 2 haftalık bakım kalorisi önerisi. */
function maintenanceSuggest({ settings, today, startKey, profile }) {
  if (!startKey || !profile?.kcalMin || inMaintenance(settings, today)) return null;
  const week = programWeek(startKey, today);
  if (week < 13 || (week - 13) % 12 !== 0) return null;
  return {
    id: `maint@${week}`,
    level: 'info',
    icon: '🌿',
    title: 'İstersen 2 hafta bakım kalorisi',
    body: '12 haftadır kalori açığındasın. 2 hafta tahmini harcaman kadar yemek (diyet arası) açlığı ve yorgunluğu azaltabilir; araştırmalarda toplam yağ kaybı sürekli diyete benzer. Antrenmana aynen devam.',
    action: { label: 'Bakım haftalarını başlat', to: 'maint:on' },
  };
}

function progression({ workouts, settings }) {
  const due = [];
  for (const item of trackedItems(programFor(settings))) {
    const last = progressionDue(workouts, item.ex);
    if (last) due.push({ item, last });
  }
  if (!due.length) return null;
  const name = (d) => EX[d.item.ex].name;
  return {
    id: 'prog@' + due.map((d) => `${d.item.ex}:${d.last.date}`).join(','),
    level: 'info',
    icon: '📈',
    title: due.length === 1 ? `${name(due[0])}: zorlaştırma zamanı` : `${due.length} harekette zorlaştırma zamanı`,
    body: 'Son 2 seansta tüm setlerde üst sınıra ulaştın.\n' + due.map((d) => `• ${name(d)}: ${progressionHint(d.item.ex, d.last)}`).join('\n'),
  };
}

/**
 * Ekipmansız dönemde 3 hafta düzenli gidildiyse (son 21 günde ≥6 kuvvet seansı) ya da bacaklar vücut ağırlığını
 * aştıysa: ev setini (dambıl + kapı barfiks barı) alma zamanı. Para, alışkanlık oturduktan sonra harcanır.
 */
export const WEIGHTS_READY_SESSIONS = 6;

function weightsReady({ workouts, settings, today, startKey }) {
  if ((settings?.phase ?? 'bodyweight') !== 'bodyweight' || !startKey) return null;
  const week = programWeek(startKey, today);
  if (week < 3) return null;
  const recent = workouts.filter((w) => isStrength(w) && w.date > addDays(today, -21) && w.date <= today).length;
  const legs = ['squat', 'reverse_lunge'].some((id) => progressionDue(workouts, id));
  if (recent < WEIGHTS_READY_SESSIONS && !legs) return null;
  return {
    id: `weights@${blockOf(week).block}`,
    level: 'info',
    icon: '🏋️',
    title: recent >= WEIGHTS_READY_SESSIONS ? '3 haftadır düzenlisin: ev setini alma zamanı' : 'Bacaklar vücut ağırlığını aştı: ev seti zamanı',
    body: 'Alınacaklar: 20 kg vidalı dambıl seti (el başına 10 kg) + kilitli kapı barfiks barı (kapı kasası 60–100 cm ve sağlam olmalı). Bant gerekmez.\nGelince Ayarlar → Dönem: Dambıl.',
    action: { label: 'Ayarlar', to: '/ayarlar' },
  };
}

/** Bant dönemi seçili ama hiç bantlı antrenman yok: büyük ihtimalle bant alınmadı (karar: bant seti yok). */
function bandPhaseCheck({ workouts, settings }) {
  if (settings?.phase !== 'band') return null;
  const usedBand = workouts.some((w) => (w.exercises ?? []).some((e) => ['band', 'miniband'].includes(e.resistance?.kind) && e.sets?.some((s) => s.done)));
  if (usedBand) return null;
  return {
    id: 'band-phase',
    level: 'warn',
    icon: '🔁',
    title: 'Dönem "Bant + mat" seçili',
    body: 'Programın bantlı hareketler gösteriyor ama henüz bantla antrenman kaydın yok. Bantın yoksa "Ekipmansız"a geç; dambıl seti ve barfiks barı gelince "Dambıl"a geçersin.',
    action: { label: 'Ekipmansıza geç', to: 'phase:bodyweight' },
  };
}

function dumbbellTime({ workouts, settings, today }) {
  if (settings?.phase !== 'band') return null;
  const maxed = ['band_squat', 'band_glute_bridge'].filter((id) => {
    const last = progressionDue(workouts, id);
    return last && (last.resistance?.level ?? 0) >= 4;
  });
  if (!maxed.length) return null;
  return {
    id: `db-time@${weekStart(today)}`,
    level: 'info',
    icon: '🏋️',
    title: 'Dambıl zamanı olabilir',
    body: 'Bacak hareketlerinde ağır bantla üst sınırdasın. 20 kg vidalı dambıl seti + kapı barfiks barı alıp Ayarlar\'dan dönemi "Dambıl" yapabilirsin (dambıl programı bant gerektirmez).',
    action: { label: 'Ayarlar', to: '/ayarlar' },
  };
}

function weighIns({ daily, today, startKey }) {
  if (!startKey || daysBetween(startKey, today) < 3 || weekday(today) < 3) return null;
  const wk = weekStart(today);
  const n = valuesInRange(daily, 'weight', wk, today).length;
  if (n >= 2) return null;
  return {
    id: `wt-missing@${wk}`,
    level: 'info',
    icon: '⚖️',
    title: n === 0 ? 'Bu hafta tartı kaydı yok' : 'Bu hafta yalnızca 1 tartı kaydı var',
    body: 'Haftalık ortalama için haftada en az 3 kez tartıl: sabah, tuvaletten sonra, aç karnına.',
    action: { label: 'Kilo gir', to: 'form:daily' },
  };
}

function stepsLow({ daily, today }) {
  const v = valuesInRange(daily, 'steps', addDays(today, -6), today);
  if (v.length < 3) return null;
  const a = avg(v);
  if (a >= 7000) return null;
  return {
    id: `steps@${weekStart(today)}`,
    level: 'info',
    icon: '👟',
    title: `Günlük ortalama ${fmtNum(a, 0)} adım`,
    body: 'Sağlık faydalarının çoğu günde ~7.000 adımda başlıyor. Akşam yürüyüşünü biraz uzatmak ya da gün içinde 45–60 dakikada bir kalkıp yürümek yeter.',
  };
}

function measurementsDue({ measurements, today }) {
  const wk = weekStart(today);
  let lastWaist = null;
  let lastPhoto = null;
  for (const m of measurements) {
    if (m.waistCm != null) lastWaist = m;
    if (m.photo) lastPhoto = m;
  }
  const waistDue = !lastWaist || (lastWaist.date < wk && daysBetween(lastWaist.date, today) >= 6);
  const photoDue = !lastPhoto || daysBetween(lastPhoto.date, today) >= 28;
  if (!waistDue && !photoDue) return null;
  const parts = [];
  if (waistDue) parts.push('bel çevresi (haftada 1: sabah, göbek hizasından, nefes verdikten sonra)');
  if (photoDue) parts.push('aylık fotoğraf (aynı ışık ve açıyla önden, yandan, arkadan — fotoğraflar telefonunda kalır)');
  return {
    id: `measure@${wk}${photoDue ? '+p' : ''}`,
    level: 'info',
    icon: '📏',
    title: waistDue && photoDue ? 'Ölçüm ve fotoğraf zamanı' : waistDue ? 'Bel ölçümü zamanı' : 'Aylık fotoğraf zamanı',
    body: `Sırada: ${parts.join('; ')}.`,
    action: { label: 'Ölçüm ekle', to: 'form:measure' },
  };
}

function blockDone({ today, startKey }) {
  if (!startKey) return null;
  const week = programWeek(startKey, today);
  if (week < 5) return null;
  const { block, weekInBlock } = blockOf(week);
  if (weekInBlock !== 1) return null;
  return {
    id: `block@${block - 1}`,
    level: 'info',
    icon: '🏁',
    title: `${block - 1}. blok tamamlandı`,
    body: '4 haftalık değerlendirme hazır: antrenman oranı, kilo ve bel değişimi, hareketlerdeki ilerleme. Kalori hedefini de bu verilere göre gözden geçir.',
    action: { label: 'Değerlendirmeyi aç', to: '/ilerleme' },
  };
}

function backupDue({ meta, today, workouts, padel, measurements, daily }) {
  const n = workouts.length + padel.length + measurements.length + Object.keys(daily).length;
  if (n < 3) return null;
  const last = meta?.lastBackupAt ?? null;
  if (last && daysBetween(last, today) < 7) return null;
  return {
    id: `backup@${weekStart(today)}`,
    level: 'info',
    icon: '💾',
    title: last ? 'Yedek alma zamanı' : 'Henüz yedek alınmadı',
    body: 'Veriler yalnızca bu telefonda duruyor. Yedeği dışa aktarıp iCloud Drive\'a kaydet; telefon değişirse geri yüklersin.',
    action: { label: 'Yedek al', to: 'backup' },
  };
}

function shoppingDay({ mealplan, shopping, today }) {
  if (!mealplan?.days) return null;
  const day = mealplan.prefs?.shoppingDay ?? 6;
  if (weekday(today) !== day) return null;
  const cycle = shoppingCycle(today, day);
  const checked = shopping?.cycle === cycle ? shopping.checked ?? {} : {};
  const extra = shopping?.cycle === cycle ? shopping.extra ?? [] : [];
  const { total, done } = countShopping(shoppingList(mealplan), extra, checked);
  if (!total || done >= total) return null;
  return {
    id: `shop@${cycle}`,
    level: 'info',
    icon: '🛒',
    title: 'Alışveriş günü',
    body: `Haftalık listede ${total - done} ürün var. Kısa ömürlüleri (yeşillik, lor, hindi füme) hafta ortasına bölebilirsin.`,
    action: { label: 'Listeyi aç', to: '/yemek/alisveris' },
  };
}

export const RULES = [
  strengthThisWeek, longGap, lastWeek, proteinLow, sleepLow, weightRate, painRepeat, effortHard,
  progression, bandPhaseCheck, weightsReady, dumbbellTime, weighIns, stepsLow, measurementsDue, testDue, blockDone, maintenanceSuggest,
  checkinDue, shoppingDay, backupDue,
];

/**
 * ctx: { profile, settings, meta, workouts, padel, measurements, daily, today, startKey }
 * Gizlenmiş (dismiss) uyarılar çıkarılır; önce uyarılar, sonra bilgiler, en son başarılar.
 */
export function evaluateAlerts(ctx) {
  const out = [];
  for (const rule of RULES) {
    try {
      const r = rule(ctx);
      if (Array.isArray(r)) out.push(...r);
      else if (r) out.push(r);
    } catch (err) {
      console.error('Kural hatası:', rule.name, err);
    }
  }
  const dismissed = ctx.meta?.dismissed ?? {};
  return out
    .filter((a) => !dismissed[a.id])
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
