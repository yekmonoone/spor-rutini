// Hesaplamalar: haftalık ortalamalar, seans sayıları, hareket geçmişi, ilerleme ve blok özeti.
// Günlük kayıt alanları: weight (kg), steps, sleepH (saat), proteinG (g), walked/brisk (bool), workoutSkipped (bool),
// meals ({ slot: { id, name, protein, place } }), note. (energy eski kayıtlarda kalabilir.)
import { addDays, avg, weekStart } from './util.js';
import { EX, PROGRAMS, WEEKLY_STRENGTH_TARGET } from './program.js';

export const isStrength = (w) => w.day === 'A' || w.day === 'B';

const inRange = (from, to) => (r) => r.date >= from && r.date <= to;

/** Haftalık ortalamalar, eskiden yeniye: [{ week, avg, n }]. */
export function weeklyAverages(daily, field, { minN = 1 } = {}) {
  const byWeek = new Map();
  for (const rec of Object.values(daily)) {
    const v = rec[field];
    if (v == null || !Number.isFinite(v)) continue;
    const wk = weekStart(rec.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(v);
  }
  return [...byWeek.entries()]
    .map(([week, values]) => ({ week, avg: avg(values), n: values.length }))
    .filter((w) => w.n >= minN)
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** from…to (dahil) arasındaki günlerin değerleri. */
export function valuesInRange(daily, field, from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const v = daily[k]?.[field];
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function countInWeek(list, wk, pred = () => true) {
  return list.filter((r) => inRange(wk, addDays(wk, 6))(r) && pred(r)).length;
}

export function weeklySessions(workouts, padel, today, weeks = 8) {
  const cur = weekStart(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = addDays(cur, -7 * i);
    out.push({ week: wk, strength: countInWeek(workouts, wk, isStrength), padel: countInWeek(padel, wk) });
  }
  return out;
}

export function weekSummary({ workouts, padel, daily }, today) {
  const wk = weekStart(today);
  const end = addDays(wk, 6);
  return {
    week: wk,
    strength: countInWeek(workouts, wk, isStrength),
    padel: countInWeek(padel, wk),
    brisk: Object.values(daily).filter((d) => d.date >= wk && d.date <= end && d.brisk).length,
    weighIns: valuesInRange(daily, 'weight', wk, end).length,
    sleep: avg(valuesInRange(daily, 'sleepH', wk, end)),
    protein: avg(valuesInRange(daily, 'proteinG', wk, end)),
    steps: avg(valuesInRange(daily, 'steps', wk, end)),
  };
}

/** Bir hareketin geçmişi — yalnızca tamamlanan setler; eskiden yeniye. */
export function exerciseHistory(workouts, exId) {
  const out = [];
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      if (e.exerciseId !== exId) continue;
      const sets = (e.sets ?? []).filter((s) => s.done && s.reps != null && Number.isFinite(s.reps));
      if (!sets.length) continue;
      const reps = sets.map((s) => s.reps);
      out.push({
        date: w.date,
        workoutId: w.id,
        variant: e.variant ?? null,
        resistance: e.resistance ?? null,
        plannedSets: e.plannedSets ?? sets.length,
        min: e.min,
        max: e.max,
        unit: e.unit,
        sets,
        best: Math.max(...reps),
        total: reps.reduce((a, b) => a + b, 0),
      });
    }
  }
  return out;
}

export function lastPerformance(workouts, exId, excludeWorkoutId = null) {
  const list = excludeWorkoutId ? workouts.filter((w) => w.id !== excludeWorkoutId) : workouts;
  const h = exerciseHistory(list, exId);
  return h.length ? h[h.length - 1] : null;
}

export function sameLoad(a, b) {
  if ((a.variant ?? null) !== (b.variant ?? null)) return false;
  const ra = a.resistance;
  const rb = b.resistance;
  if (!ra && !rb) return true;
  if (!ra || !rb || ra.kind !== rb.kind) return false;
  return ra.kind === 'dumbbell' ? ra.kg === rb.kg : ra.level === rb.level;
}

function hitTop(entry) {
  if (entry.max == null) return false;
  const need = Math.max(2, entry.plannedSets ?? 0);
  return entry.sets.filter((s) => s.reps >= entry.max).length >= need;
}

/** Son iki seansta aynı yükle tüm setlerde üst sınıra ulaşıldıysa son seansı döndürür, yoksa null. */
export function progressionDue(workouts, exId) {
  const h = exerciseHistory(workouts, exId);
  if (h.length < 2) return null;
  const [a, b] = h.slice(-2);
  if (!sameLoad(a, b) || !hitTop(a) || !hitTop(b)) return null;
  return b;
}

/** İlerlemesi takip edilen hareketler (hazırlık ve sabit sayılı olanlar hariç). */
export function trackedItems(phaseOrProgram) {
  const prog = typeof phaseOrProgram === 'object' && phaseOrProgram ? phaseOrProgram : (PROGRAMS[phaseOrProgram] ?? PROGRAMS.bodyweight);
  const seen = new Set();
  const out = [];
  for (const day of ['A', 'B']) {
    for (const item of prog[day]) {
      if (item.prep || item.min === item.max || seen.has(item.ex)) continue;
      seen.add(item.ex);
      out.push({ ...item, day });
    }
  }
  return out;
}

function loadRank(exId, entry) {
  const ex = EX[exId];
  let v = 0;
  if (ex?.variants && entry.variant) v += Math.max(0, ex.variants.indexOf(entry.variant)) * 1000;
  const r = entry.resistance;
  if (r?.kind === 'dumbbell') v += (r.kg ?? 0) * 10;
  else if (r) v += (r.level ?? 0) * 100;
  return v;
}

export function isImprovement(exId, first, last) {
  const a = loadRank(exId, first);
  const b = loadRank(exId, last);
  if (b !== a) return b > a;
  return last.total > first.total || last.best > first.best;
}

/** 4 haftalık blok özeti (blockNo 1'den başlar). */
export function blockSummary({ workouts, padel, daily, measurements }, startKey, blockNo) {
  const from = addDays(startKey, (blockNo - 1) * 28);
  const to = addDays(from, 27);
  const within = inRange(from, to);
  const strength = workouts.filter((w) => within(w) && isStrength(w));
  const waists = measurements.filter((m) => within(m) && m.waistCm != null);
  let improved = 0;
  let tracked = 0;
  const exIds = new Set(strength.flatMap((w) => (w.exercises ?? []).map((e) => e.exerciseId)));
  for (const id of exIds) {
    const h = exerciseHistory(strength, id);
    if (h.length < 2) continue;
    tracked++;
    if (isImprovement(id, h[0], h[h.length - 1])) improved++;
  }
  const planned = WEEKLY_STRENGTH_TARGET * 4;
  return {
    blockNo,
    from,
    to,
    strengthDone: strength.length,
    strengthPlanned: planned,
    rate: strength.length / planned,
    padel: padel.filter(within).length,
    weightStart: avg(valuesInRange(daily, 'weight', from, addDays(from, 6))),
    weightEnd: avg(valuesInRange(daily, 'weight', addDays(from, 21), to)),
    waistStart: waists.length ? waists[0].waistCm : null,
    waistEnd: waists.length > 1 ? waists[waists.length - 1].waistCm : null,
    improved,
    tracked,
  };
}

/* ---------- Trend kilo ---------- */

/** Son 7 günün (dahil) tartı ortalaması; en az 3 tartı yoksa null. Günlük su/tuz dalgalanmasını yumuşatır. */
export function trendWeight(daily, date, { days = 7, minN = 3 } = {}) {
  const v = valuesInRange(daily, 'weight', addDays(date, -(days - 1)), date);
  return v.length >= minN ? avg(v) : null;
}

/** Haftalık trend değişimi (kg): trend(bugün) − trend(7 gün önce). Negatif = kayıp. */
export function trendRate(daily, date) {
  const now = trendWeight(daily, date);
  const before = trendWeight(daily, addDays(date, -7));
  return now == null || before == null ? null : now - before;
}

/** Grafik için 7 günlük hareketli ortalama noktaları (yalnızca tartı olan günlerde). */
export function movingAverageSeries(daily, from = null) {
  return Object.values(daily)
    .filter((r) => r.weight != null && (!from || r.date >= from))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ date: r.date, value: trendWeight(daily, r.date) }))
    .filter((p) => p.value != null)
    .map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 }));
}

/* ---------- Alışkanlık ---------- */

/** Antrenman, yürüyüş ya da padel olan gün sayısı (sinceKey dahil). */
export function activeDays({ workouts, padel, daily }, sinceKey) {
  const days = new Set();
  for (const w of workouts) if (!sinceKey || w.date >= sinceKey) days.add(w.date);
  for (const p of padel) if (!sinceKey || p.date >= sinceKey) days.add(p.date);
  for (const d of Object.values(daily)) if (d.walked && (!sinceKey || d.date >= sinceKey)) days.add(d.date);
  return days.size;
}

export const HABIT_DAYS = 66;
export const STREAK_MIN = 2;

/**
 * Haftalık seri: kuvvet ≥ 2 olan ardışık haftalar. Bu hafta henüz tamamlanmadıysa seriyi kırmaz;
 * ≥2'ye ulaştıysa sayılır. Bakım haftaları (isMaintenanceWeek(weekKey) true) seriyi kırmaz ve sayılmaz.
 */
export function weeklyStreak(state, today, { startKey = null, isMaintenanceWeek = () => false } = {}) {
  const cur = weekStart(today);
  let streak = countInWeek(state.workouts, cur, isStrength) >= STREAK_MIN ? 1 : 0;
  for (let wk = addDays(cur, -7); ; wk = addDays(wk, -7)) {
    if (startKey && addDays(wk, 6) < startKey) break;
    if (isMaintenanceWeek(wk)) continue;
    if (countInWeek(state.workouts, wk, isStrength) >= STREAK_MIN) streak++;
    else break;
    if (streak > 520) break;
  }
  return streak;
}

/* ---------- Güç testleri ---------- */

export const isTest = (m) => m?.kind === 'test';

export function testHistory(measurements) {
  return measurements.filter(isTest).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** İki test arasındaki fark metinleri (ör. "Şınav: Diz 12 → Tam 6"). */
export function compareTests(a, b) {
  if (!a || !b) return [];
  const out = [];
  const push = (label, x, y, fmt = (v) => v) => {
    if (x == null && y == null) return;
    out.push(`${label}: ${x == null ? '–' : fmt(x)} → ${y == null ? '–' : fmt(y)}`);
  };
  const pu = (t) => (t.pushupReps == null ? null : `${t.pushupLevel ?? ''} ${t.pushupReps}`.trim());
  push('Şınav', pu(a), pu(b));
  push('Plank', a.plankSec, b.plankSec, (v) => `${v} sn`);
  push('Squat (1 dk)', a.squat60, b.squat60);
  return out;
}
