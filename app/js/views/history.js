// Geçmiş: tüm kayıtlar tarih sırasıyla; dokununca düzenleme / silme.
import { state, deleteRecord } from '../store.js';
import { h, btn, segmented, openSheet, confirmSheet, toast } from '../ui.js';
import { EX, PHASES, resistanceText, unitSuffix } from '../program.js';
import { PAIN_AREAS } from '../rules.js';
import { addDays, fmtDate, fmtDateLong, fmtNum } from '../util.js';
import { today } from '../context.js';
import { openDailyForm, openPadelForm, openMeasureForm, openTestForm } from '../forms.js';
import { editWorkout, EFFORTS } from './active.js';

let filter = 'all';
let windowDays = 60;

const KIND_ORDER = { workout: 0, padel: 1, measure: 2, daily: 3 };

function doneSets(w) {
  return (w.exercises ?? []).reduce((n, e) => n + (e.sets ?? []).filter((s) => s.done).length, 0);
}

function openWorkoutDetail(w) {
  const rows = (w.exercises ?? []).map((e) => {
    const ex = EX[e.exerciseId];
    const sets = (e.sets ?? []).filter((s) => s.done);
    const load = [e.variant, resistanceText(e.resistance)].filter(Boolean).join(', ');
    const rir = sets.some((s) => s.rir != null) ? ` (RIR ${sets.map((s) => (s.rir ?? '–')).join(', ')})` : '';
    return h('li', { class: sets.length ? '' : 'muted' },
      h('strong', { text: `${ex?.name ?? e.name ?? e.exerciseId}${e.swappedFrom ? ` (${EX[e.swappedFrom]?.name ?? e.swappedFrom} yerine)` : ''}` }),
      h('div', { class: 'small', text: sets.length ? `${sets.map((s) => s.reps).join(' · ')}${unitSuffix(e.unit)}${rir}${load ? ` — ${load}` : ''}` : 'yapılmadı' }));
  });
  let sheet;
  sheet = openSheet({
    title: `Gün ${w.day} · ${fmtDate(w.date, { day: 'numeric', month: 'long' })}`,
    content: h('div', null,
      h('p', { class: 'muted', text: `${PHASES[w.phase]?.label ?? ''} · ${w.durationMin ? `${w.durationMin} dk · ` : ''}${doneSets(w)} set${w.warmupDone ? ' · ısınma ✓' : ''}${w.cooldownDone ? ' · soğuma ✓' : ''}` }),
      (w.improvements ?? []).length
        ? h('div', { class: 'wins' }, h('strong', { text: '🏆 Geçen sefere göre ilerleme' }), h('ul', null, w.improvements.map((t) => h('li', { text: t }))))
        : null,
      h('ul', { class: 'detail-list' }, rows),
      w.note ? h('p', { class: 'pre', text: `Not: ${w.note}` }) : null),
    actions: [
      h('button', {
        type: 'button', class: 'btn danger-ghost', text: 'Sil', onClick: async () => {
          if (await confirmSheet({ title: 'Antrenmanı sil', message: 'Bu antrenman kaydı silinsin mi?', confirmLabel: 'Sil', danger: true })) {
            await deleteRecord('workouts', w.id);
            sheet.close();
            toast('Silindi');
          }
        },
      }),
      btn('Düzenle', () => { sheet.close(); editWorkout(w); }, 'primary'),
    ],
  });
}

function entryRow(entry) {
  const r = entry.rec;
  let icon;
  let title;
  let sub;
  let onClick;
  if (entry.kind === 'workout') {
    icon = '💪';
    title = r.day === 'A' || r.day === 'B' ? `Gün ${r.day} antrenmanı` : 'Antrenman';
    const pain = (r.pain ?? []).map((k) => PAIN_AREAS[k]?.toLocaleLowerCase('tr-TR')).filter(Boolean);
    const effort = EFFORTS.find((e) => e.value === r.effort)?.label;
    sub = [r.durationMin ? `${r.durationMin} dk` : null, `${doneSets(r)} set`, PHASES[r.phase]?.label,
      effort ? effort.toLocaleLowerCase('tr-TR') : null, pain.length ? `ağrı: ${pain.join(', ')}` : null].filter(Boolean).join(' · ');
    onClick = () => openWorkoutDetail(r);
  } else if (entry.kind === 'daily') {
    icon = '📝';
    title = 'Günlük kayıt';
    sub = [
      r.weight != null ? `${fmtNum(r.weight)} kg` : null,
      r.steps != null ? `${fmtNum(r.steps, 0)} adım` : null,
      r.sleepH != null ? `${fmtNum(r.sleepH)} sa uyku` : null,
      r.proteinG != null ? `${fmtNum(r.proteinG, 0)} g protein` : null,
      r.energy ? `enerji ${r.energy}/5` : null,
      r.brisk ? 'tempolu yürüyüş' : r.walked ? 'yürüyüş' : null,
      r.workoutSkipped ? 'antrenman olmadı' : null,
      r.meals && Object.keys(r.meals).length ? `${Object.keys(r.meals).length} öğün işaretli` : null,
    ].filter(Boolean).join(' · ') || (r.note ? 'not' : '—');
    onClick = () => openDailyForm(r.date);
  } else if (entry.kind === 'padel') {
    icon = '🎾';
    title = r.kind === 'match' ? 'Padel maçı' : 'Padel dersi';
    const pain = (r.pain ?? []).map((k) => PAIN_AREAS[k]?.toLocaleLowerCase('tr-TR')).filter(Boolean);
    sub = [r.durationMin ? `${r.durationMin} dk` : null, r.feel ? `his ${r.feel}/5` : null, pain.length ? `ağrı: ${pain.join(', ')}` : null].filter(Boolean).join(' · ') || '—';
    onClick = () => openPadelForm(r);
  } else if (r.kind === 'test') {
    icon = '🏅';
    title = 'Güç testi';
    sub = [r.pushupReps != null ? `şınav ${r.pushupLevel ? `(${r.pushupLevel.toLocaleLowerCase('tr-TR')}) ` : ''}${r.pushupReps}` : null,
      r.plankSec != null ? `plank ${r.plankSec} sn` : null, r.squat60 != null ? `squat ${r.squat60}/dk` : null].filter(Boolean).join(' · ') || '—';
    onClick = () => openTestForm(r);
  } else {
    icon = '📏';
    title = 'Ölçüm';
    sub = [r.waistCm != null ? `bel ${fmtNum(r.waistCm)} cm` : null, r.photo ? 'fotoğraf ✓' : null].filter(Boolean).join(' · ') || '—';
    onClick = () => openMeasureForm(r);
  }
  return h('button', { type: 'button', class: 'entry', onClick },
    h('span', { class: 'entry-icon', 'aria-hidden': 'true', text: icon }),
    h('span', { class: 'entry-main' }, h('strong', { text: title }), h('span', { class: 'muted small', text: sub })),
    h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
}

export function renderHistory(root) {
  const all = [
    ...state.workouts.map((rec) => ({ kind: 'workout', date: rec.date, rec })),
    ...Object.values(state.daily).map((rec) => ({ kind: 'daily', date: rec.date, rec })),
    ...state.padel.map((rec) => ({ kind: 'padel', date: rec.date, rec })),
    ...state.measurements.map((rec) => ({ kind: 'measure', date: rec.date, rec })),
  ].filter((e) => filter === 'all' || e.kind === filter)
    .sort((a, b) => (a.date === b.date ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.date < b.date ? 1 : -1));

  const cutoff = addDays(today(), -windowDays);
  const shown = all.filter((e) => e.date >= cutoff);
  const rerender = () => { root.replaceChildren(); renderHistory(root); };

  const seg = segmented([
    { value: 'all', label: 'Tümü' },
    { value: 'workout', label: 'Antrenman' },
    { value: 'daily', label: 'Günlük' },
    { value: 'padel', label: 'Padel' },
    { value: 'measure', label: 'Ölçüm' },
  ], filter, (v) => { filter = v ?? 'all'; rerender(); });
  seg.classList.add('scroll-x');
  seg.setAttribute('aria-label', 'Kayıt türü');

  root.append(
    h('header', { class: 'page-head' }, h('div', null, h('h1', { text: 'Geçmiş' }), h('p', { class: 'muted', text: `${all.length} kayıt` }))),
    h('div', { class: 'filter-row' }, seg));

  if (!shown.length) {
    root.append(h('section', { class: 'card' }, h('p', { class: 'empty', text: all.length ? 'Bu aralıkta kayıt yok.' : 'Henüz kayıt yok. Bugün ekranından ilk kaydını ekle.' })));
  }
  let lastDate = null;
  let group = null;
  for (const e of shown) {
    if (e.date !== lastDate) {
      lastDate = e.date;
      group = h('section', { class: 'card day-group' }, h('h3', { class: 'date-head', text: fmtDateLong(e.date) }));
      root.append(group);
    }
    group.append(entryRow(e));
  }
  if (all.length > shown.length) {
    root.append(btn('Daha eski kayıtları göster', () => { windowDays += 120; rerender(); }, 'ghost block'));
  }
}
