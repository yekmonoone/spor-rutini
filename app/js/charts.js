// SVG grafikler: zaman çizgisi (çizgi + nokta) ve yığılmış sütun. Kütüphane yok.
// İnce işaretler, kılçık ızgara, dokunma/üzerine gelme ipucu ve her grafikte tablo görünümü.
import { h, appendChildren } from './ui.js';
import { daysBetween, addDays, fmtDate, fmtNum } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, style = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  if (style) Object.assign(el.style, style);
  return el;
}

export function niceScale(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] };
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, step, ticks };
}

/** Kapsayıcı genişliği değişince yeniden çizer. */
function responsive(wrap, draw) {
  let lastW = 0;
  const run = () => {
    const w = Math.round(wrap.clientWidth || 320);
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    draw(Math.max(260, w));
  };
  run();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(wrap);
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map((it) =>
    h('span', { class: 'legend-item' },
      h('span', { class: `key key-${it.kind ?? 'line'}`, style: { background: it.color } }),
      h('span', { text: it.name }))));
}

export function tableView(headers, rows) {
  return h('details', { class: 'table-view' },
    h('summary', { text: 'Tablo görünümü' }),
    h('div', { class: 'table-scroll' },
      h('table', null,
        h('thead', null, h('tr', null, headers.map((t) => h('th', { text: t })))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', { text: c }))))))));
}

function tooltipRows(tip, title, rows) {
  tip.replaceChildren(h('div', { class: 'tip-title', text: title }),
    ...rows.map((r) => h('div', { class: 'tip-row' },
      h('span', { class: `key key-${r.kind ?? 'line'}`, style: { background: r.color } }),
      h('strong', { text: r.value }),
      h('span', { class: 'tip-name', text: r.name }))));
  tip.hidden = false;
}

function placeTip(tip, wrap, x) {
  const w = tip.offsetWidth || 140;
  const left = Math.min(Math.max(0, x - w / 2), wrap.clientWidth - w);
  tip.style.left = `${left}px`;
}

/**
 * Zaman grafiği.
 * series: [{ name, color, type: 'line'|'dots', points: [{ date, value, from?, to? }] }]
 * opts: { height, yFormat, unit, ariaLabel, empty }
 */
/** ref: isteğe bağlı yatay referans çizgisi { value, label } (ör. bel/boy 0,5 hedefi). */
export function timeChart({ series, height = 200, yFormat = (v) => fmtNum(v), ariaLabel = 'Grafik', empty = 'Henüz veri yok.', ref = null }) {
  const all = series.flatMap((se) => se.points);
  const wrap = h('div', { class: 'chart' });
  if (!all.length) {
    wrap.append(h('p', { class: 'empty', text: empty }));
    return wrap;
  }
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const dates = [...new Set(all.map((p) => p.date))].sort();
  let xFrom = dates[0];
  let xTo = dates[dates.length - 1];
  if (xFrom === xTo) { xFrom = addDays(xFrom, -3); xTo = addDays(xTo, 3); }
  const values = all.map((p) => p.value);
  if (ref && Number.isFinite(ref.value)) values.push(ref.value);
  const sc = niceScale(Math.min(...values), Math.max(...values), 4);

  const draw = (width) => {
    const m = { l: 44, r: 14, t: 12, b: 26 };
    const pw = width - m.l - m.r;
    const ph = height - m.t - m.b;
    const span = Math.max(1, daysBetween(xFrom, xTo));
    const x = (d) => m.l + (daysBetween(xFrom, d) / span) * pw;
    const y = (v) => m.t + ph - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ph;

    const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel, tabindex: 0 });
    for (const t of sc.ticks) {
      svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), 'stroke-width': 1 }, { stroke: 'var(--grid)' }));
      const lbl = s('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'axis' });
      lbl.textContent = yFormat(t);
      svg.append(lbl);
    }
    svg.append(s('line', { x1: m.l, x2: width - m.r, y1: m.t + ph, y2: m.t + ph, 'stroke-width': 1 }, { stroke: 'var(--baseline)' }));
    const xTicks = span <= 7 ? [xFrom, xTo] : [xFrom, addDays(xFrom, Math.round(span / 2)), xTo];
    xTicks.forEach((d, i) => {
      const t = s('text', { x: x(d), y: height - 6, 'text-anchor': i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle', class: 'axis' });
      t.textContent = fmtDate(d);
      svg.append(t);
    });

    if (ref && Number.isFinite(ref.value)) {
      svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y(ref.value), y2: y(ref.value), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, { stroke: 'var(--good)' }));
      if (ref.label) {
        const lbl = s('text', { x: width - m.r, y: y(ref.value) - 5, 'text-anchor': 'end', class: 'axis' });
        lbl.textContent = ref.label;
        svg.append(lbl);
      }
    }
    for (const se of series) {
      const pts = [...se.points].sort((a, b) => (a.date < b.date ? -1 : 1));
      if (se.type === 'line' && pts.length > 1) {
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
        svg.append(s('path', { d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, { stroke: se.color }));
      }
      const dotsToDraw = se.type === 'line' ? pts.slice(-1) : pts;
      for (const p of dotsToDraw) {
        svg.append(s('circle', { cx: x(p.date), cy: y(p.value), r: 4, 'stroke-width': 2 }, { fill: se.color, stroke: 'var(--surface)' }));
      }
    }

    const cross = s('line', { y1: m.t, y2: m.t + ph, 'stroke-width': 1, visibility: 'hidden' }, { stroke: 'var(--muted)' });
    svg.append(cross);
    const hit = s('rect', { x: m.l, y: 0, width: pw, height, fill: 'transparent' });
    svg.append(hit);

    let idx = -1;
    const show = (i) => {
      idx = Math.max(0, Math.min(dates.length - 1, i));
      const d = dates[idx];
      const cx = x(d);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      const rows = [];
      for (const se of series) {
        // Nokta bir aralığı temsil ediyorsa (ör. haftalık ortalama) from–to ile eşleşir, değilse aynı gün.
        const p = se.points.find((q) => (q.from ? d >= q.from && d <= q.to : q.date === d));
        if (p) rows.push({ name: se.name, color: se.color, kind: se.type === 'dots' ? 'dot' : 'line', value: yFormat(p.value) });
      }
      tooltipRows(tip, fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' }), rows);
      placeTip(tip, wrap, cx);
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    const nearest = (px) => {
      let best = 0;
      let bestD = Infinity;
      dates.forEach((d, i) => { const dd = Math.abs(x(d) - px); if (dd < bestD) { bestD = dd; best = i; } });
      return best;
    };
    const px = (e) => {
      const r = svg.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * width;
    };
    hit.addEventListener('pointermove', (e) => show(nearest(px(e))));
    hit.addEventListener('pointerdown', (e) => show(nearest(px(e))));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('focus', () => show(dates.length - 1));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { show(idx - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { show(idx + 1); e.preventDefault(); }
    });

    wrap.replaceChildren(svg, tip);
  };
  queueMicrotask(() => responsive(wrap, draw));
  return wrap;
}

function barPath(x, y, w, hgt, r) {
  const rr = Math.max(0, Math.min(r, w / 2, hgt));
  return `M${x},${y + hgt} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + hgt} Z`;
}

/**
 * Yığılmış sütun grafiği.
 * categories: [{ key, label, title }]; series: [{ name, color, values: [] }]; target: yatay hedef çizgisi
 */
export function columnChart({ categories, series, height = 180, target = null, ariaLabel = 'Sütun grafiği' }) {
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const totals = categories.map((_, i) => series.reduce((a, se) => a + (se.values[i] ?? 0), 0));
  const maxV = Math.max(1, target ?? 0, ...totals);
  const step = maxV <= 6 ? 1 : 2;
  const hi = Math.ceil(maxV / step) * step;
  const ticks = [];
  for (let v = 0; v <= hi; v += step) ticks.push(v);

  const draw = (width) => {
    // Hedef etiketi çubuklarla çakışmasın diye sağ boşlukta durur.
    const m = { l: 30, r: target != null ? 58 : 14, t: 14, b: 26 };
    const pw = width - m.l - m.r;
    const ph = height - m.t - m.b;
    const slot = pw / categories.length;
    const bw = Math.min(24, slot * 0.6);
    const y = (v) => m.t + ph - (v / hi) * ph;
    const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel });

    for (const t of ticks) {
      svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), 'stroke-width': 1 }, { stroke: t === 0 ? 'var(--baseline)' : 'var(--grid)' }));
      const lbl = s('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'axis' });
      lbl.textContent = String(t);
      svg.append(lbl);
    }
    if (target != null) {
      svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y(target), y2: y(target), 'stroke-width': 1 }, { stroke: 'var(--text-2)' }));
      const tl = s('text', { x: width - m.r + 6, y: y(target) + 4, 'text-anchor': 'start', class: 'axis strong' });
      tl.textContent = `Hedef ${target}`;
      svg.append(tl);
    }

    categories.forEach((c, i) => {
      const cx = m.l + slot * i + slot / 2;
      let base = 0;
      const segs = series.map((se) => ({ se, v: se.values[i] ?? 0 })).filter((g) => g.v > 0);
      segs.forEach((g, j) => {
        const top = base + g.v;
        const y0 = y(base) - (j > 0 ? 2 : 0); // 2px yüzey boşluğu
        const y1 = y(top);
        const isTop = j === segs.length - 1;
        const hgt = Math.max(0, y0 - y1);
        svg.append(isTop
          ? s('path', { d: barPath(cx - bw / 2, y1, bw, hgt, 4) }, { fill: g.se.color })
          : s('rect', { x: cx - bw / 2, y: y1, width: bw, height: hgt }, { fill: g.se.color }));
        base = top;
      });
      if (i === 0 || i === categories.length - 1 || categories.length <= 6) {
        const t = s('text', { x: cx, y: height - 6, 'text-anchor': 'middle', class: 'axis' });
        t.textContent = c.label;
        svg.append(t);
      }
      const hitR = s('rect', { x: m.l + slot * i, y: 0, width: slot, height, fill: 'transparent', tabindex: 0, 'aria-label': `${c.title ?? c.label}: ${series.map((se) => `${se.name} ${se.values[i] ?? 0}`).join(', ')}` });
      const show = () => {
        tooltipRows(tip, c.title ?? c.label, series.map((se) => ({ name: se.name, color: se.color, kind: 'rect', value: String(se.values[i] ?? 0) })));
        placeTip(tip, wrap, cx);
      };
      hitR.addEventListener('pointerenter', show);
      hitR.addEventListener('pointerdown', show);
      hitR.addEventListener('focus', show);
      hitR.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
      hitR.addEventListener('blur', () => { tip.hidden = true; });
      svg.append(hitR);
    });
    wrap.replaceChildren(svg, tip);
  };
  queueMicrotask(() => responsive(wrap, draw));
  return wrap;
}

export function chartBlock({ title, subtitle, chart, legendItems, table }) {
  return appendChildren(h('div', { class: 'chart-block' }), [
    title ? h('h3', { text: title }) : null,
    subtitle ? h('p', { class: 'muted small', text: subtitle }) : null,
    legendItems && legendItems.length > 1 ? legend(legendItems) : null,
    chart,
    table ?? null,
  ]);
}
