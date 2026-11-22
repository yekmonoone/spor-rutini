// Antrenman sekmesi: dönem, A/B günleri, hareket açıklamaları, son antrenmanlar.
import { state } from '../store.js';
import { h, btn, card } from '../ui.js';
import {
  EX, PHASES, programFor, COOLDOWN, warmupFor, nextStrengthDay, plannedSets, programWeek, rirTarget, targetText,
  pairLabels, estimateMinutes, shortItems, pairRestSec, PAIR_TRANSITION_SEC,
} from '../program.js';
import { videoUrl } from '../exercises.js';
import { isStrength } from '../stats.js';
import { fmtDate } from '../util.js';
import { today, startKey, go } from '../context.js';
import { startWorkout } from './active.js';

function exerciseRow(item, sets, label = null) {
  const ex = EX[item.ex];
  const video = videoUrl(item.ex);
  return h('details', { class: 'ex-row' },
    h('summary', null,
      h('span', { class: 'ex-name' }, label ? h('span', { class: 'pair-tag', text: label }) : null, ex.name),
      h('span', { class: 'muted small', text: targetText(item, sets) })),
    h('div', { class: 'ex-detail' },
      h('div', { class: 'muted small', text: ex.muscle }),
      h('ul', null, ex.how.map((t) => h('li', { text: t }))),
      ex.easier ? h('p', { class: 'small', text: `Kolaylaştır: ${ex.easier}` }) : null,
      ex.harder ? h('p', { class: 'small', text: `Zorlaştır: ${ex.harder}` }) : null,
      video ? h('a', { class: 'video-link small', href: video, target: '_blank', rel: 'noopener noreferrer', text: '▶ Videoda izle (YouTube araması)' }) : null));
}

export function renderProgram(root) {
  const phase = state.settings.phase;
  const prog = programFor(state.settings);
  const week = Math.max(1, programWeek(startKey(), today()));
  const next = nextStrengthDay(state.workouts);
  const rir = rirTarget(week);

  root.append(h('header', { class: 'page-head' },
    h('div', null,
      h('h1', { text: 'Antrenman' }),
      h('p', { class: 'muted', text: `${PHASES[phase].label} dönemi · Hafta ${week}${prog.custom ? ' · 🤖 yapay zekâ programı' : ''}` }))));
  if (prog.custom && prog.note) root.append(h('div', { class: 'notice pre', text: prog.note }));

  if (state.draft) {
    root.append(h('section', { class: 'card highlight' },
      h('p', null, h('strong', { text: `Devam eden antrenman: Gün ${state.draft.day}` })),
      btn('Devam et', () => go('/antrenman/aktif'), 'primary')));
  }

  const restSec = state.settings.restSec ?? 75;
  for (const day of ['A', 'B']) {
    const items = prog[day];
    const main = items.filter((i) => !i.prep);
    const prep = items.filter((i) => i.prep);
    const labels = pairLabels(main);
    const mins = estimateMinutes(items, week, restSec);
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { text: `Gün ${day}` }),
        day === next ? h('span', { class: 'badge accent', text: 'Sıradaki' }) : null),
      h('p', { class: 'muted small day-meta', text: `~${mins} dk · ${main.length} hareket${labels.some(Boolean) ? ' · süperset' : ''} · kısa versiyon ~${estimateMinutes(shortItems(items), week, restSec)} dk` }),
      h('div', { class: 'ex-list' }, main.map((i, k) => exerciseRow(i, plannedSets(i, week), labels[k]))),
      prep.length ? h('p', { class: 'muted small section-label', text: 'Padel hazırlığı' }) : null,
      prep.length ? h('div', { class: 'ex-list' }, prep.map((i) => exerciseRow(i, plannedSets(i, week)))) : null,
      btn(`Gün ${day}'${day === 'A' ? 'yı' : 'yi'} başlat`, () => startWorkout(day), day === next ? 'primary block' : 'block')));
  }

  root.append(card(
    h('h2', { text: 'Kurallar' }),
    h('ul', { class: 'rules' },
      h('li', { text: `Efor: ${rir.label}. ${rir.hint}` }),
      h('li', { text: 'İlk hafta 2 set, sonra 3. İniş 2–3 sn.' }),
      h('li', { text: `Süperset (1a/1b): iki hareketi sırayla yap (arada ~${PAIR_TRANSITION_SEC} sn), tur bitince ${pairRestSec(restSec)} sn dinlen. Her kas yine ~2 dk dinlenir, seans belirgin şekilde kısalır (araştırmalarda yarıya kadar). Sayaç ve ekran kendiliğinden sıradaki harekete geçer.` }),
      h('li', { text: `Tek hareketlerde setler arası ${restSec} sn (Ayarlar'dan değiştirilebilir).` }),
      h('li', { text: 'Ağrı ya da eksik ekipman olursa antrenman ekranında "↔ Değiştir" ile o gün için benzer bir hareket seç.' }),
      h('li', { text: 'Bir harekette 2 seans üst üste tüm setlerde üst sınıra ulaşınca zorlaştır (uygulama hatırlatır).' }),
      h('li', { text: 'Kas yanması normal; eklemde keskin ağrı olursa hareketi bırak.' }),
      h('li', { text: `Isınma: ${warmupFor(phase).join(', ')}.` }),
      h('li', { text: `Soğuma: ${COOLDOWN}.` })),
    h('p', { class: 'muted small', text: 'Dönemi (ekipmansız / dambıl / bant) Ayarlar\'dan değiştirebilirsin.' })));

  const recent = state.workouts.filter(isStrength).slice(-5).reverse();
  root.append(card(
    h('h2', { text: 'Son antrenmanlar' }),
    recent.length
      ? h('ul', { class: 'list' }, recent.map((w) => {
        const sets = (w.exercises ?? []).reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
        return h('li', null,
          h('span', { text: `${fmtDate(w.date)} · Gün ${w.day}` }),
          h('span', { class: 'muted small', text: `${w.durationMin ? `${w.durationMin} dk · ` : ''}${sets} set` }));
      }))
      : h('p', { class: 'muted', text: 'Henüz antrenman yok. İlk antrenmanını başlat!' }),
    recent.length ? btn('Tüm geçmiş', () => go('/gecmis'), 'ghost') : null));
}
