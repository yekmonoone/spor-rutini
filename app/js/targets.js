// Kalori ve protein hedefleri (Mifflin-St Jeor + aktivite katsayısı). Tahmindir; tartı trendiyle ayarlanır.
import { addDays, roundTo } from './util.js';

export const ACTIVITY = [
  { value: 1.2, label: 'Az hareketli', desc: 'Masa başı, düzenli egzersiz yok' },
  { value: 1.375, label: 'Hafif aktif', desc: 'Masa başı + günlük yürüyüş' },
  { value: 1.5, label: 'Orta aktif', desc: 'Masa başı + günlük yürüyüş + haftada 3 antrenman' },
  { value: 1.65, label: 'Aktif', desc: 'Ayakta/hareketli iş + düzenli antrenman' },
];

export function ageFromBirthYear(birthYear, now = new Date()) {
  return now.getFullYear() - birthYear;
}

export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Profil eksiksizse önerilen hedefleri döndürür, değilse null. */
export function computeTargets(p, now = new Date()) {
  if (!p || !(p.weightKg > 0) || !(p.heightCm > 0) || !(p.birthYear > 1900) || !(p.activity > 0)) return null;
  const age = ageFromBirthYear(p.birthYear, now);
  const b = bmr({ sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, age });
  const tdee = b * p.activity;
  // Taban: bazal metabolizmanın altına inme (ve genel alt sınırlar).
  const floor = Math.max(Math.floor(b / 50) * 50, p.sex === 'female' ? 1200 : 1500);
  const kcalMin = Math.max(floor, roundTo(tdee - 500, 50));
  const kcalMax = Math.max(floor, roundTo(tdee - 400, 50));
  const proteinMin = Math.ceil((1.6 * p.weightKg) / 5) * 5;
  const proteinMax = Math.max(proteinMin, Math.ceil((1.75 * p.weightKg) / 5) * 5);
  return {
    age,
    bmr: Math.round(b),
    tdee: Math.round(tdee),
    kcalFloor: floor,
    kcalMin,
    kcalMax,
    proteinMin,
    proteinMax,
    lossMinKg: roundTo(p.weightKg * 0.005, 0.1),
    lossMaxKg: roundTo(p.weightKg * 0.01, 0.1),
    bmi: bmi(p.weightKg, p.heightCm),
  };
}

/** Bel/boy oranı ve NICE (NG246) sınıfı. */
export function whtr(waistCm, heightCm) {
  if (!(waistCm > 0) || !(heightCm > 0)) return null;
  const ratio = waistCm / heightCm;
  const level = ratio < 0.4 ? 'low' : ratio < 0.5 ? 'healthy' : ratio < 0.6 ? 'increased' : 'high';
  const label = { low: 'düşük', healthy: 'sağlıklı aralık', increased: 'artmış risk', high: 'yüksek risk' }[level];
  return { ratio: Math.round(ratio * 100) / 100, level, label, targetWaist: Math.round(heightCm * 5) / 10 };
}

/** Bakım (diyet arası) haftasında mı? settings.maintenanceUntil = son gün. */
export function inMaintenance(settings, date) {
  return !!settings?.maintenanceUntil && date <= settings.maintenanceUntil;
}

/** Bakım döneminde kalori hedefi = tahmini harcama ±50; aksi halde profildeki hedefler. */
export function effectiveTargets(profile, settings, date, now = new Date()) {
  if (!profile) return null;
  if (!inMaintenance(settings, date)) return { ...profile, maintenance: false };
  const t = computeTargets(profile, now);
  if (!t) return { ...profile, maintenance: true };
  return { ...profile, kcalMin: roundTo(t.tdee - 50, 50), kcalMax: roundTo(t.tdee + 50, 50), maintenance: true };
}

/** Hafta (Pazartesi anahtarı) bakım dönemiyle kesişiyor mu? (seri hesabında o hafta sayılmaz ama zinciri kırmaz) */
export function maintenanceWeek(settings, weekKey) {
  const from = settings?.maintenanceFrom;
  const until = settings?.maintenanceUntil;
  if (!from || !until || from > until) return false; // aynı gün iptal edilen bakım
  return weekKey <= until && addDays(weekKey, 6) >= from;
}

/** Kalori hedefini delta kadar kaydırır; tabanın altına inmez. Yeni { kcalMin, kcalMax } ya da null döner. */
export function calibrate(profile, delta) {
  if (!profile?.kcalMin || !profile?.kcalMax || !Number.isFinite(delta)) return null;
  const floor = profile.kcalFloor ?? 0;
  const shift = Math.max(delta, floor - profile.kcalMin);
  if (shift === 0) return null;
  return { kcalMin: profile.kcalMin + shift, kcalMax: profile.kcalMax + shift, shift };
}
