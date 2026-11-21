// Tarih, sayı ve genel yardımcılar. Tarihler yerel saatle 'YYYY-AA-GG' anahtarı olarak tutulur.

export const pad2 = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** b - a, gün olarak. */
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** 0 = Pazartesi … 6 = Pazar */
export function weekday(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

/** Haftanın pazartesi gününün anahtarı. */
export function weekStart(key) {
  return addDays(key, -weekday(key));
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function fmtDate(key, opts = { day: 'numeric', month: 'short' }) {
  return parseKey(key).toLocaleDateString('tr-TR', opts);
}

export function fmtDateLong(key) {
  return parseKey(key).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtNum(n, maxDigits = 1) {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: maxDigits });
}

/** Virgüllü ("79,5") veya noktalı girişi sayıya çevirir; boşsa null. */
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function roundTo(n, step = 1) {
  return Math.round(n / step) * step;
}

export function avg(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function byDate(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

export function deepCopy(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/** "1:05" biçiminde süre. */
export function fmtClock(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${pad2(s % 60)}`;
}
