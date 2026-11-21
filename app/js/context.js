// Ekranların ortak kullandığı türetilmiş değerler ve gezinme.
import { state } from './store.js';
import { dateKey } from './util.js';
import { programStartKey } from './program.js';
import { evaluateAlerts } from './rules.js';
import { openDailyForm, openPadelForm, openMeasureForm, exportBackupFlow } from './forms.js';

export const today = () => dateKey();

export function startKey() {
  return programStartKey(state.settings, state.profile?.createdDay ?? today());
}

export function ruleCtx(t = today()) {
  return {
    profile: state.profile,
    settings: state.settings,
    meta: state.meta,
    workouts: state.workouts,
    padel: state.padel,
    measurements: state.measurements,
    daily: state.daily,
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

export function runAction(to) {
  if (to === 'form:daily') openDailyForm();
  else if (to === 'form:padel') openPadelForm();
  else if (to === 'form:measure') openMeasureForm();
  else if (to === 'backup') exportBackupFlow();
  else go(to);
}
