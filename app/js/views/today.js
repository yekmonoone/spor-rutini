// Bugün ekranı: günün planı, uyarılar, günlük kayıt, haftalık özet ve hedefler.
import { state, dismissAlert } from '../store.js';
import { h, btn, card, stat } from '../ui.js';
import { WEEKLY_STRENGTH_TARGET, blockOf, dayPlan, nextStrengthDay, programWeek } from '../program.js';
import { isStrength, weekSummary } from '../stats.js';
import { daysBetween, fmtDateLong, fmtNum, weekday } from '../util.js';
import { today, startKey, currentAlerts, runAction, go } from '../context.js';
import { openDailyForm, openPadelForm, openMeasureForm } from '../forms.js';
import { startWorkout } from './active.js';

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

function planCard(t) {
  const plan = dayPlan(state.settings, weekday(t));
  const doneToday = state.workouts.filter((w) => w.date === t && isStrength(w));
  const padelToday = state.padel.filter((p) => p.date === t);
  const next = nextStrengthDay(state.workouts);
  const body = [];

  const strengthPart = () => {
    if (doneToday.length) {
      const w = doneToday[doneToday.length - 1];
      body.push(h('p', { class: 'ok', text: `✓ Bugünkü antrenman kaydedildi — Gün ${w.day}${w.durationMin ? `, ${w.durationMin} dk` : ''}` }));
    } else if (state.draft) {
      body.push(btn(`Gün ${state.draft.day} antrenmanına devam et`, () => go('/antrenman/aktif'), 'primary block'));
    } else {
      body.push(btn(`Antrenmana başla · Gün ${next}`, () => startWorkout(next), 'primary block'));
    }
  };

  if (plan.type === 'strength') strengthPart();
  if (plan.type === 'padel' || plan.type === 'flex') {
    body.push(padelToday.length
      ? h('p', { class: 'ok', text: `✓ Padel kaydedildi${padelToday[0].durationMin ? ` — ${padelToday[0].durationMin} dk` : ''}` })
      : btn('Padel kaydı ekle', () => openPadelForm(), plan.type === 'padel' ? 'primary block' : 'block'));
  }
  if (plan.type === 'flex') strengthPart();
  if (plan.type !== 'strength' && plan.type !== 'flex') {
    if (doneToday.length) {
      const w = doneToday[doneToday.length - 1];
      body.push(h('p', { class: 'ok', text: `✓ Ekstra antrenman kaydedildi — Gün ${w.day}${w.durationMin ? `, ${w.durationMin} dk` : ''}` }));
    } else {
      body.push(h('button', { type: 'button', class: 'link', text: state.draft ? 'Devam eden antrenmana dön' : 'Bugün yine de antrenman yapacağım', onClick: () => (state.draft ? go('/antrenman/aktif') : startWorkout(next)) }));
    }
  }

  return h('section', { class: 'card plan' },
    h('div', { class: 'plan-head' },
      h('span', { class: 'plan-icon', 'aria-hidden': 'true', text: plan.icon }),
      h('div', null, h('p', { class: 'muted small', text: 'Bugünün planı' }), h('h2', { text: plan.label }))),
    h('p', { class: 'muted', text: plan.tip }),
    body);
}

function dailyCard(t) {
  const r = state.daily[t];
  const p = state.profile ?? {};
  const v = (x, unit, digits = 1) => (x == null ? '–' : `${fmtNum(x, digits)}${unit}`);
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { text: 'Bugünkü kayıt' }),
      btn(r ? 'Düzenle' : 'Kaydet', () => openDailyForm(t), r ? 'small' : 'small primary')),
    h('div', { class: 'stats' },
      stat('Kilo', v(r?.weight, ' kg')),
      stat('Adım', v(r?.steps, '', 0)),
      stat('Uyku', v(r?.sleepH, ' sa')),
      stat('Protein', v(r?.proteinG, ' g', 0), p.proteinMin ? `hedef ${p.proteinMin}–${p.proteinMax}` : null),
      stat('Enerji', r?.energy ? `${r.energy}/5` : '–')),
    h('div', { class: 'quick' },
      btn('+ Padel', () => openPadelForm(), 'small'),
      btn('+ Ölçüm', () => openMeasureForm(), 'small'),
      btn('+ Başka gün', () => openDailyForm(), 'small ghost')));
}

function weekCard(t) {
  const s = weekSummary(state, t);
  return h('section', { class: 'card' },
    h('h2', { text: 'Bu hafta' }),
    h('div', { class: 'stats' },
      stat('Kuvvet', `${s.strength}/${WEEKLY_STRENGTH_TARGET}`, 'en az 2'),
      stat('Padel', String(s.padel)),
      stat('Tempolu yürüyüş', `${s.brisk}/2`),
      stat('Tartı', String(s.weighIns), 'hedef 3+'),
      stat('Ort. uyku', s.sleep == null ? '–' : `${fmtNum(s.sleep)} sa`),
      stat('Ort. protein', s.protein == null ? '–' : `${fmtNum(s.protein, 0)} g`),
      stat('Ort. adım', s.steps == null ? '–' : fmtNum(s.steps, 0))));
}

function targetsCard() {
  const p = state.profile;
  if (!p?.kcalMin) return null;
  return h('section', { class: 'card subtle' },
    h('h2', { text: 'Günlük hedefler' }),
    h('ul', { class: 'rules' },
      h('li', { text: `Kalori: ~${fmtNum(p.kcalMin, 0)}–${fmtNum(p.kcalMax, 0)} kcal` }),
      h('li', { text: `Protein: ${p.proteinMin}–${p.proteinMax} g · her öğünde bir protein kaynağı` }),
      h('li', { text: 'Sebze: öğle ve akşam birer porsiyon' }),
      h('li', { text: 'Uyku 7,5+ saat · günde 7.000+ adım' }),
      p.lossMinKg ? h('li', { text: `Hedef kilo kaybı: haftada ${fmtNum(p.lossMinKg)}–${fmtNum(p.lossMaxKg)} kg` }) : null));
}

export function renderToday(root) {
  const t = today();
  const sk = startKey();
  const week = programWeek(sk, t);
  const { block, weekInBlock } = blockOf(week);
  const sub = week === 0
    ? `Program ${daysBetween(t, sk)} gün sonra başlıyor`
    : `Hafta ${week} · Blok ${block} (${weekInBlock}/4)`;

  root.append(h('header', { class: 'page-head' },
    h('div', null,
      h('h1', { text: 'Bugün' }),
      h('p', { class: 'muted', text: `${fmtDateLong(t)} · ${sub}` }))));

  root.append(planCard(t));
  const alerts = currentAlerts();
  if (alerts.length) root.append(h('section', { class: 'alerts', 'aria-label': 'Uyarılar ve öneriler' }, alerts.map(alertCard)));
  if (state.settings.aiEnabled) {
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { text: '🤖 Yapay zekâ asistanı' }),
        btn('Aç', () => go('/asistan'), 'small primary')),
      h('p', { class: 'muted small', text: 'Haftalık değerlendirme, yeni program ya da kendi sorun için hazır mesaj.' })));
  }
  root.append(dailyCard(t), weekCard(t));
  const tc = targetsCard();
  if (tc) root.append(tc);
  root.append(h('p', { class: 'muted small center disclaimer', text: 'Bu uygulama genel bilgi verir, tıbbi tavsiye değildir. Ağrı veya sağlık şikâyetinde bir hekime danış.' }));
}
