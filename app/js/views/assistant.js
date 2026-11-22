// Yapay zekâ asistanı (kopyala-yapıştır modu): hazır mesajı kopyala → seçilen yapay zekâ uygulamasında yapıştır →
// cevabı geri yapıştır. Uygulama cevabın türünü tanır (haftalık odak, gün sonu değişiklikleri, dışarıda seçenekleri,
// yemek planı, program), doğrular, önizler ve onaylanırsa uygular. Uygulanacak öneri yoksa "not" olarak saklanır;
// notlar ve haftalık odak bir sonraki mesaja eklenir (yapay zekâ önceki önerisini görür).
import { state, updateSettings, updateMeta, setKV, saveDaily } from '../store.js';
import { h, appendChildren, btn, card, segmented, toast, confirmSheet } from '../ui.js';
import {
  AI_TARGETS, PROMPT_KINDS, SECTION_LABELS, buildPrompt, promptSections, parseProgram, parseDayChanges,
  parseWeeklyReview, parseEatOut, addCoachNote, currentFocus,
} from '../ai.js';
import { EX, PHASES, DAY_TYPES, targetText, pairLabels } from '../program.js';
import { calibrate } from '../targets.js';
import { IFTHEN_TRIGGERS } from '../ifthen.js';
import { today, startKey, currentAlerts, go, applyCalibration } from '../context.js';
import { extractJson } from '../extract-json.js';
import {
  OUT, SLOTS, SLOT_LABELS, defaultPrefs, mealById, dayTotals, parseMealPlan, withOverride, applyMealToDaily, freeEntry,
} from '../mealplan.js';
import { WEEKDAYS_SHORT, addDays, fmtDate, fmtNum, weekStart } from '../util.js';

let kind = 'review';
let draftQuestion = '';

/** Başka ekrandan asistanı belirli bir türle açmak için (ör. Yemek → "Yapay zekâdan plan iste"). */
export function setAssistantKind(k, question = '') {
  if (PROMPT_KINDS[k]) kind = k;
  draftQuestion = question;
}

const hasKey = (text, keys) => {
  const { obj } = extractJson(text, (o) => o != null && typeof o === 'object' && !Array.isArray(o) && keys.some((k) => k in o));
  return !!obj;
};

/** Yapıştırılan cevap 7 günlük yemek planı mı (yoksa A/B antrenman programı mı)? */
function looksLikeMealPlan(text) {
  const { obj } = extractJson(text, (o) => o != null && typeof o === 'object');
  if (!obj) return false;
  if (Array.isArray(obj)) return true;
  const inner = ['plan', 'mealPlan', 'meal_plan', 'yemek_plani'].map((k) => obj[k]).find((v) => v && typeof v === 'object');
  const root = inner && !Array.isArray(inner) ? inner : obj;
  const days = root.days ?? root.gunler ?? root['günler'] ?? (Array.isArray(inner) ? inner : null);
  if (!days) return false;
  if (Array.isArray(days)) return true;
  return !('A' in days || 'B' in days || 'a' in days || 'b' in days);
}

function dayChangesPreview(res, plan) {
  const line = (c) => {
    const when = `${fmtDate(c.date, { weekday: 'short', day: 'numeric', month: 'short' })}`;
    if (c.type === 'day') return `${when}: gün → ${DAY_TYPES[c.plan]?.label ?? c.plan}`;
    const name = c.meal === null ? 'boş' : c.meal === OUT ? 'dışarıda' : mealById(c.meal, plan)?.name ?? c.meal;
    return `${when} · ${SLOT_LABELS[c.slot]}: ${name}`;
  };
  return h('div', null,
    res.note ? h('p', { class: 'pre', text: res.note }) : null,
    res.changes.length
      ? h('ul', { class: 'rules' }, res.changes.map((c) => h('li', { text: line(c) })))
      : h('p', { class: 'muted', text: 'Değişiklik önerilmedi — plan aynen devam.' }));
}

async function applyDayChanges(res) {
  const t = today();
  const cutoff = addDays(t, -14);
  const overrides = Object.fromEntries(Object.entries(state.settings.scheduleOverrides ?? {}).filter(([d]) => d >= cutoff));
  let mp = state.mealplan;
  for (const c of res.changes) {
    if (c.type === 'day') overrides[c.date] = c.plan;
    else mp = withOverride(mp, c.date, c.slot, c.meal, t);
  }
  await updateSettings({ scheduleOverrides: overrides });
  if (mp && mp !== state.mealplan) await setKV('mealplan', { ...mp, updatedAt: new Date().toISOString() });
}

function mealPlanPreview(p) {
  const plan = { days: p.days, customMeals: p.customMeals };
  const name = (v) => (v === OUT ? 'Dışarıda' : mealById(v, plan)?.name ?? '—');
  return h('div', null,
    p.note ? h('p', { class: 'pre', text: p.note }) : null,
    h('ul', { class: 'rules' }, p.days.map((d, i) => h('li', {
      text: `${WEEKDAYS_SHORT[i]}: ${SLOTS.filter((s) => d[s]).map((s) => name(d[s])).join(' · ')} — ~${dayTotals(d, plan).mid} g protein`,
    }))),
    Object.keys(p.customMeals).length ? h('p', { class: 'muted small', text: `${Object.keys(p.customMeals).length} yeni öğün tarifi eklenecek.` }) : null);
}

function programPreview(p) {
  const list = (items) => {
    const labels = pairLabels(items);
    return h('ul', { class: 'rules' }, items.map((it, i) => h('li', { text: `${labels[i] ? `${labels[i]} · ` : ''}${EX[it.ex].name} — ${targetText(it, it.sets)}${it.prep ? ' (hazırlık)' : ''}` })));
  };
  return h('div', null,
    p.note ? h('p', { class: 'pre', text: p.note }) : null,
    h('h4', { text: 'Gün A' }), list(p.A),
    h('h4', { text: 'Gün B' }), list(p.B));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function saveNote(text, k) {
  await updateMeta({ coachNotes: addCoachNote(state.meta?.coachNotes, { date: today(), kind: k, text }) });
}

/** Bu haftanın odağı kartı (Bugün, haftalık kontrol ve asistan ekranında). */
export function focusCard(meta, t, { title = '🎯 Bu haftanın odağı' } = {}) {
  const f = currentFocus(meta, t);
  if (!f) return null;
  return h('section', { class: 'card focus-card' },
    h('div', { class: 'card-head' }, h('h2', { text: title }), h('span', { class: 'muted small', text: fmtDate(f.date) })),
    h('ol', { class: 'focus-list' }, f.items.map((x) => h('li', { text: x }))));
}

export function renderAssistant(root) {
  const s = state.settings;
  if (!s.aiEnabled) {
    appendChildren(root, [
      h('header', { class: 'page-head' }, h('h1', { text: 'Yapay zekâ asistanı' })),
      card(h('p', { text: 'Asistan kapalı. Ayarlar → Yapay zekâ asistanı bölümünden açabilirsin.' }), btn('Ayarlara git', () => go('/ayarlar'), 'primary')),
    ]);
    return;
  }
  const t = today();
  const target = AI_TARGETS[s.aiTarget] ?? AI_TARGETS.claude;

  /* ---------- 1. Ne yapalım? ---------- */
  const input = h('textarea', { class: 'input', rows: 3, value: draftQuestion });
  const inputWrap = h('div', { class: 'field' }, h('label', { text: '' }), input);
  const preview = h('pre', { class: 'prompt-preview' });
  const meta = h('p', { class: 'muted small' });
  const kindBtns = Object.entries(PROMPT_KINDS).map(([value, k]) => h('button', {
    type: 'button', class: 'kind-opt', 'aria-pressed': String(value === kind),
    onClick: () => { kind = value; refresh(); },
  }, h('span', { class: 'kind-icon', 'aria-hidden': 'true', text: k.icon }), h('strong', { text: k.label }), h('span', { class: 'muted small', text: k.desc })));
  const refresh = () => {
    const k = PROMPT_KINDS[kind];
    kindBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(PROMPT_KINDS)[i] === kind)));
    inputWrap.hidden = !k.input;
    inputWrap.querySelector('label').textContent = kind === 'eatout' ? 'Mekân / menü' : 'Sorun';
    input.placeholder = k.input ?? '';
    draftQuestion = input.value;
    const text = buildPrompt(kind, { state, today: t, startKey: startKey(), alerts: currentAlerts(), question: input.value });
    preview.textContent = text;
    const secs = promptSections(kind, state, t).map((x) => SECTION_LABELS[x]);
    meta.textContent = `Bu mesajda: ${secs.join(', ')} · ~${fmtNum(text.length / 1000, 1)} bin karakter. Adın, e-postan ve fotoğrafların yok.`;
  };
  input.addEventListener('input', refresh);
  refresh();

  const send = async () => {
    const ok = await copyText(preview.textContent);
    if (!ok) { toast('Kopyalanamadı: "Gönderilecek metni gör"ü açıp elle seç ve kopyala.'); return; }
    if (target.url) {
      toast(`Kopyalandı ✓ ${target.label}'da yapıştır`);
      window.open(target.url, '_blank', 'noopener');
    } else {
      toast('Kopyalandı ✓ İstediğin yapay zekâ uygulamasına yapıştır.');
    }
  };

  /* ---------- 2. Cevabı getir ---------- */
  const answer = h('textarea', { class: 'input', rows: 5, placeholder: 'Yapay zekânın cevabını buraya yapıştır (```json bloğu dahil)' });
  const result = h('div', { class: 'ai-result' });
  const err = (e) => result.append(h('p', { class: 'small pre', text: `⚠️ ${e.message}` }));
  const noteBtn = (text, k) => btn('📌 Not olarak kaydet', async () => {
    await saveNote(text, k);
    toast('Not kaydedildi 📌 Bir sonraki mesajda yapay zekâ bunu da görür.');
    renderNotes();
  }, 'small');

  function showReview(text) {
    let res;
    try { res = parseWeeklyReview(text, { settings: s, today: t }); } catch (e) { err(e); return; }
    const p = state.profile;
    const cal = res.kcal && p ? calibrate(p, res.kcal) : null;
    result.append(
      h('p', { class: 'ok', text: '✓ Haftalık değerlendirme okundu:' }),
      h('div', { class: 'focus-card' }, h('strong', { text: '🎯 Bu haftanın odağı' }), h('ol', { class: 'focus-list' }, res.focus.map((f) => h('li', { text: f })))),
      res.kcal
        ? h('p', { class: 'small', text: cal ? `Kalori hedefi: ${fmtNum(p.kcalMin, 0)}–${fmtNum(p.kcalMax, 0)} → ${fmtNum(cal.kcalMin, 0)}–${fmtNum(cal.kcalMax, 0)} kcal (sonraki 14 gün kilo uyarıları susar).` : 'Kalori hedefi zaten alt sınırda; değişmeyecek.' })
        : h('p', { class: 'muted small', text: res.kcalNote || 'Kalori hedefi aynı kalıyor.' }),
      res.ifThen
        ? h('div', { class: 'small' }, h('strong', { text: '📌 Eğer–o zaman planların şöyle güncellenecek:' }),
          h('ul', null, res.ifThen.map((x) => h('li', { text: `${IFTHEN_TRIGGERS[x.trigger].when} → ${x.text}` }))))
        : null,
      btn('Odağı kaydet ve uygula', async () => {
        await updateMeta({
          weeklyFocus: { date: t, week: weekStart(t), items: res.focus },
          coachNotes: addCoachNote(state.meta?.coachNotes, { date: t, kind: 'review', text }),
        });
        if (cal) await applyCalibration(res.kcal, t);
        if (res.ifThen) await updateSettings({ ifThen: res.ifThen });
        toast('Bu haftanın odağı kaydedildi 🎯');
        go('/bugun');
      }, 'primary block'));
  }

  function showEatOut(text) {
    let res;
    try { res = parseEatOut(text); } catch (e) { err(e); return; }
    const slot = segmented([{ value: 'first', label: 'Öğle' }, { value: 'dinner', label: 'Akşam' }, { value: 'snack1', label: 'Ara öğün' }],
      new Date().getHours() < 16 ? 'first' : 'dinner');
    result.append(
      h('p', { class: 'ok', text: '✓ Seçenekler okundu. Yediğinde dokun, bugüne kaydedilsin:' }),
      h('div', { class: 'field' }, h('label', { text: 'Hangi öğün?' }), slot),
      h('div', { class: 'swap-list' }, res.options.map((o) => btn(`🍽️ Yedim: ${o.name} (~${o.protein} g protein${o.kcal ? `, ~${o.kcal} kcal` : ''})`, async () => {
        const day = state.daily[t] ?? {};
        await saveDaily(t, applyMealToDaily(day, slot.getValue() ?? 'dinner', freeEntry(o.name, o.protein, 'out')));
        toast(`Kaydedildi: ${o.name} · ${o.protein} g protein`);
        go('/bugun');
      }, 'block swap-opt'))),
      noteBtn(text, 'eatout'));
  }

  function showDay(text) {
    let res;
    try { res = parseDayChanges(text, { today: t, mealplan: state.mealplan }); } catch (e) { err(e); return; }
    result.append(
      h('p', { class: 'ok', text: '✓ Gün sonu önerisi okundu (yeni malzeme ve ekipman yok):' }),
      dayChangesPreview(res, state.mealplan),
      res.changes.length ? btn('Değişiklikleri uygula', async () => {
        await applyDayChanges(res);
        await saveNote(text, 'day');
        toast('Değişiklikler uygulandı ✓');
        go('/bugun');
      }, 'primary block') : noteBtn(text, 'day'));
  }

  function showMealPlan(text) {
    let mp;
    try { mp = parseMealPlan(text); } catch (e) { err(e); return; }
    result.append(
      h('p', { class: 'ok', text: '✓ Yemek planı okundu. Önizleme:' }),
      mealPlanPreview(mp),
      btn('Bu yemek planını uygula', async () => {
        if (!(await confirmSheet({ title: 'Yemek planını uygula', message: 'Haftalık yemek planı ve alışveriş listesi bununla değiştirilecek. Yemek → Tercihler\'den varsayılan plana her zaman dönebilirsin. Uygulansın mı?', confirmLabel: 'Uygula' }))) return;
        await setKV('mealplan', {
          prefs: { ...defaultPrefs(), ...(state.mealplan?.prefs ?? {}) },
          days: mp.days,
          customMeals: mp.customMeals,
          source: 'ai',
          note: mp.note,
          updatedAt: new Date().toISOString(),
        });
        toast('Yeni yemek planı uygulandı ✓');
        go('/yemek/plan');
      }, 'primary block'));
  }

  function showProgram(text) {
    let p;
    try { p = parseProgram(text); } catch (e) { err(e); return; }
    const phase = p.phase ?? s.phase;
    result.append(
      h('p', { class: 'ok', text: `✓ Program okundu (${PHASES[phase].label} dönemi). Önizleme:` }),
      programPreview(p),
      btn('Bu programı uygula', async () => {
        const msg = phase !== s.phase
          ? `Program "${PHASES[phase].label}" dönemi için. Dönem de buna değiştirilecek. Uygulansın mı?`
          : 'Gün A ve Gün B bu programla değiştirilecek. Antrenman sekmesinden ya da Ayarlar\'dan varsayılan programa her zaman dönebilirsin. Uygulansın mı?';
        if (!(await confirmSheet({ title: 'Programı uygula', message: msg, confirmLabel: 'Uygula' }))) return;
        await updateSettings({ phase, customProgram: { phase, A: p.A, B: p.B, note: p.note, appliedAt: t } });
        toast('Yeni program uygulandı ✓');
        go('/antrenman');
      }, 'primary block'));
  }

  const check = () => {
    result.replaceChildren();
    const text = answer.value;
    if (!text.trim()) { toast('Önce cevabı yapıştır.'); return; }
    if (hasKey(text, ['focus', 'odak'])) return showReview(text);
    if (hasKey(text, ['changes', 'degisiklikler'])) return showDay(text);
    if (hasKey(text, ['options', 'secenekler'])) return showEatOut(text);
    if (looksLikeMealPlan(text)) return showMealPlan(text);
    if (!extractJson(text, () => true).found) {
      result.append(
        h('p', { class: 'muted small', text: 'Bu cevapta uygulamaya aktarılacak bir öneri yok; okuman yeterli. İstersen not olarak sakla: bir sonraki mesajda yapay zekâ önceki önerisini de görür.' }),
        // Seçili tür cevabın konusunu her zaman yansıtmaz; serbest soru dışında genel "Not" etiketi kullanılır.
        noteBtn(text, kind === 'question' ? 'question' : 'note'));
      return;
    }
    return showProgram(text);
  };

  const pasteBtn = navigator.clipboard?.readText ? btn('📋 Panodan yapıştır', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast('Pano boş.'); return; }
      answer.value = text;
      check();
    } catch {
      toast('Panoya erişilemedi; kutuya uzun basıp yapıştır.');
    }
  }, 'primary') : null;

  /* ---------- Notlar ---------- */
  const notesWrap = h('section', { class: 'card' });
  function renderNotes() {
    const notes = [...(state.meta?.coachNotes ?? [])].reverse().slice(0, 5);
    notesWrap.replaceChildren(...(notes.length ? [
      h('h2', { text: '📌 Kaydedilen notlar' }),
      h('p', { class: 'muted small', text: 'En yenisi ve haftalık odak bir sonraki mesaja kısaca eklenir.' }),
      ...notes.map((note) => h('details', { class: 'how note-item' },
        h('summary', { text: `${fmtDate(note.date)} · ${PROMPT_KINDS[note.kind]?.label ?? 'Not'}` }),
        h('p', { class: 'pre small', text: note.text }),
        btn('Sil', async () => {
          await updateMeta({ coachNotes: (state.meta?.coachNotes ?? []).filter((x) => x.id !== note.id) });
          renderNotes();
        }, 'small danger-ghost'))),
    ] : []));
    notesWrap.hidden = !notes.length;
  }
  renderNotes();

  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: 'Yapay zekâ asistanı' }),
      h('p', { class: 'muted', text: `Mesajı kopyala, ${target.label}'da yapıştır, cevabı buraya geri getir. Ek ücret yok.` }))),
    focusCard(state.meta, t),
    card(
      h('h2', { text: '1. Ne yapalım?' }),
      h('div', { class: 'kind-grid' }, kindBtns),
      inputWrap,
      btn(target.url ? `Kopyala ve ${target.label}'ı aç` : 'Kopyala', send, 'primary block'),
      meta,
      target.url ? h('p', { class: 'muted small', text: `Uygulama açılmazsa ${target.label} uygulamasını kendin açıp yapıştır.` }) : null,
      h('details', { class: 'how' },
        h('summary', { text: 'Gönderilecek metni gör' }),
        preview)),
    card(
      h('h2', { text: '2. Cevabı buraya getir' }),
      h('p', { class: 'muted small', text: 'Cevabın tamamını kopyala (Claude\'da cevabın altındaki kopyala simgesi). Uygulama türünü tanır, kontrol edip önizleme gösterir; hiçbir şey sen onaylamadan değişmez.' }),
      h('div', { class: 'actions-row' }, pasteBtn, btn('Kontrol et', check)),
      answer,
      result),
    notesWrap,
    h('p', { class: 'muted small center disclaimer', text: 'Yapay zekâ önerileri genel bilgidir, tıbbi tavsiye değildir. Ağrıda bir uzmana danış.' }),
  ]);
  // Arka planda eşitleme olsa da yapıştırılan metin kaybolmasın.
  return { sticky: true };
}
