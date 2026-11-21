// Kural tabanlı uyarılar (yapay zekâ gerektirmez). Her kural saf bir fonksiyondur.
// Uyarı: { id, level: 'warn'|'info'|'success', icon, title, body, action?: { label, to } }
// action.to: bir sayfa yolu ('/antrenman') ya da 'form:daily' | 'form:padel' | 'form:measure' | 'backup'
import { addDays, avg, daysBetween, fmtNum, weekStart, weekday } from './util.js';
import { EX, WEEKLY_STRENGTH_MIN, WEEKLY_STRENGTH_TARGET, blockOf, programWeek, progressionHint } from './program.js';
import { countInWeek, isStrength, progressionDue, trackedItems, valuesInRange, weeklyAverages } from './stats.js';

export const PAIN_AREAS = { elbow: 'Dirsek', shoulder: 'Omuz', knee: 'Diz', back: 'Bel' };

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

function weightRate({ daily, today, profile }) {
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
          body: `Geçen hafta ortalaman ${fmtNum(loss)} kg (%${fmtNum(pct)}) düştü. Hedef haftada %0,5–1. Kas kaybını önlemek için günlük kaloriyi ~150–200 kcal artır, protein hedefini koru.`,
          action: { label: 'Hedefleri aç', to: '/ayarlar' },
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
          action: { label: 'Hedefleri aç', to: '/ayarlar' },
        });
      }
    }
  }
  return out;
}

function padelPain({ padel, today }) {
  const recent = padel.filter((p) => {
    const d = daysBetween(p.date, today);
    return d >= 0 && d <= 21;
  });
  const out = [];
  for (const [key, label] of Object.entries(PAIN_AREAS)) {
    const hits = recent.filter((p) => Array.isArray(p.pain) && p.pain.includes(key));
    if (hits.length < 2) continue;
    const lower = label.toLocaleLowerCase('tr-TR');
    out.push({
      id: `pain-${key}@${hits[hits.length - 1].date}`,
      level: 'warn',
      icon: '🩹',
      title: `${label} ağrısı tekrarlıyor`,
      body: `Son 3 haftada ${hits.length} padel seansında ${lower} ağrısı işaretledin. 1–2 seans ara ver ya da süreyi kısalt. `
        + (key === 'elbow' ? 'Raketinin yumuşak ve hafif olduğundan emin ol, tekniğini hocana kontrol ettir; bilek ekstansiyonuna devam et. ' : '')
        + 'Ağrı sürerse ya da artarsa bir fizyoterapiste veya hekime danış.',
    });
  }
  return out;
}

function progression({ workouts, settings }) {
  const due = [];
  for (const item of trackedItems(settings?.phase ?? 'bodyweight')) {
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
    body: 'Bacak hareketlerinde ağır bantla üst sınırdasın. Planına göre ayarlanabilir dambıl (2,5 → 15–20 kg) alıp Ayarlar\'dan dönemi "Dambıl" yapabilirsin.',
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

export const RULES = [
  strengthThisWeek, longGap, lastWeek, proteinLow, sleepLow, weightRate, padelPain,
  progression, dumbbellTime, weighIns, stepsLow, measurementsDue, blockDone, backupDue,
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
