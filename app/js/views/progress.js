// İlerleme ekranı: kilo, bel, haftalık antrenman, hareket ilerlemesi, haftalık tablo ve blok değerlendirmesi.
import { state } from '../store.js';
import { h, btn, card, segmented, selectEl } from '../ui.js';
import { timeChart, columnChart, chartBlock, tableView } from '../charts.js';
import { EX, PROGRAMS, PHASE_ORDER, WEEKLY_STRENGTH_TARGET, blockOf, programWeek, resistanceText, unitSuffix } from '../program.js';
import { weeklyAverages, weeklySessions, exerciseHistory, blockSummary, valuesInRange, isStrength, movingAverageSeries, trendWeight, trendRate, testHistory, compareTests } from '../stats.js';
import { whtr } from '../targets.js';
import { addDays, avg, clamp, daysBetween, fmtDate, fmtNum, weekStart } from '../util.js';
import { today, startKey, go, runAction } from '../context.js';

const SERIES_1 = 'var(--series-1)';
const SERIES_2 = 'var(--series-2)';
const MUTED = 'var(--muted)';

let range = (() => { try { return Number(localStorage.getItem('progress-range') ?? 12); } catch { return 12; } })();
let selectedEx = null;

const kg = (v) => `${fmtNum(v)} kg`;
const signed = (v, unit) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v))}${unit}`;

function weightSection(from) {
  const inR = (d) => !from || d >= from;
  const daily = Object.values(state.daily).filter((r) => r.weight != null && inR(r.date)).map((r) => ({ date: r.date, value: r.weight }));
  const t = today();
  const weeks = weeklyAverages(state.daily, 'weight').filter((w) => inR(addDays(w.week, 6)));
  const trend = movingAverageSeries(state.daily, from);

  let summary = 'Haftada en az 3 kez tartıl; çizgi son 7 günün ortalamasıdır (trend kilo).';
  if (weeks.length >= 2) {
    const a = weeks[weeks.length - 2];
    const b = weeks[weeks.length - 1];
    const loss = a.avg - b.avg;
    const pct = (loss / a.avg) * 100;
    const status = pct > 1 ? '⚠️ çok hızlı (hedef %0,5–1)' : pct >= 0.5 ? '✓ hedef aralıkta' : pct >= 0 ? '↘ yavaş' : '↗ artış';
    summary = `Son hafta ort. ${kg(b.avg)} · önceki haftaya göre ${signed(-loss, ' kg')} (%${fmtNum(Math.abs(pct))}) — ${status}`;
    const tw = trendWeight(state.daily, t);
    const tr = trendRate(state.daily, t);
    if (tw != null) summary += ` · Trend şu an ${kg(tw)}${tr != null ? ` (son 7 günde ${signed(tr, ' kg')})` : ''}`;
  } else if (weeks.length === 1) {
    summary = `Bu hafta ort. ${kg(weeks[0].avg)}. Karşılaştırma için bir hafta daha veri gerekiyor.`;
  }

  return card(chartBlock({
    title: 'Kilo',
    subtitle: summary,
    legendItems: [{ name: 'Trend (7 gün ort.)', color: SERIES_1, kind: 'line' }, { name: 'Günlük tartı', color: MUTED, kind: 'dot' }],
    chart: timeChart({
      series: [
        { name: 'Günlük tartı', color: MUTED, type: 'dots', points: daily },
        { name: 'Trend (7 gün ort.)', color: SERIES_1, type: 'line', points: trend },
      ],
      yFormat: (v) => fmtNum(v),
      ariaLabel: 'Kilo grafiği',
      empty: 'Henüz kilo kaydı yok. Bugün ekranından günlük kayıt ekle.',
    }),
    table: weeks.length ? tableView(['Hafta', 'Ortalama', 'Tartı sayısı'], weeks.slice().reverse().map((w) => [fmtDate(w.week), kg(w.avg), String(w.n)])) : null,
  }));
}

function waistSection(from) {
  const list = state.measurements.filter((m) => m.waistCm != null && (!from || m.date >= from));
  const height = state.profile?.heightCm;
  const last = list.length ? whtr(list[list.length - 1].waistCm, height) : null;
  let summary = 'Haftada 1 kez ölç: sabah, göbek hizasından, nefes verdikten sonra.';
  if (list.length >= 2) {
    const d = list[list.length - 1].waistCm - list[0].waistCm;
    summary = `Son ölçüm ${fmtNum(list[list.length - 1].waistCm)} cm · dönem başına göre ${signed(d, ' cm')}`;
  } else if (list.length === 1) {
    summary = `Son ölçüm ${fmtNum(list[0].waistCm)} cm.`;
  }
  if (last) summary += ` · Bel/boy ${fmtNum(last.ratio, 2)} — ${last.label}${last.ratio >= 0.5 ? ` · hedef bel < ${fmtNum(last.targetWaist)} cm` : ''}`;
  return card(chartBlock({
    title: 'Bel çevresi',
    subtitle: summary,
    chart: timeChart({
      series: [{ name: 'Bel çevresi', color: SERIES_1, type: 'line', points: list.map((m) => ({ date: m.date, value: m.waistCm })) }],
      yFormat: (v) => fmtNum(v),
      ariaLabel: 'Bel çevresi grafiği',
      empty: 'Henüz bel ölçümü yok.',
      ref: height ? { value: Math.round(height * 5) / 10, label: 'bel/boy 0,5' } : null,
    }),
    table: list.length ? tableView(['Tarih', 'Bel (cm)', 'Bel/boy'], list.slice().reverse().map((m) => [fmtDate(m.date), fmtNum(m.waistCm), height ? fmtNum(m.waistCm / height, 2) : '–'])) : null,
  }));
}

function testsSection() {
  const tests = testHistory(state.measurements);
  const lower = (v) => (v ? v.toLocaleLowerCase('tr-TR') : '');
  const parts = [h('div', { class: 'card-head' }, h('h3', { text: '🏅 Güç testleri' }), btn('Test yap', () => runAction('form:test'), 'small'))];
  if (!tests.length) {
    parts.push(h('p', { class: 'muted', text: '4 haftada bir 5 dakikalık test (şınav, plank, 1 dk squat): kilo değişmese bile güçlendiğini gösterir.' }));
    return card(...parts);
  }
  if (tests.length >= 2) {
    const lines = ['İlk testten bu yana:', ...compareTests(tests[0], tests[tests.length - 1])];
    parts.push(h('p', { class: 'small pre', text: lines.join('\n') }));
  }
  parts.push(tableView(['Tarih', 'Şınav', 'Plank', 'Squat/dk'], tests.slice().reverse().map((r) => [
    fmtDate(r.date),
    r.pushupReps == null ? '–' : `${lower(r.pushupLevel)} ${r.pushupReps}`.trim(),
    r.plankSec == null ? '–' : `${r.plankSec} sn`,
    r.squat60 == null ? '–' : String(r.squat60),
  ])));
  return card(...parts);
}

function sessionsSection(weeksN) {
  const rows = weeklySessions(state.workouts, state.padel, today(), weeksN);
  const cats = rows.map((r) => ({ key: r.week, label: fmtDate(r.week), title: `${fmtDate(r.week)} – ${fmtDate(addDays(r.week, 6))}` }));
  const done = rows.filter((r) => r.strength >= WEEKLY_STRENGTH_TARGET).length;
  return card(chartBlock({
    title: 'Haftalık antrenman',
    subtitle: `Son ${weeksN} haftanın ${done} tanesinde 3 kuvvet hedefi tutturuldu.`,
    legendItems: [{ name: 'Kuvvet', color: SERIES_1, kind: 'rect' }, { name: 'Padel', color: SERIES_2, kind: 'rect' }],
    chart: columnChart({
      categories: cats,
      series: [
        { name: 'Kuvvet', color: SERIES_1, values: rows.map((r) => r.strength) },
        { name: 'Padel', color: SERIES_2, values: rows.map((r) => r.padel) },
      ],
      target: WEEKLY_STRENGTH_TARGET,
      ariaLabel: 'Haftalık kuvvet ve padel seansları',
    }),
    table: tableView(['Hafta', 'Kuvvet', 'Padel'], rows.slice().reverse().map((r) => [fmtDate(r.week), String(r.strength), String(r.padel)])),
  }));
}

function exerciseOptions() {
  const used = new Set(state.workouts.flatMap((w) => (w.exercises ?? []).filter((e) => e.sets?.some((s) => s.done)).map((e) => e.exerciseId)));
  const order = [];
  const phases = [state.settings.phase, ...PHASE_ORDER.filter((p) => p !== state.settings.phase)];
  for (const p of phases) for (const day of ['A', 'B']) for (const it of PROGRAMS[p][day]) if (used.has(it.ex) && !order.includes(it.ex)) order.push(it.ex);
  for (const id of used) if (!order.includes(id)) order.push(id);
  return order;
}

function exerciseSection(from, rerender) {
  const ids = exerciseOptions();
  if (!ids.length) {
    return card(h('h3', { text: 'Hareket ilerlemesi' }), h('p', { class: 'empty', text: 'Antrenman kaydettikçe her hareketin ilerlemesi burada görünecek.' }));
  }
  if (!selectedEx || !ids.includes(selectedEx)) selectedEx = ids[0];
  const ex = EX[selectedEx] ?? { name: selectedEx, unit: 'reps' };
  const hist = exerciseHistory(state.workouts, selectedEx).filter((e) => !from || e.date >= from);
  const byDate = new Map(hist.map((e) => [e.date, e]));
  const points = [...byDate.values()].map((e) => ({ date: e.date, value: e.best }));
  const loadOf = (e) => [e.variant, resistanceText(e.resistance)].filter(Boolean).join(', ') || '—';
  const withLoad = (e) => (loadOf(e) === '—' ? '' : ` (${loadOf(e)})`);
  const sel = selectEl(ids.map((id) => ({ value: id, label: EX[id]?.name ?? id })), selectedEx, (v) => { selectedEx = v; rerender(); });
  sel.setAttribute('aria-label', 'Hareket seç');
  let subtitle = 'En iyi set (tekrar ya da saniye) — yük değişimleri tabloda.';
  if (hist.length >= 2) {
    const a = hist[0];
    const b = hist[hist.length - 1];
    subtitle = `${hist.length} seans · ilk: ${a.best}${unitSuffix(ex.unit)}${withLoad(a)} → son: ${b.best}${unitSuffix(ex.unit)}${withLoad(b)}`;
  }
  return card(
    h('div', { class: 'card-head' }, h('h3', { text: 'Hareket ilerlemesi' })),
    sel,
    chartBlock({
      subtitle,
      chart: timeChart({
        series: [{ name: 'En iyi set', color: SERIES_1, type: 'line', points }],
        yFormat: (v) => fmtNum(v, 0),
        ariaLabel: `${ex.name} ilerleme grafiği`,
        empty: 'Bu aralıkta kayıt yok.',
      }),
      table: hist.length ? tableView(['Tarih', 'Yük / seviye', 'Setler'], hist.slice().reverse().map((e) => [fmtDate(e.date), loadOf(e), e.sets.map((s) => s.reps).join(' · ')])) : null,
    }));
}

function weeklyTable(weeksN) {
  const cur = weekStart(today());
  const rows = [];
  for (let i = 0; i < weeksN; i++) {
    const wk = addDays(cur, -7 * i);
    const end = addDays(wk, 6);
    const f = (field, d = 1) => { const a = avg(valuesInRange(state.daily, field, wk, end)); return a == null ? '–' : fmtNum(a, d); };
    const strength = state.workouts.filter((w) => w.date >= wk && w.date <= end && isStrength(w)).length;
    const padel = state.padel.filter((p) => p.date >= wk && p.date <= end).length;
    rows.push([fmtDate(wk), f('weight'), f('sleepH'), f('proteinG', 0), f('steps', 0), String(strength), String(padel)]);
  }
  return card(
    h('h3', { text: 'Haftalık özet' }),
    h('div', { class: 'table-scroll' },
      h('table', null,
        h('thead', null, h('tr', null, ['Hafta', 'Kilo', 'Uyku', 'Protein', 'Adım', 'Kuvvet', 'Padel'].map((t) => h('th', { text: t })))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', { text: c }))))))));
}

function blockSection() {
  const sk = startKey();
  const t = today();
  const week = programWeek(sk, t);
  if (week < 1) return null;
  const { block } = blockOf(week);
  const items = [];
  for (let b = block; b >= 1 && items.length < 3; b--) {
    const s = blockSummary(state, sk, b);
    const current = b === block;
    const lines = [
      `Kuvvet antrenmanı: ${s.strengthDone}/${s.strengthPlanned} (%${fmtNum(s.rate * 100, 0)})${!current ? (s.rate >= 0.8 ? ' ✓' : ' — hedef %80') : ''}`,
      `Padel: ${s.padel}`,
      s.weightStart != null && s.weightEnd != null ? `Kilo: ${kg(s.weightStart)} → ${kg(s.weightEnd)} (${signed(s.weightEnd - s.weightStart, ' kg')})` : 'Kilo: karşılaştırma için ilk ve son haftada tartı gerekli',
      s.waistStart != null && s.waistEnd != null ? `Bel: ${fmtNum(s.waistStart)} → ${fmtNum(s.waistEnd)} cm (${signed(s.waistEnd - s.waistStart, ' cm')})` : 'Bel: en az 2 ölçüm gerekli',
      s.tracked ? `Hareketlerde ilerleme: ${s.improved}/${s.tracked}` : 'Hareket ilerlemesi: yeterli veri yok',
    ];
    const tests = testHistory(state.measurements);
    const before = tests.filter((x) => x.date < s.from).pop() ?? tests.find((x) => x.date <= addDays(s.from, 6));
    const after = tests.filter((x) => x.date >= addDays(s.from, 21) && x.date <= addDays(s.to, 7)).pop();
    if (before && after && before !== after) lines.push(`Güç testi: ${compareTests(before, after).join(' · ')}`);
    const tips = [];
    if (!current) {
      if (s.rate < 0.8) tips.push('Antrenman oranı %80\'in altında: takvimi gerçekçi hale getir; 2 gün de yeterli bir başlangıç.');
      if (s.weightStart != null && s.weightEnd != null) {
        const perWeek = (s.weightStart - s.weightEnd) / 3;
        if (perWeek < 0.3) tips.push('Kilo kaybı haftada 0,3 kg\'ın altında: kaloriyi 150–200 kcal azaltmayı düşün.');
        else if (perWeek > (state.profile?.lossMaxKg ?? 0.8)) tips.push('Kilo çok hızlı gidiyor: kaloriyi biraz artır, kas kaybını önle.');
      }
      if (s.tracked && s.improved / s.tracked < 0.5) tips.push('Hareketlerin yarısından azında ilerleme var: setleri RIR 1–3\'e kadar zorladığından emin ol.');
    }
    items.push(h('div', { class: 'block-item' },
      h('h4', { text: `${b}. blok · ${fmtDate(s.from)} – ${fmtDate(s.to)}${current ? ' (devam ediyor)' : ''}` }),
      h('ul', { class: 'rules' }, lines.map((l) => h('li', { text: l }))),
      tips.length ? h('ul', { class: 'tips' }, tips.map((l) => h('li', { text: l }))) : null));
  }
  return card(h('h3', { text: 'Blok değerlendirmesi (4 hafta)' }), items);
}

export function renderProgress(root) {
  const t = today();
  const sk = startKey();
  const sinceStart = Math.ceil((daysBetween(weekStart(sk), weekStart(t)) + 7) / 7);
  // Programdan önceki boş haftaları gösterme.
  const weeksN = range ? clamp(sinceStart, Math.min(4, range), range) : clamp(sinceStart, 4, 26);
  const from = range ? addDays(weekStart(t), -7 * (range - 1)) : null;
  const rerender = () => { root.replaceChildren(); renderProgress(root); };

  const filter = segmented(
    [{ value: 4, label: '4 hafta' }, { value: 12, label: '12 hafta' }, { value: 0, label: 'Tümü' }],
    range,
    (v) => {
      range = v ?? 12;
      try { localStorage.setItem('progress-range', String(range)); } catch { /* yoksay */ }
      rerender();
    });
  filter.setAttribute('aria-label', 'Zaman aralığı');

  root.append(
    h('header', { class: 'page-head' },
      h('div', null, h('h1', { text: 'İlerleme' }), h('p', { class: 'muted', text: 'Tek tek günlere değil, eğilime bak.' })),
      h('button', { type: 'button', class: 'btn small', text: '🗂️ Geçmiş kayıtlar', onClick: () => go('/gecmis') })),
    h('div', { class: 'filter-row' }, filter),
    weightSection(from),
    waistSection(from),
    sessionsSection(weeksN),
    exerciseSection(from, rerender),
    testsSection(),
    weeklyTable(Math.min(weeksN, 12)),
  );
  const bs = blockSection();
  if (bs) root.append(bs);
}
