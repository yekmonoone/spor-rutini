// Kalori ve protein hedefleri (Mifflin-St Jeor + aktivite katsayısı). Tahmindir; tartı trendiyle ayarlanır.
import { roundTo } from './util.js';

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
