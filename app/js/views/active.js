// Aktif antrenman ekranı: plan önceden dolu, set set kayıt, dinlenme sayacı. Taslak sürekli kaydedilir.
// Süperset: aynı numaralı iki hareket sırayla (kısa geçiş), tur bitince dinlenme. Ekran açık kalır (Wake Lock).
import { state, setKV, saveRecord } from '../store.js';
import { h, appendChildren, btn, confirmSheet, toast, numInput, field, checkbox, openSheet, segmented, chips } from '../ui.js';
import { PAIN_AREAS } from '../rules.js';
import {
  EX, programFor, shortItems, BAND_LEVELS, warmupFor, COOLDOWN, plannedSets, programWeek, rirTarget,
  defaultResistance, resistanceText, targetText, progressionHint, unitSuffix,
  alternativesFor, pairLabels, restAfterSet,
} from '../program.js';
import { videoUrl } from '../exercises.js';
import { lastPerformance, progressionDue, workoutImprovements } from '../stats.js';
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
    pair: item.pair ?? null,
    prep: !!item.prep,
    variant,
    resistance,
    sets: Array.from({ length: n }, () => ({ reps: null, rir: null, done: false })),
  };
}

/** Hareketi o günlük alternatifle değiştirir (set sayısı, hedef aralık ve süperset yeri korunur). */
function swapExercise(e, newId, workouts) {
  const fresh = buildExercise({ ex: newId, sets: e.sets.length, min: e.min, max: e.max, pair: e.pair, prep: e.prep }, 2, workouts);
  Object.assign(e, { ...fresh, plannedSets: e.plannedSets, sets: e.sets.map(() => ({ reps: null, rir: null, done: false })), swappedFrom: e.swappedFrom ?? e.exerciseId });
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

/** short: true → ~20 dk'lık kısa antrenman (ilk 4 ana hareket, 2'şer set). */
export async function startWorkout(day, { short = false } = {}) {
  if (!(await confirmReplaceDraft())) return;
  const t = today();
  const week = Math.max(1, programWeek(startKey(), t));
  const phase = state.settings.phase;
  const items = programFor(state.settings)[day];
  const d = {
    id: uid(),
    date: t,
    startedAt: Date.now(),
    day,
    phase,
    programWeek: week,
    short,
    warmup: warmupFor(phase).map(() => false),
    cooldownDone: false,
    note: '',
    exercises: (short ? shortItems(items) : items).map((item) => buildExercise(item, short ? 2 : week, state.workouts)),
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

/** Seviye (varyant) ve direnç girişi. Dambıllı varyantlı harekette ikisi birlikte gösterilir (ör. Bulgar split squat + kg). */
function loadControl(ex, e, persist) {
  const parts = [];
  if (ex.variants) {
    const sel = h('select', { class: 'input', value: e.variant ?? ex.variants[0], onChange: (ev) => { e.variant = ev.target.value; persist(); } },
      ex.variants.map((v) => h('option', { value: v, text: v })));
    parts.push(field('Seviye', sel));
  }
  if (ex.resist === 'band' || ex.resist === 'miniband') {
    const sel = h('select', {
      class: 'input',
      value: String(e.resistance?.level ?? 2),
      onChange: (ev) => { e.resistance = { kind: ex.resist, level: Number(ev.target.value) }; persist(); },
    }, BAND_LEVELS.map((l, i) => h('option', { value: String(i + 1), text: l })));
    parts.push(field(ex.resist === 'miniband' ? 'Mini bant direnci' : 'Bant direnci', sel));
  } else if (ex.resist === 'dumbbell') {
    const inp = numInput({ value: e.resistance?.kg ?? null, decimal: true, placeholder: 'kg' });
    inp.addEventListener('input', () => { e.resistance = { kind: 'dumbbell', kg: parseNum(inp.value) }; persist(); });
    parts.push(field('Dambıl (kg, tek el)', inp));
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : h('div', { class: 'grid2' }, parts);
}

function lastText(ex, last) {
  if (!last) return 'İlk kez yapıyorsun — rahat bir seviyeden başla.';
  const load = [last.variant, resistanceText(last.resistance)].filter(Boolean).join(', ');
  return `Geçen sefer (${fmtDate(last.date)}): ${last.sets.map((s) => s.reps).join(' · ')}${unitSuffix(ex.unit)}${load ? ` — ${load}` : ''}`;
}

export const EFFORTS = [
  { value: 'easy', label: 'Kolay' },
  { value: 'good', label: 'İyi' },
  { value: 'hard', label: 'Çok zor' },
];

/** Bitirme sayfası: ilerleme özeti + kısa geri bildirim (zorluk + ağrı). Kaydet → { effort, pain }, vazgeç → null. */
function finishSheet({ done, total, editing, cooldownDone, effort, pain, improvements = [] }) {
  return new Promise((resolve) => {
    let settled = false;
    let sheet = null;
    const end = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
      sheet?.close();
    };
    const eff = segmented(EFFORTS.map((e) => ({ ...e, allowNone: true })), effort);
    const painChips = chips(Object.entries(PAIN_AREAS).map(([value, label]) => ({ value, label })), pain);
    const summary = done === 0
      ? 'Hiç set işaretlenmedi. Tamamladığın setleri ✓ ile işaretleyebilirsin; yine de kaydedebilirsin.'
      : `${done}/${total} set tamamlandı.${cooldownDone ? '' : ' Sonda kalça fleksör esnetmesini unutma.'}`;
    sheet = openSheet({
      title: editing ? 'Değişiklikleri kaydet' : 'Antrenmanı bitir',
      content: h('div', { class: 'form' },
        h('p', { text: summary }),
        improvements.length
          ? h('div', { class: 'wins' },
            h('strong', { text: `🏆 Geçen sefere göre ilerleme (${improvements.length})` }),
            h('ul', null, improvements.map((x) => h('li', { text: x.text }))))
          : null,
        h('div', { class: 'field' }, h('label', { text: 'Nasıldı?' }), eff,
          h('div', { class: 'hint', text: 'İki antrenman üst üste "çok zor" gelirse uygulama yükü hafifletmeni önerir.' })),
        h('div', { class: 'field' }, h('label', { text: 'Bir yerin ağrıdı mı? (kas yorgunluğu değil, eklem/keskin ağrı)' }), painChips)),
      actions: [
        h('button', { class: 'btn', type: 'button', text: 'Vazgeç', onClick: () => end(null) }),
        h('button', { class: 'btn primary', type: 'button', text: 'Kaydet', onClick: () => end({ effort: eff.getValue() ?? null, pain: painChips.getValue() }) }),
      ],
      onClose: () => end(null),
    });
  });
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
  const cardOf = new Map(); // hareket → kart (otomatik kaydırma için)

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
          if (!allDone()) {
            const idx = d.exercises.indexOf(e);
            const r = restAfterSet(d.exercises, idx, state.settings.restSec ?? 75);
            startRest(r.seconds, { sound: state.settings.sound !== false, label: r.label, done: r.done });
            // Süpersette eş harekete / sıradaki harekete kendiliğinden geç (kaydırma derdi olmasın).
            const target = r.nextIdx >= 0 && r.nextIdx !== idx ? cardOf.get(d.exercises[r.nextIdx]) : null;
            if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
          } else cancelRest();
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

  function openSwap(e) {
    if (e.sets.some((s) => s.done)) {
      toast('Bu harekette set işaretledin; değiştirmek için önce işaretleri kaldır.');
      return;
    }
    const alts = alternativesFor(e.exerciseId, d.phase);
    if (!alts.length) {
      toast('Bu dönemde bu hareketin yerine geçecek bir seçenek yok.');
      return;
    }
    let sheet = null;
    sheet = openSheet({
      title: `${e.name} yerine`,
      content: h('div', { class: 'form' },
        h('p', { class: 'muted small', text: 'Ağrı, eksik ekipman ya da yer sorunu varsa yalnızca bugün için değiştir. Programın kendisi değişmez.' }),
        h('div', { class: 'swap-list' }, alts.map((id) => h('button', {
          type: 'button', class: 'btn block swap-opt',
          onClick: () => {
            swapExercise(e, id, others);
            persist();
            sheet.close();
            renderList();
            cardOf.get(e)?.scrollIntoView({ block: 'start' });
            toast(`Bugün: ${EX[id].name}`);
          },
        }, h('strong', { text: EX[id].name }), h('span', { class: 'muted small', text: ` · ${EX[id].muscle}` }))))),
      actions: [h('button', { type: 'button', class: 'btn', text: 'Vazgeç', onClick: () => sheet.close() })],
    });
  }

  function exerciseCard(e) {
    const ex = EX[e.exerciseId] ?? { name: e.name, how: [], unit: e.unit, resist: 'none' };
    const last = lastPerformance(others, e.exerciseId);
    const due = e.min !== e.max ? progressionDue(others, e.exerciseId) : null;
    const label = pairLabels(d.exercises)[d.exercises.indexOf(e)];
    const video = videoUrl(e.exerciseId);
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
    const swapBtn = h('button', { type: 'button', class: 'btn small ghost', text: '↔ Değiştir', 'aria-label': `${ex.name} hareketini bugün için değiştir` });
    const cardEl = h('section', { class: `card ex-card${label ? ' paired' : ''}` },
      h('div', { class: 'ex-head' },
        h('div', null,
          h('h3', null, label ? h('span', { class: 'pair-tag', text: label }) : null, ex.name),
          h('div', { class: 'muted small', text: `${ex.muscle ?? ''}${e.swappedFrom ? ` · bugün ${EX[e.swappedFrom]?.name ?? ''} yerine` : ''}` })),
        h('span', { class: 'badge', text: targetText({ ex: e.exerciseId, min: e.min, max: e.max }, e.plannedSets) })),
      due ? h('div', { class: 'tag up', text: `↑ Zorlaştırma zamanı: ${progressionHint(e.exerciseId, due)}` }) : null,
      h('details', { class: 'how' },
        h('summary', { text: 'Nasıl yapılır?' }),
        h('ul', null, (ex.how ?? []).map((t) => h('li', { text: t }))),
        ex.easier ? h('p', { class: 'small', text: `Kolaylaştır: ${ex.easier}` }) : null,
        ex.harder ? h('p', { class: 'small', text: `Zorlaştır: ${ex.harder}` }) : null,
        video ? h('a', { class: 'video-link small', href: video, target: '_blank', rel: 'noopener noreferrer', text: '▶ Videoda izle (YouTube araması)' }) : null),
      loadControl(ex, e, persist),
      h('div', { class: 'muted small last', text: lastText(ex, last) }),
      setsWrap,
      h('div', { class: 'set-tools' },
        btn('+ Set', () => { e.sets.push({ reps: null, rir: null, done: false }); renderSets(); persist(); }, 'small ghost'),
        btn('− Set', () => { if (e.sets.length > 1) { e.sets.pop(); renderSets(); persist(); } }, 'small ghost'),
        d.editingId ? null : swapBtn));
    swapBtn.addEventListener('click', () => openSwap(e));
    cardOf.set(e, cardEl);
    return cardEl;
  }

  /** Süperset başlığı: çiftin ilk kartından önce kısa açıklama. */
  function exerciseList() {
    const labels = pairLabels(d.exercises);
    const out = [];
    d.exercises.forEach((e, i) => {
      if (labels[i]?.endsWith('a')) {
        const b = d.exercises[i + 1];
        out.push(h('p', { class: 'pair-note small' },
          h('strong', { text: `🔁 Süperset ${e.pair}: ` }),
          `${e.name} → ${b.name}, sonra dinlen. Tur sayısı kadar tekrarla.`));
      }
      out.push(exerciseCard(e));
    });
    return out;
  }
  const listEl = h('div', { class: 'ex-stack' });
  const renderList = () => listEl.replaceChildren(...exerciseList());
  renderList();

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
    const prev = state.workouts.filter((w) => w.id !== d.editingId && w.date <= d.date);
    const improvements = workoutImprovements({ ...d, id: d.editingId ?? d.id }, prev);
    const res = await finishSheet({ done, total, editing: !!d.editingId, cooldownDone: !!d.cooldownDone, effort: d.effort ?? null, pain: d.pain ?? [], improvements });
    if (!res) return;
    d.effort = res.effort;
    d.pain = res.pain;
    cancelRest();
    const rec = deepCopy(d);
    delete rec.editingId;
    rec.warmupDone = d.warmup.every(Boolean);
    rec.improvements = improvements.map((x) => x.text);
    if (d.editingId) {
      rec.id = d.editingId;
    } else {
      rec.finishedAt = Date.now();
      rec.durationMin = Math.max(1, Math.round((rec.finishedAt - rec.startedAt) / 60000));
    }
    clearTimeout(saveTimer);
    await setKV('draft', null, { silent: true });
    await saveRecord('workouts', rec);
    toast(d.editingId ? 'Antrenman güncellendi ✓'
      : improvements.length ? `Antrenman kaydedildi 💪 · ${improvements.length} harekette ilerleme 🏆` : 'Antrenman kaydedildi 💪');
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
        h('h1', { text: `Gün ${d.day}${d.short ? ' · kısa (~20 dk)' : ''}` }),
        h('p', { class: 'muted', text: `${fmtDate(d.date, { day: 'numeric', month: 'long' })} · Hafta ${d.programWeek ?? 1}` })),
      elapsed),
    h('div', { class: 'notice' }, h('strong', { text: rir.label }), h('span', { text: ` — ${rir.hint}` })),
    h('section', { class: 'card' },
      h('details', { class: 'how', open: !d.warmup.some(Boolean) && !d.editingId },
        h('summary', { text: 'Isınma (5 dk)' }),
        h('p', { class: 'muted small', text: 'Yürüyüşten hemen sonra başlıyorsan ilk iki maddeyi atlayabilirsin.' }),
        h('div', { class: 'checks' }, warmChecks))),
    listEl,
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

  // Antrenman boyunca ekran kararmasın (iOS 18.4+ ana ekran uygulamasında da çalışır; desteklenmezse sessizce geçer).
  let wakeLock = null;
  const lockScreen = async () => {
    if (d.editingId || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') lockScreen(); };
  lockScreen();
  document.addEventListener('visibilitychange', onVisible);

  return {
    sticky: true,
    unmount() {
      clearInterval(iv);
      clearTimeout(saveTimer);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release?.().catch(() => {});
      wakeLock = null;
      if (state.draft === d) setKV('draft', d, { silent: true });
    },
  };
}
