// Bugün ekranı: gün akışı. Saat sırasıyla yapılacaklar; her biri tek dokunuşla tamamlanır.
// Sabah tartı + uyku → öğle öğünü → akşam yürüyüşü → antrenman/padel → akşam yemeği, ara öğün → gün sonu (adım + not).
import { state, saveDaily, dismissAlert } from '../store.js';
import { h, btn, numInput, toast } from '../ui.js';
import { WEEKLY_STRENGTH_MIN, WEEKLY_STRENGTH_TARGET, blockOf, dayPlanFor, nextStrengthDay, programWeek } from '../program.js';
import { HABIT_DAYS, activeDays, isStrength, isTest, trendRate, trendWeight, weekSummary, weeklyStreak } from '../stats.js';
import { maintenanceWeek } from '../targets.js';
import { planFor } from '../ifthen.js';
import { checkinWeek } from '../rules.js';
import { addDays, daysBetween, fmtDateLong, fmtNum, parseNum, weekStart, weekday } from '../util.js';
import { today, startKey, currentAlerts, runAction, go, maintenanceOn, targetsToday } from '../context.js';
import { openDailyForm, openPadelForm, openMeasureForm, openTestForm } from '../forms.js';
import { startWorkout } from './active.js';
import { OUT, SLOT_LABELS, dayFor, mealById, mealNutrition } from '../mealplan.js';
import { askWhatEaten, markEaten } from './meals.js';
import { setAssistantKind } from './assistant.js';

const LEVEL_LABEL = { warn: 'Uyarı', info: 'Bilgi', success: 'Tamam' };

function alertCard(a) {
  return h('article', { class: `alert ${a.level}` },
    h('div', { class: 'alert-icon', 'aria-hidden': 'true', text: a.icon ?? 'ℹ️' }),
    h('div', { class: 'alert-main' },
      h('div', { class: 'alert-title' },
        h('span', { class: 'sr-only', text: `${LEVEL_LABEL[a.level]}: ` }),
        h('strong', { text: a.title })),
      h('p', { class: 'pre', text: a.body }),
      a.action ? btn(a.action.label, () => runAction(a.action.to), 'small') : null),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bu uyarıyı gizle', text: '✕', onClick: () => dismissAlert(a.id) }));
}

/** Akış satırı: simge (tamamlanınca ✓), başlık, saat ipucu ve içerik. */
function row({ icon, title, time, done = false, cls = '' }, ...body) {
  return h('div', { class: `flow-row${done ? ' done' : ''} ${cls}`.trim() },
    h('div', { class: 'flow-icon', 'aria-hidden': 'true', text: done ? '✓' : icon }),
    h('div', { class: 'flow-main' },
      h('div', { class: 'flow-title' }, h('strong', { text: title }), time ? h('span', { class: 'muted small', text: ` · ${time}` }) : null),
      body));
}

/** "Eğer–o zaman" planı varsa ilgili satırda gösterir. */
function planHint(trigger) {
  const p = planFor(state.settings, trigger);
  return p ? h('p', { class: 'flow-plan small', text: `📌 Planın: ${p.text}` }) : null;
}

function trendText(t) {
  const tw = trendWeight(state.daily, t);
  if (tw == null) return null;
  const rate = trendRate(state.daily, t);
  const r = rate == null ? '' : ` · haftada ${rate <= 0 ? '−' : '+'}${fmtNum(Math.abs(rate))} kg`;
  return `Trend ${fmtNum(tw)} kg${r}`;
}

function readNum(input, label, min, max, integer = false) {
  const raw = input.value.trim();
  if (!raw) return null;
  const n = parseNum(raw);
  if (n == null || n < min || n > max) throw new Error(`${label}: ${fmtNum(min, 0)}–${fmtNum(max, 0)} arasında olmalı.`);
  return integer ? Math.round(n) : Math.round(n * 10) / 10;
}

function morningRow(t, r) {
  const weight = numInput({ value: r.weight, decimal: true, placeholder: 'kilo', label: 'Kilo (kg)' });
  const sleep = numInput({ value: r.sleepH, decimal: true, placeholder: 'uyku', label: 'Uyku (saat)' });
  const save = async () => {
    try {
      await saveDaily(t, { weight: readNum(weight, 'Kilo', 30, 250), sleepH: readNum(sleep, 'Uyku', 0, 16) });
      toast('Kaydedildi ✓');
    } catch (err) { toast(err.message); }
  };
  return row({ icon: '☀️', title: 'Sabah: tartı ve uyku', time: '07–09', done: r.weight != null },
    h('div', { class: 'inline-inputs' },
      h('label', null, h('span', { class: 'muted small', text: 'kg' }), weight),
      h('label', null, h('span', { class: 'muted small', text: 'uyku (sa)' }), sleep),
      btn('Kaydet', save, r.weight != null ? 'small' : 'small primary')),
    h('p', { class: 'muted small', text: r.weight != null && trendText(t)
      ? `${trendText(t)} (son 7 günün ortalaması — günlük iniş çıkışlar normal)`
      : 'Tuvaletten sonra, aç karnına.' }));
}

function mealRow(t, slot, plan, day, eaten, icon, time) {
  const planned = day[slot];
  const entry = eaten[slot];
  if (!planned && !entry) return null;
  const meal = planned && planned !== OUT ? mealById(planned, plan) : null;
  let body;
  if (entry) {
    body = [h('p', { class: 'flow-text', text: `${entry.name} · ~${entry.protein} g protein` }),
      h('div', { class: 'flow-actions' }, btn('Değiştir', () => askWhatEaten(t, slot, plan), 'small'), btn('Geri al', () => markEaten(t, slot, null), 'small ghost'))];
  } else if (planned === OUT) {
    body = [h('p', { class: 'flow-text muted', text: 'Dışarıda — yediğinde seç.' }),
      planHint('eatout'),
      h('div', { class: 'flow-actions' }, btn('Ne yedim?', () => askWhatEaten(t, slot, plan), 'small primary'))];
  } else if (meal) {
    body = [h('p', { class: 'flow-text', text: `${meal.name} · ~${mealNutrition(meal).mid} g protein` }),
      h('div', { class: 'flow-actions' },
        btn('Yedim ✓', () => markEaten(t, slot, meal), 'small primary'),
        btn('Başka bir şey', () => askWhatEaten(t, slot, plan), 'small'))];
  } else {
    return null;
  }
  return row({ icon, title: SLOT_LABELS[slot] ?? 'Plan dışı', time, done: !!entry }, body);
}

function walkRow(t, r) {
  const set = (walked, brisk) => saveDaily(t, { walked, brisk }).then(() => toast(walked ? 'Yürüyüş kaydedildi ✓' : 'Geri alındı'));
  return row({ icon: '🚶', title: 'Akşam yürüyüşü', time: '~1 saat', done: !!r.walked },
    r.walked
      ? h('div', { class: 'flow-actions' },
        h('span', { class: 'flow-text', text: r.brisk ? 'Yapıldı · tempolu bölüm de vardı' : 'Yapıldı' }),
        !r.brisk ? btn('Tempolu bölüm de vardı', () => set(true, true), 'small') : null,
        btn('Geri al', () => set(false, false), 'small ghost'))
      : h('div', { class: 'flow-actions' },
        btn('Yaptım', () => set(true, false), 'small primary'),
        btn('Tempolu yaptım', () => set(true, true), 'small')),
    r.walked ? null : h('p', { class: 'muted small', text: '10–20 dk tempolu bölüm: konuşabilir ama şarkı söyleyemezsin.' }),
    r.walked ? null : planHint('nowalk'));
}

function strengthRemainingThisWeek(t) {
  let n = 0;
  for (let d = addDays(t, 1); d <= addDays(weekStart(t), 6); d = addDays(d, 1)) {
    const p = dayPlanFor(state.settings, d, weekday(d));
    if (p.type === 'strength' || p.type === 'flex') n++;
  }
  return n;
}

function workoutRow(t, r, plan) {
  const done = state.workouts.filter((w) => w.date === t && isStrength(w));
  const next = nextStrengthDay(state.workouts);
  const planned = plan.type === 'strength' || plan.type === 'flex';
  const title = planned ? `Antrenman · Gün ${next}` : 'Antrenman (bugün planda yok)';
  const tag = plan.override ? ' (gün sonu kontrolünde değişti)' : '';
  if (done.length) {
    const w = done[done.length - 1];
    return row({ icon: '💪', title: `Antrenman · Gün ${w.day}${w.short ? ' (kısa)' : ''}`, done: true },
      h('p', { class: 'flow-text', text: `Kaydedildi${w.durationMin ? ` — ${w.durationMin} dk` : ''}` }));
  }
  if (state.draft) {
    return row({ icon: '💪', title: `Antrenman · Gün ${state.draft.day}` },
      h('div', { class: 'flow-actions' }, btn('Devam et', () => go('/antrenman/aktif'), 'small primary')));
  }
  if (r.workoutSkipped) {
    const week = weekSummary(state, t).strength;
    const left = strengthRemainingThisWeek(t);
    const msg = week + left >= WEEKLY_STRENGTH_MIN
      ? `Sorun değil. Bu hafta ${week} yapıldı, ${left} kuvvet günü daha planlı; en az ${WEEKLY_STRENGTH_MIN} hâlâ mümkün.`
      : 'Sorun değil; kaçan gün telafi edilmez. Yürüyüşe devam, gelecek hafta plana dön.';
    return row({ icon: '💪', title: `Antrenman: bugün olmadı${tag}`, done: true, cls: 'skipped' },
      h('p', { class: 'flow-text muted', text: msg }),
      planHint('busy'),
      h('div', { class: 'flow-actions' }, btn('Yine de yapacağım', () => saveDaily(t, { workoutSkipped: false }), 'small ghost')));
  }
  if (!planned) {
    return row({ icon: '💪', title, cls: 'optional' },
      h('div', { class: 'flow-actions' },
        btn(`Yine de · Gün ${next}`, () => startWorkout(next), 'small'),
        btn('Kısa (20 dk)', () => startWorkout(next, { short: true }), 'small ghost')));
  }
  return row({ icon: '💪', title: `${title}${tag}`, time: 'yürüyüşten sonra' },
    h('div', { class: 'flow-actions' },
      btn('Başla', () => startWorkout(next), 'small primary'),
      btn('Kısa (20 dk)', () => startWorkout(next, { short: true }), 'small'),
      btn('Bugün olmadı', async () => {
        await saveDaily(t, { workoutSkipped: true });
      }, 'small ghost')),
    h('p', { class: 'muted small', text: 'Yatmadan en az 2 saat önce bitir.' }),
    planHint('busy'));
}

function padelRow(t) {
  const logged = state.padel.filter((p) => p.date === t);
  return row({ icon: '🎾', title: 'Padel', done: logged.length > 0 },
    logged.length
      ? h('p', { class: 'flow-text', text: `Kaydedildi${logged[0].durationMin ? ` — ${logged[0].durationMin} dk` : ''}` })
      : h('div', { class: 'flow-actions' }, btn('Padel kaydı ekle', () => openPadelForm(), 'small primary')),
    logged.length ? null : h('p', { class: 'muted small', text: 'Maç öncesi 5–10 dk ısın; ilk haftalarda 60 dakikayı geçme.' }),
    logged.length ? null : planHint('padelcancel'));
}

function eveningRow(t, r) {
  const steps = numInput({ value: r.steps, placeholder: 'adım', label: 'Adım' });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Gün notu (isteğe bağlı): ör. "Çiğköfte yedim, antrenmana vakit olmadı"', value: r.note ?? '' });
  const save = async () => {
    try {
      await saveDaily(t, { steps: readNum(steps, 'Adım', 0, 100000, true), note: note.value.trim() });
      toast('Kaydedildi ✓');
    } catch (err) { toast(err.message); }
  };
  return row({ icon: '🌙', title: 'Gün sonu', time: 'yatmadan önce', done: r.steps != null },
    h('div', { class: 'inline-inputs' }, h('label', null, h('span', { class: 'muted small', text: 'adım' }), steps)),
    note,
    h('div', { class: 'flow-actions' },
      btn('Kaydet', save, r.steps != null ? 'small' : 'small primary'),
      state.settings.aiEnabled
        ? btn('🤖 Gün sonu kontrolü', async () => { await save(); setAssistantKind('day'); go('/asistan'); }, 'small')
        : null));
}

function checkinRow(t) {
  const wk = checkinWeek(t);
  if (!wk) return null;
  const done = state.meta?.lastCheckin && state.meta.lastCheckin >= wk;
  return row({ icon: '🗓️', title: 'Haftalık kontrol', time: '~3 dk', done },
    done
      ? h('p', { class: 'flow-text', text: 'Bu haftanın kontrolü yapıldı.' })
      : h('div', { class: 'flow-actions' }, btn('Kontrolü aç', () => go('/haftalik'), 'small primary')));
}

/** Programın ilk 14 günü: başlangıç ölçümleri (hepsi tamamlanınca kaybolur). */
function baselineCard(t, sk) {
  const since = daysBetween(sk, t);
  if (since < 0 || since > 13) return null;
  const from = addDays(sk, -3);
  const weighIns = Object.values(state.daily).filter((d) => d.date >= from && d.weight != null).length;
  const ms = state.measurements.filter((m) => m.date >= from);
  const items = [
    { done: weighIns >= 3, text: `3 sabah tartısı (${Math.min(weighIns, 3)}/3)`, act: null },
    { done: ms.some((m) => m.waistCm != null), text: 'Bel ölçümü', act: () => openMeasureForm() },
    { done: ms.some((m) => m.photo), text: 'İlk fotoğraf (önden, yandan, arkadan)', act: () => openMeasureForm() },
    { done: ms.some(isTest), text: 'Güç testi (~5 dk)', act: () => openTestForm() },
  ];
  if (items.every((i) => i.done)) return null;
  return h('section', { class: 'card baseline' },
    h('h2', { text: '📋 Başlangıç değerlendirmesi' }),
    h('p', { class: 'muted small', text: 'İlk iki haftada bir kez: ilerlemeyi bunlarla karşılaştıracağız.' }),
    h('ul', { class: 'checklist' }, items.map((i) => h('li', { class: i.done ? 'done' : '' },
      h('span', { 'aria-hidden': 'true', text: i.done ? '✅' : '⬜' }),
      h('span', { text: i.text }),
      !i.done && i.act ? btn('Ekle', i.act, 'small ghost') : null))));
}

function habitLine(t, sk) {
  const streak = weeklyStreak(state, t, { startKey: sk, isMaintenanceWeek: (wk) => maintenanceWeek(state.settings, wk) });
  const days = activeDays(state, sk);
  const habit = days >= HABIT_DAYS ? `✓ ${HABIT_DAYS} aktif gün geçti` : `🌱 alışkanlık: ${days}/${HABIT_DAYS} aktif gün`;
  return `${streak ? `🔥 ${streak} haftalık seri · ` : ''}${habit}`;
}

export function renderToday(root) {
  const t = today();
  const sk = startKey();
  const week = programWeek(sk, t);
  const { block, weekInBlock } = blockOf(week);
  const sub = week === 0 ? `Program ${daysBetween(t, sk)} gün sonra başlıyor` : `Hafta ${week} · Blok ${block} (${weekInBlock}/4)`;
  const r = state.daily[t] ?? {};
  const plan = dayPlanFor(state.settings, t, weekday(t));
  const mp = state.mealplan;
  const mday = mp?.days ? dayFor(mp, t) : {};
  const eaten = r.meals ?? {};
  const p = targetsToday(t) ?? {};
  const maint = maintenanceOn(t);

  root.append(h('header', { class: 'page-head' },
    h('div', null,
      h('h1', { text: 'Bugün' }),
      h('p', { class: 'muted', text: `${fmtDateLong(t)} · ${sub}` })),
    h('div', { class: 'head-badges' },
      maint ? h('span', { class: 'badge maint', text: '🌿 Bakım' }) : null,
      h('span', { class: 'badge', text: `${plan.icon} ${plan.short}` }))));

  const base = baselineCard(t, sk);
  if (base) root.append(base);

  const rows = [morningRow(t, r)];
  if (mp?.days) {
    rows.push(mealRow(t, 'first', mp, mday, eaten, '🍽️', null));
  } else {
    rows.push(row({ icon: '🍽️', title: 'Yemek planı yok' },
      h('div', { class: 'flow-actions' }, btn('Plan oluştur', () => go('/yemek'), 'small primary'))));
  }
  rows.push(walkRow(t, r));
  if (plan.type === 'padel' || plan.type === 'flex') rows.push(padelRow(t));
  rows.push(workoutRow(t, r, plan));
  if (mp?.days) {
    rows.push(mealRow(t, 'dinner', mp, mday, eaten, '🍽️', null));
    for (const s of ['snack1', 'snack2', ...Object.keys(eaten).filter((k) => k.startsWith('extra'))]) rows.push(mealRow(t, s, mp, mday, eaten, '🥛', null));
    rows.push(row({ icon: '➕', title: 'Plan dışı bir şey yedim', cls: 'optional' },
      h('div', { class: 'flow-actions' }, btn('Ekle', () => {
        const free = ['extra1', 'extra2', 'extra3', 'extra4'].find((s) => !eaten[s]) ?? 'extra4';
        askWhatEaten(t, free, mp);
      }, 'small')),
      planHint('craving')));
  }
  rows.push(eveningRow(t, r));
  rows.push(checkinRow(t));
  root.append(h('section', { class: 'card flow' }, rows));

  // Protein
  if (p.proteinMin) {
    const protein = r.proteinG ?? 0;
    root.append(h('div', { class: 'flow-protein' },
      h('span', { class: 'small', text: `Protein: ${protein} / ${p.proteinMin}–${p.proteinMax} g` }),
      h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: { width: `${Math.min(100, Math.round((protein / (p.proteinMax || 1)) * 100))}%` } }))));
  }

  // Uyarılar: en önemli ikisi, gerisi katlanmış
  const alerts = currentAlerts();
  if (alerts.length) {
    root.append(h('section', { class: 'alerts', 'aria-label': 'Uyarılar ve öneriler' }, alerts.slice(0, 2).map(alertCard)));
    if (alerts.length > 2) {
      root.append(h('details', { class: 'more-alerts' },
        h('summary', { text: `Diğer uyarılar (${alerts.length - 2})` }),
        h('div', { class: 'alerts' }, alerts.slice(2).map(alertCard))));
    }
  }

  // Haftalık özet — tek satır
  const s = weekSummary(state, t);
  const wk = weekStart(t);
  const walks = Object.values(state.daily).filter((d) => d.date >= wk && d.date <= addDays(wk, 6) && d.walked).length;
  root.append(h('p', { class: 'muted small week-line', text: `Bu hafta: 💪 ${s.strength}/${WEEKLY_STRENGTH_TARGET} kuvvet · 🎾 ${s.padel} padel · 🚶 ${walks} yürüyüş · ⚖️ ${s.weighIns} tartı${s.sleep != null ? ` · 😴 ${fmtNum(s.sleep)} sa` : ''}` }));
  if (week > 0) root.append(h('p', { class: 'muted small week-line', text: habitLine(t, sk) }));

  root.append(h('div', { class: 'quick' },
    btn('+ Padel', () => openPadelForm(), 'small'),
    btn('+ Ölçüm', () => openMeasureForm(), 'small'),
    btn('🗓️ Haftalık', () => go('/haftalik'), 'small ghost'),
    btn('+ Başka gün', () => openDailyForm(), 'small ghost'),
    state.settings.aiEnabled ? btn('🤖 Asistan', () => go('/asistan'), 'small ghost') : null));
  root.append(h('p', { class: 'muted small center disclaimer', text: 'Bu uygulama genel bilgi verir, tıbbi tavsiye değildir. Ağrı veya sağlık şikâyetinde bir hekime danış.' }));
}
