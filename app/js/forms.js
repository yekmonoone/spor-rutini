// Kayıt formları (günlük, padel, ölçüm, güç testi) ve yedekleme akışları.
import { state, saveDaily, deleteDaily, saveRecord, deleteRecord, dumpRaw, importBackup, updateMeta } from './store.js';
import { h, openSheet, confirmSheet, toast, field, numInput, textInput, segmented, chips, checkbox } from './ui.js';
import { dateKey, parseNum, uid, fmtDate, fmtNum, addDays } from './util.js';
import { PAIN_AREAS } from './rules.js';
import { buildBackup, backupFileName, validateBackup, countRecords } from './backup.js';
import { EX } from './exercises.js';
import { stopwatch } from './timer.js';
import { whtr } from './targets.js';
import { isIOS, isTouch } from './env.js';

const SCALE = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v), allowNone: true }));

function dateInput(value) {
  return h('input', { type: 'date', class: 'input', value, max: dateKey() });
}

/** Aralık dışı değerleri reddeder. Geçerliyse sayı ya da null döner; geçersizse hata fırlatır. */
function readNum(input, { label, min, max, integer = false }) {
  const raw = input.value.trim();
  if (raw === '') return null;
  const n = parseNum(raw);
  if (n == null || n < min || n > max) throw new Error(`${label}: ${min}–${max} arasında bir değer gir.`);
  return integer ? Math.round(n) : Math.round(n * 10) / 10;
}

function saveBtn(onSave) {
  return h('button', { type: 'button', class: 'btn primary', text: 'Kaydet', onClick: onSave });
}

/* ---------- Günlük kayıt ---------- */
export function openDailyForm(date = dateKey()) {
  const rec = state.daily[date] ?? {};
  const p = state.profile ?? {};
  const dateIn = dateInput(date);
  const weight = numInput({ value: rec.weight, decimal: true, placeholder: 'ör. 79,5' });
  const steps = numInput({ value: rec.steps, placeholder: 'ör. 8000' });
  const sleep = numInput({ value: rec.sleepH, decimal: true, placeholder: 'ör. 7,5' });
  const protein = numInput({ value: rec.proteinG, placeholder: p.proteinMin ? `hedef ${p.proteinMin}–${p.proteinMax}` : 'gram' });
  const walked = checkbox('Yürüyüş yaptım', !!rec.walked);
  const brisk = checkbox('Yürüyüşte tempolu bölüm yaptım (10–20 dk)', !!rec.brisk);
  const note = textInput({ value: rec.note ?? '', placeholder: 'İsteğe bağlı not', multiline: true });

  let sheet;
  const reopen = (d) => {
    if (!d || d === date) return;
    sheet.close();
    openDailyForm(d);
  };
  dateIn.addEventListener('change', () => reopen(dateIn.value));
  // Geçmiş güne hızlı geçiş: gece 00.00'dan sonra dünün adımını girmek için
  const now = dateKey();
  const quickDays = segmented([0, 1, 2].map((n) => {
    const d = addDays(now, -n);
    return { value: d, label: n === 0 ? 'Bugün' : n === 1 ? 'Dün' : fmtDate(d) };
  }), date, reopen);
  quickDays.classList.add('wrap');

  const save = async () => {
    try {
      const values = {
        weight: readNum(weight, { label: 'Kilo', min: 30, max: 250 }),
        steps: readNum(steps, { label: 'Adım', min: 0, max: 100000, integer: true }),
        sleepH: readNum(sleep, { label: 'Uyku', min: 0, max: 16 }),
        proteinG: readNum(protein, { label: 'Protein', min: 0, max: 400, integer: true }),
        walked: walked.input.checked || brisk.input.checked,
        brisk: brisk.input.checked,
        note: note.value.trim(),
      };
      const empty = values.weight == null && values.steps == null && values.sleepH == null && values.proteinG == null && !values.walked && !values.note;
      if (empty && !state.daily[date]) { sheet.close(); return; }
      await saveDaily(date, values);
      sheet.close();
      toast('Günlük kayıt kaydedildi ✓');
    } catch (err) {
      toast(err.message);
    }
  };

  const actions = [saveBtn(save)];
  if (state.daily[date]) {
    actions.unshift(h('button', {
      type: 'button', class: 'btn danger-ghost', text: 'Sil', onClick: async () => {
        if (await confirmSheet({ title: 'Günlük kaydı sil', message: `${fmtDate(date)} tarihli kayıt silinsin mi?`, confirmLabel: 'Sil', danger: true })) {
          await deleteDaily(date);
          sheet.close();
          toast('Silindi');
        }
      },
    }));
  }

  sheet = openSheet({
    title: date === now ? 'Günlük kayıt' : `Günlük kayıt · ${fmtDate(date)}`,
    content: h('div', { class: 'form' },
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Gün' }), quickDays),
      field('Başka bir tarih', dateIn),
      h('div', { class: 'grid2' },
        field('Kilo (kg)', weight, 'Sabah, tuvaletten sonra, aç'),
        field('Adım', steps),
        field('Uyku (saat)', sleep, 'Hedef 7,5+'),
        field('Protein (g)', protein, rec.meals && Object.keys(rec.meals).length
          ? `Öğünlerden gelen: ~${Object.values(rec.meals).reduce((a, m) => a + (m?.protein ?? 0), 0)} g`
          : 'Yaklaşık yeterli')),
      walked,
      brisk,
      field('Not', note)),
    actions,
  });
}

/* ---------- Padel ---------- */
export function openPadelForm(rec = null) {
  const r = rec ?? { id: uid(), date: dateKey(), durationMin: 60, kind: 'lesson', feel: null, pain: [] };
  const dateIn = dateInput(r.date);
  const dur = numInput({ value: r.durationMin, placeholder: 'dk' });
  const kind = segmented([{ value: 'lesson', label: 'Ders' }, { value: 'match', label: 'Maç' }], r.kind ?? 'lesson');
  const feel = segmented(SCALE, r.feel ?? null);
  const pain = chips(Object.entries(PAIN_AREAS).map(([value, label]) => ({ value, label })), r.pain ?? []);
  const note = textInput({ value: r.note ?? '', placeholder: 'Ne çalıştınız, nasıl geçti?', multiline: true });
  let sheet;

  const save = async () => {
    try {
      if (!dateIn.value) throw new Error('Tarih seç.');
      await saveRecord('padel', {
        ...r,
        date: dateIn.value,
        durationMin: readNum(dur, { label: 'Süre', min: 5, max: 300, integer: true }),
        kind: kind.getValue(),
        feel: feel.getValue(),
        pain: pain.getValue(),
        note: note.value.trim(),
      });
      sheet.close();
      toast('Padel kaydedildi 🎾');
    } catch (err) {
      toast(err.message);
    }
  };

  const actions = [saveBtn(save)];
  if (rec) {
    actions.unshift(h('button', {
      type: 'button', class: 'btn danger-ghost', text: 'Sil', onClick: async () => {
        if (await confirmSheet({ title: 'Padel kaydını sil', message: 'Bu kayıt silinsin mi?', confirmLabel: 'Sil', danger: true })) {
          await deleteRecord('padel', rec.id);
          sheet.close();
          toast('Silindi');
        }
      },
    }));
  }

  sheet = openSheet({
    title: rec ? 'Padel kaydı' : 'Padel ekle',
    content: h('div', { class: 'form' },
      h('div', { class: 'grid2' }, field('Tarih', dateIn), field('Süre (dk)', dur, 'İlk haftalar ≤ 60 dk')),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Tür' }), kind),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Nasıldı? (1–5)' }), feel),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Ağrı oldu mu?' }), pain,
        h('div', { class: 'hint', text: 'Tekrarlayan ağrıda uygulama seni uyarır.' })),
      field('Not', note)),
    actions,
  });
}

/* ---------- Ölçüm ---------- */
export function openMeasureForm(rec = null) {
  const r = rec ?? { id: uid(), date: dateKey(), waistCm: null, photo: false };
  const dateIn = dateInput(r.date);
  const waist = numInput({ value: r.waistCm, decimal: true, placeholder: 'ör. 92,5' });
  const photo = checkbox('Aylık fotoğrafımı da çektim (telefonda kalır)', !!r.photo);
  const ratioHint = h('div', { class: 'hint' });
  const showRatio = () => {
    const w = whtr(parseNum(waist.value), state.profile?.heightCm);
    ratioHint.textContent = w ? `Bel/boy ${fmtNum(w.ratio, 2)} (${w.label}) · sağlıklı aralık için bel < ${fmtNum(w.targetWaist)} cm` : '';
  };
  waist.addEventListener('input', showRatio);
  showRatio();
  const note = textInput({ value: r.note ?? '', placeholder: 'İsteğe bağlı', multiline: true });
  let sheet;

  const save = async () => {
    try {
      if (!dateIn.value) throw new Error('Tarih seç.');
      const waistCm = readNum(waist, { label: 'Bel çevresi', min: 40, max: 200 });
      if (waistCm == null && !photo.input.checked) throw new Error('Bel çevresini gir ya da fotoğrafı işaretle.');
      await saveRecord('measurements', { ...r, date: dateIn.value, waistCm, photo: photo.input.checked, note: note.value.trim() });
      sheet.close();
      toast('Ölçüm kaydedildi 📏');
    } catch (err) {
      toast(err.message);
    }
  };

  const actions = [saveBtn(save)];
  if (rec) {
    actions.unshift(h('button', {
      type: 'button', class: 'btn danger-ghost', text: 'Sil', onClick: async () => {
        if (await confirmSheet({ title: 'Ölçümü sil', message: 'Bu ölçüm silinsin mi?', confirmLabel: 'Sil', danger: true })) {
          await deleteRecord('measurements', rec.id);
          sheet.close();
          toast('Silindi');
        }
      },
    }));
  }

  sheet = openSheet({
    title: rec ? 'Ölçüm' : 'Ölçüm ekle',
    content: h('div', { class: 'form' },
      field('Tarih', dateIn),
      field('Bel çevresi (cm)', waist, 'Sabah, göbek hizasından, nefes verdikten sonra; mezura gergin ama sıkmadan.'),
      ratioHint,
      photo,
      field('Not', note)),
    actions,
  });
}

/* ---------- Yedekleme ---------- */
export async function exportBackupFlow() {
  try {
    const backup = buildBackup(await dumpRaw());
    const name = backupFileName();
    const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
    if ((isIOS() || isTouch()) && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Spor Rutini yedeği' });
    } else {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    await updateMeta({ lastBackupAt: dateKey() });
    toast('Yedek hazır ✓');
  } catch (err) {
    if (err?.name === 'AbortError') return; // paylaşım penceresi kapatıldı
    console.error(err);
    toast(`Yedek alınamadı: ${err?.message ?? err}`);
  }
}

export function importBackupFlow() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      validateBackup(obj);
      const when = obj.exportedAt ? fmtDate(obj.exportedAt.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : 'bilinmiyor';
      const ok = await confirmSheet({
        title: 'Yedekten geri yükle',
        message: `Yedek tarihi: ${when}\nKayıt sayısı: ${fmtNum(countRecords(obj.data), 0)}\n\nBu cihazdaki mevcut verilerin yerini alacak. Devam edilsin mi?`,
        confirmLabel: 'Geri yükle',
        danger: true,
      });
      if (!ok) return;
      await importBackup(obj);
      toast('Yedek geri yüklendi ✓');
      location.hash = '#/bugun';
    } catch (err) {
      toast(err instanceof SyntaxError ? 'Dosya okunamadı: geçerli bir yedek değil.' : err.message);
    }
  });
  document.body.append(input);
  input.click();
}

/* ---------- Güç testi (4 haftada bir, ~5 dk) ---------- */
export function openTestForm(rec = null) {
  const r = rec ?? { id: uid(), date: dateKey(), kind: 'test' };
  const prev = [...state.measurements].reverse().find((m) => m.kind === 'test' && m.id !== r.id);
  const dateIn = dateInput(r.date);
  const levels = EX.pushup.variants;
  const level = segmented(levels.map((v) => ({ value: v, label: v })), r.pushupLevel ?? prev?.pushupLevel ?? levels[2]);
  level.classList.add('wrap');
  const pushReps = numInput({ value: r.pushupReps ?? null, placeholder: 'tekrar' });
  const plank = numInput({ value: r.plankSec ?? null, placeholder: 'saniye' });
  const squat = numInput({ value: r.squat60 ?? null, placeholder: 'tekrar' });
  const note = textInput({ value: r.note ?? '', placeholder: 'İsteğe bağlı', multiline: true });

  const watches = [];
  function timerBtn(input, { limit = null, idle }) {
    const sw = stopwatch();
    watches.push(sw);
    const b = h('button', { type: 'button', class: 'btn small', text: idle });
    const stopIt = () => {
      const sec = sw.stop();
      b.textContent = idle;
      return sec;
    };
    b.addEventListener('click', () => {
      if (sw.running) {
        const sec = stopIt();
        if (!limit) input.value = String(sec);
        return;
      }
      sw.start((s) => {
        if (limit) {
          const left = Math.max(0, limit - s);
          b.textContent = `⏱ ${left} sn — durdur`;
          if (left === 0) {
            stopIt();
            navigator.vibrate?.(400);
            toast('Süre doldu — tekrar sayını yaz');
            input.focus();
          }
        } else b.textContent = `⏱ ${s} sn — durdur`;
      });
    });
    return b;
  }

  let sheet;
  const save = async () => {
    try {
      if (!dateIn.value) throw new Error('Tarih seç.');
      const pushupReps = readNum(pushReps, { label: 'Şınav', min: 0, max: 200, integer: true });
      const plankSec = readNum(plank, { label: 'Plank', min: 0, max: 900, integer: true });
      const squat60 = readNum(squat, { label: 'Squat', min: 0, max: 150, integer: true });
      if (pushupReps == null && plankSec == null && squat60 == null) throw new Error('En az bir test sonucunu gir.');
      await saveRecord('measurements', {
        ...r, kind: 'test', date: dateIn.value,
        pushupLevel: pushupReps == null ? null : level.getValue(), pushupReps, plankSec, squat60, note: note.value.trim(),
      });
      sheet.close();
      toast('Güç testi kaydedildi 🏅');
    } catch (err) {
      toast(err.message);
    }
  };

  const actions = [saveBtn(save)];
  if (rec) {
    actions.unshift(h('button', {
      type: 'button', class: 'btn danger-ghost', text: 'Sil', onClick: async () => {
        if (await confirmSheet({ title: 'Testi sil', message: 'Bu test silinsin mi?', confirmLabel: 'Sil', danger: true })) {
          await deleteRecord('measurements', rec.id);
          sheet.close();
          toast('Silindi');
        }
      },
    }));
  }

  const last = (v, unit = '') => (prev && v != null ? `Geçen test: ${v}${unit}` : null);
  sheet = openSheet({
    title: rec ? 'Güç testi' : 'Güç testi (~5 dk)',
    content: h('div', { class: 'form' },
      h('p', { class: 'muted', text: 'Isındıktan sonra, aralarda 1–2 dk dinlenerek yap. Her seferinde aynı koşullar (saat, zemin) karşılaştırmayı anlamlı kılar.' }),
      field('Tarih', dateIn),
      h('div', { class: 'field' },
        h('label', { text: 'Şınav seviyesi' }), level,
        h('div', { class: 'hint', text: 'Form bozulmadan 10+ yapabildiğin en zor seviye.' })),
      field('Şınav — temiz tekrar (form bozulunca dur)', pushReps, last(prev?.pushupReps == null ? null : `${prev.pushupLevel ?? ''} ${prev.pushupReps}`.trim())),
      field('Plank — maksimum süre (sn)', plank, last(prev?.plankSec, ' sn') ?? 'Kalça düşünce ya da bel çukurlaşınca bitir.'),
      timerBtn(plank, { idle: '⏱ Kronometreyi başlat' }),
      field('Squat — 1 dakikada tekrar', squat, last(prev?.squat60) ?? 'Kalça diz hizasına insin, tam kalk.'),
      timerBtn(squat, { limit: 60, idle: '⏱ 60 sn sayacı başlat' }),
      field('Not', note)),
    actions,
    onClose: () => { for (const w of watches) if (w.running) w.stop(); },
  });
}
