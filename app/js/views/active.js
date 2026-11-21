// Aktif antrenman ekranı: plan önceden dolu, set set kayıt, dinlenme sayacı. Taslak sürekli kaydedilir.
import { state, setKV, saveRecord } from '../store.js';
import { h, appendChildren, btn, confirmSheet, toast, numInput, field, checkbox } from '../ui.js';
import {
  EX, programFor, BAND_LEVELS, warmupFor, COOLDOWN, plannedSets, programWeek, rirTarget,
  defaultResistance, resistanceText, targetText, progressionHint, unitSuffix,
} from '../program.js';
import { lastPerformance, progressionDue } from '../stats.js';
import { deepCopy, fmtClock, fmtDate, parseNum, uid } from '../util.js';
import { today, startKey, go } from '../context.js';
import { startRest, cancelRest, primeAudio, stopwatch } from '../timer.js';

function buildExercise(item, week, workouts) {
  const ex = EX[item.ex];
  const last = lastPerformance(workouts, item.ex);
  const n = plannedSets(item, week);
  let variant = null;
  if (ex.variants) variant = last?.variant && ex.variants.includes(last.variant) ? last.variant : ex.variants[ex.defaultVariant ?? 0];
  let resistance = null;
  if (ex.resist !== 'none') resistance = last?.resistance?.kind === ex.resist ? deepCopy(last.resistance) : defaultResistance(ex);
  return {
    exerciseId: item.ex,
    name: ex.name,
    plannedSets: n,
    min: item.min,
    max: item.max,
    unit: ex.unit,
    side: ex.side ?? null,
    variant,
    resistance,
    sets: Array.from({ length: n }, () => ({ reps: null, rir: null, done: false })),
  };
}

async function confirmReplaceDraft() {
  if (!state.draft) return true;
  const ok = await confirmSheet({
    title: 'Devam eden antrenman var',
    message: `Gün ${state.draft.day} antrenmanı henüz bitmedi. Onu silip yenisini başlatmak ister misin?`,
    confirmLabel: 'Sil ve yenisini başlat',
    cancelLabel: 'Devam edene dön',
    danger: true,
  });
  if (!ok) go('/antrenman/aktif');
  return ok;
}

export async function startWorkout(day) {
  if (!(await confirmReplaceDraft())) return;
  const t = today();
  const week = Math.max(1, programWeek(startKey(), t));
  const phase = state.settings.phase;
  const d = {
    id: uid(),
    date: t,
    startedAt: Date.now(),
    day,
    phase,
    programWeek: week,
    warmup: warmupFor(phase).map(() => false),
    cooldownDone: false,
    note: '',
    exercises: programFor(state.settings)[day].map((item) => buildExercise(item, week, state.workouts)),
  };
  await setKV('draft', d, { silent: true });
  go('/antrenman/aktif');
}

export async function editWorkout(rec) {
  if (!(await confirmReplaceDraft())) return;
  const d = deepCopy(rec);
  d.editingId = rec.id;
  if (!Array.isArray(d.warmup)) d.warmup = warmupFor(d.phase).map(() => !!rec.warmupDone);
  await setKV('draft', d, { silent: true });
  go('/antrenman/aktif');
}

function loadControl(ex, e, persist) {
  if (ex.variants) {
    const sel = h('select', { class: 'input', value: e.variant ?? ex.variants[0], onChange: (ev) => { e.variant = ev.target.value; persist(); } },
      ex.variants.map((v) => h('option', { value: v, text: v })));
    return field('Seviye', sel);
  }
  if (ex.resist === 'band' || ex.resist === 'miniband') {
    const sel = h('select', {
      class: 'input',
      value: String(e.resistance?.level ?? 2),
      onChange: (ev) => { e.resistance = { kind: ex.resist, level: Number(ev.target.value) }; persist(); },
    }, BAND_LEVELS.map((l, i) => h('option', { value: String(i + 1), text: l })));
    return field(ex.resist === 'miniband' ? 'Mini bant direnci' : 'Bant direnci', sel);
  }
  if (ex.resist === 'dumbbell') {
    const inp = numInput({ value: e.resistance?.kg ?? null, decimal: true, placeholder: 'kg' });
    inp.addEventListener('input', () => { e.resistance = { kind: 'dumbbell', kg: parseNum(inp.value) }; persist(); });
    return field('Dambıl (kg, tek el)', inp);
  }
  return null;
}

function lastText(ex, last) {
  if (!last) return 'İlk kez yapıyorsun — rahat bir seviyeden başla.';
  const load = [last.variant, resistanceText(last.resistance)].filter(Boolean).join(', ');
  return `Geçen sefer (${fmtDate(last.date)}): ${last.sets.map((s) => s.reps).join(' · ')}${unitSuffix(ex.unit)}${load ? ` — ${load}` : ''}`;
}

export function renderActive(root) {
  const d = state.draft;
  if (!d) { go('/antrenman'); return null; }
  const others = d.editingId ? state.workouts.filter((w) => w.id !== d.editingId) : state.workouts;
  const rir = rirTarget(d.programWeek ?? 1);
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (state.draft === d) setKV('draft', d, { silent: true }); }, 250);
  };
  const allDone = () => d.exercises.every((e) => e.sets.every((s) => s.done));

  const elapsed = h('span', { class: 'badge' });
  const tickElapsed = () => { elapsed.textContent = d.editingId ? 'Düzenleme' : `⏱ ${fmtClock((Date.now() - d.startedAt) / 1000)}`; };
  tickElapsed();
  const iv = setInterval(tickElapsed, 1000);

  function setRow(e, ex, st, si, last) {
    const prev = last?.sets?.[si]?.reps ?? null;
    const ph = prev ?? e.min;
    const unitWord = ex.unit === 'sec' ? 'saniye' : ex.unit === 'steps' ? 'adım' : 'tekrar';
    const input = numInput({ value: st.reps, placeholder: String(ph), label: `Set ${si + 1} ${unitWord}` });
    input.addEventListener('input', () => { st.reps = parseNum(input.value); persist(); });
    const rirSel = h('select', {
      class: 'input compact',
      'aria-label': `Set ${si + 1} RIR (kaç tekrar daha yapabilirdin)`,
      value: st.rir == null ? '' : String(st.rir),
      onChange: (ev) => { st.rir = ev.target.value === '' ? null : Number(ev.target.value); persist(); },
    }, [['', 'RIR'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5+']].map(([v, l]) => h('option', { value: v, text: l })));

    let sw = null;
    let swBtn = null;
    if (ex.unit === 'sec') {
      sw = stopwatch();
      swBtn = h('button', {
        type: 'button', class: 'btn small ghost sw', 'aria-label': 'Kronometre', text: '⏱',
        onClick: () => {
          if (sw.running) {
            const sec = sw.stop();
            st.reps = sec;
            input.value = String(sec);
            swBtn.textContent = '⏱';
            persist();
          } else {
            sw.start((sec) => { swBtn.textContent = `■ ${sec}`; });
          }
        },
      });
    }

    const row = h('div', { class: `set-row${st.done ? ' done' : ''}` });
    const doneBtn = h('button', {
      type: 'button', class: 'check-btn', 'aria-pressed': String(st.done), 'aria-label': `Set ${si + 1} tamamlandı`, text: '✓',
      onClick: () => {
        primeAudio();
        if (!st.done) {
          if (st.reps == null) { st.reps = ph; input.value = String(ph); }
          st.done = true;
          if (!allDone()) startRest(state.settings.restSec ?? 75, { sound: state.settings.sound !== false });
          else cancelRest();
        } else {
          st.done = false;
        }
        doneBtn.setAttribute('aria-pressed', String(st.done));
        row.classList.toggle('done', st.done);
        persist();
      },
    });
    row.append(h('span', { class: 'set-no', text: String(si + 1) }), h('div', { class: 'set-input' }, input, swBtn), rirSel, doneBtn);
    return row;
  }

  function exerciseCard(e) {
    const ex = EX[e.exerciseId] ?? { name: e.name, how: [], unit: e.unit, resist: 'none' };
    const last = lastPerformance(others, e.exerciseId);
    const due = e.min !== e.max ? progressionDue(others, e.exerciseId) : null;
    const setsWrap = h('div', { class: 'sets' });
    const renderSets = () => {
      setsWrap.replaceChildren(
        h('div', { class: 'set-row head' },
          h('span', { text: 'Set' }),
          h('span', { text: ex.unit === 'sec' ? 'Süre (sn)' : ex.unit === 'steps' ? 'Adım' : 'Tekrar' }),
          h('span', { text: 'RIR' }),
          h('span', { text: '' })),
        ...e.sets.map((st, si) => setRow(e, ex, st, si, last)));
    };
    renderSets();
    return h('section', { class: 'card ex-card' },
      h('div', { class: 'ex-head' },
        h('div', null, h('h3', { text: ex.name }), h('div', { class: 'muted small', text: ex.muscle ?? '' })),
        h('span', { class: 'badge', text: targetText({ ex: e.exerciseId, min: e.min, max: e.max }, e.plannedSets) })),
      due ? h('div', { class: 'tag up', text: `↑ Zorlaştırma zamanı: ${progressionHint(e.exerciseId, due)}` }) : null,
      h('details', { class: 'how' },
        h('summary', { text: 'Nasıl yapılır?' }),
        h('ul', null, (ex.how ?? []).map((t) => h('li', { text: t }))),
        ex.easier ? h('p', { class: 'small', text: `Kolaylaştır: ${ex.easier}` }) : null,
        ex.harder ? h('p', { class: 'small', text: `Zorlaştır: ${ex.harder}` }) : null),
      loadControl(ex, e, persist),
      h('div', { class: 'muted small last', text: lastText(ex, last) }),
      setsWrap,
      h('div', { class: 'set-tools' },
        btn('+ Set', () => { e.sets.push({ reps: null, rir: null, done: false }); renderSets(); persist(); }, 'small ghost'),
        btn('− Set', () => { if (e.sets.length > 1) { e.sets.pop(); renderSets(); persist(); } }, 'small ghost')));
  }

  const warm = warmupFor(d.phase);
  if (!Array.isArray(d.warmup) || d.warmup.length !== warm.length) d.warmup = warm.map(() => false);
  const warmChecks = warm.map((label, i) => {
    const c = checkbox(label, d.warmup[i]);
    c.input.addEventListener('change', () => { d.warmup[i] = c.input.checked; persist(); });
    return c;
  });
  const cool = checkbox(COOLDOWN, !!d.cooldownDone);
  cool.input.addEventListener('change', () => { d.cooldownDone = cool.input.checked; persist(); });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Nasıl geçti? (isteğe bağlı)', value: d.note ?? '' });
  note.addEventListener('input', () => { d.note = note.value; persist(); });

  async function finish() {
    const done = d.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const total = d.exercises.reduce((n, e) => n + e.sets.length, 0);
    const ok = await confirmSheet(done === 0
      ? { title: 'Hiç set işaretlenmedi', message: 'Tamamladığın setleri ✓ ile işaretle. Yine de kaydedilsin mi?', confirmLabel: 'Yine de kaydet' }
      : { title: d.editingId ? 'Değişiklikleri kaydet' : 'Antrenmanı bitir', message: `${done}/${total} set tamamlandı.${d.cooldownDone ? '' : '\nSonda kalça fleksör esnetmesini unutma.'}`, confirmLabel: 'Kaydet' });
    if (!ok) return;
    cancelRest();
    const rec = deepCopy(d);
    delete rec.editingId;
    rec.warmupDone = d.warmup.every(Boolean);
    if (d.editingId) {
      rec.id = d.editingId;
    } else {
      rec.finishedAt = Date.now();
      rec.durationMin = Math.max(1, Math.round((rec.finishedAt - rec.startedAt) / 60000));
    }
    clearTimeout(saveTimer);
    await setKV('draft', null, { silent: true });
    await saveRecord('workouts', rec);
    toast(d.editingId ? 'Antrenman güncellendi ✓' : 'Antrenman kaydedildi 💪');
    go(d.editingId ? '/gecmis' : '/bugun');
  }

  async function cancel() {
    const ok = await confirmSheet(d.editingId
      ? { title: 'Düzenlemeden çık', message: 'Yaptığın değişiklikler kaydedilmeyecek.', confirmLabel: 'Çık', danger: true }
      : { title: 'Antrenmanı iptal et', message: 'Bu antrenmandaki girişler silinecek.', confirmLabel: 'İptal et', danger: true });
    if (!ok) return;
    cancelRest();
    clearTimeout(saveTimer);
    await setKV('draft', null, { silent: true });
    go(d.editingId ? '/gecmis' : '/antrenman');
  }

  appendChildren(root, [
    h('header', { class: 'page-head' },
      h('div', null,
        h('h1', { text: `Gün ${d.day}` }),
        h('p', { class: 'muted', text: `${fmtDate(d.date, { day: 'numeric', month: 'long' })} · Hafta ${d.programWeek ?? 1}` })),
      elapsed),
    h('div', { class: 'notice' }, h('strong', { text: rir.label }), h('span', { text: ` — ${rir.hint}` })),
    h('section', { class: 'card' },
      h('details', { class: 'how', open: !d.warmup.some(Boolean) && !d.editingId },
        h('summary', { text: 'Isınma (5 dk)' }),
        h('p', { class: 'muted small', text: 'Yürüyüşten hemen sonra başlıyorsan ilk iki maddeyi atlayabilirsin.' }),
        h('div', { class: 'checks' }, warmChecks))),
    d.exercises.map(exerciseCard),
    h('section', { class: 'card' },
      h('h3', { text: 'Soğuma' }),
      cool,
      h('details', { class: 'how' },
        h('summary', { text: 'Nasıl yapılır?' }),
        h('ul', null, EX.hip_flexor_stretch.how.map((t) => h('li', { text: t }))))),
    h('section', { class: 'card' }, field('Not', note)),
    h('div', { class: 'actions-row sticky-actions' },
      btn(d.editingId ? 'Vazgeç' : 'İptal', cancel, 'danger-ghost'),
      btn(d.editingId ? 'Değişiklikleri kaydet' : 'Antrenmanı bitir', finish, 'primary')),
  ]);

  return {
    sticky: true,
    unmount() {
      clearInterval(iv);
      clearTimeout(saveTimer);
      if (state.draft === d) setKV('draft', d, { silent: true });
    },
  };
}
