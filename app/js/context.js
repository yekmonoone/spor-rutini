// Ekranların ortak kullandığı türetilmiş değerler ve gezinme.
import { state, setKV, updateMeta, updateSettings } from './store.js';
import { addDays, dateKey, fmtNum } from './util.js';
import { programStartKey } from './program.js';
import { evaluateAlerts } from './rules.js';
import { calibrate, effectiveTargets, inMaintenance } from './targets.js';
import { openDailyForm, openPadelForm, openMeasureForm, openTestForm, exportBackupFlow } from './forms.js';
import { toast } from './ui.js';

export const today = () => dateKey();

export function startKey() {
  return programStartKey(state.settings, state.profile?.createdDay ?? today());
}

/** Bugün geçerli hedefler (bakım haftasında kalori = tahmini harcama). */
export const targetsToday = (t = today()) => effectiveTargets(state.profile, state.settings, t);

export const maintenanceOn = (t = today()) => inMaintenance(state.settings, t);

export function ruleCtx(t = today()) {
  return {
    profile: state.profile,
    targets: effectiveTargets(state.profile, state.settings, t),
    settings: state.settings,
    meta: state.meta,
    workouts: state.workouts,
    padel: state.padel,
    measurements: state.measurements,
    daily: state.daily,
    mealplan: state.mealplan,
    shopping: state.shopping,
    today: t,
    startKey: startKey(),
  };
}

export const currentAlerts = () => evaluateAlerts(ruleCtx());

export function go(path) {
  const target = `#${path}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export async function applyCalibration(delta, t = today()) {
  const c = calibrate(state.profile, delta);
  if (!c) {
    toast('Kalori hedefi zaten alt sınırda.');
    return null;
  }
  await setKV('profile', { ...state.profile, kcalMin: c.kcalMin, kcalMax: c.kcalMax });
  await updateMeta({ lastCalibration: { date: t, delta: c.shift } });
  toast(`Yeni hedef: ${fmtNum(c.kcalMin, 0)}–${fmtNum(c.kcalMax, 0)} kcal`);
  return c;
}

export const MAINTENANCE_DAYS = 14;

export async function setMaintenance(on, t = today()) {
  // Kapatırken dünü son gün yaparız: bakımın bittiği tarih (14 gün susma için) korunur.
  await updateSettings(on
    ? { maintenanceFrom: t, maintenanceUntil: addDays(t, MAINTENANCE_DAYS - 1) }
    : { maintenanceUntil: addDays(t, -1) });
  toast(on ? 'Bakım haftaları başladı — 2 hafta' : 'Bakım bitti, normal hedeflere dönüldü');
}

export function runAction(to) {
  if (to === 'form:daily') openDailyForm();
  else if (to === 'form:padel') openPadelForm();
  else if (to === 'form:measure') openMeasureForm();
  else if (to === 'form:test') openTestForm();
  else if (to === 'backup') exportBackupFlow();
  else if (to.startsWith('kcal:')) applyCalibration(Number(to.slice(5)));
  else if (to === 'maint:on') setMaintenance(true);
  else if (to === 'maint:off') setMaintenance(false);
  else go(to);
}
