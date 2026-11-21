// Küçük arayüz yardımcıları: DOM oluşturma, alt sayfa (sheet), onay penceresi, bildirim ve form öğeleri.
// Kullanıcı metinleri her zaman textContent ile eklenir (innerHTML kullanılmaz).
import { fmtNum } from './util.js';

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  let deferredValue;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') deferredValue = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (k in el) el[k] = v; else el.setAttribute(k, ''); }
      else el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  if (deferredValue !== undefined) el.value = deferredValue;
  return el;
}

export function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/* ---------- Bildirim ---------- */
export function toast(message, ms = 2400) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = h('div', { class: 'toast', role: 'status', text: message });
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------- Alt sayfa ---------- */
export function openSheet({ title, content, actions = [], onClose }) {
  const root = document.getElementById('overlay-root');
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('open');
    setTimeout(() => {
      backdrop.remove();
      if (!root.children.length) document.body.classList.remove('no-scroll');
    }, 180);
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape' && root.lastElementChild === backdrop) close();
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  panel.append(
    h('div', { class: 'sheet-head' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Kapat', onClick: close, text: '✕' })),
    h('div', { class: 'sheet-body' }, content),
  );
  if (actions.length) panel.append(h('div', { class: 'sheet-foot' }, actions));

  root.append(backdrop);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return { close, panel };
}

export function confirmSheet({ title, message, confirmLabel = 'Evet', cancelLabel = 'Vazgeç', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    let sheet = null;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
      sheet?.close();
    };
    sheet = openSheet({
      title,
      content: h('p', { class: 'pre', text: message }),
      actions: [
        h('button', { class: 'btn', type: 'button', onClick: () => finish(false), text: cancelLabel }),
        h('button', { class: danger ? 'btn danger' : 'btn primary', type: 'button', onClick: () => finish(true), text: confirmLabel }),
      ],
      onClose: () => finish(false),
    });
  });
}

/* ---------- Form öğeleri ---------- */
let fieldSeq = 0;
export function field(label, control, hint) {
  if (!control.id) control.id = `f${++fieldSeq}`;
  return h('div', { class: 'field' },
    h('label', { for: control.id, text: label }),
    control,
    hint ? h('div', { class: 'hint', text: hint }) : null);
}

export function toInputText(v) {
  if (v == null || v === '') return '';
  return typeof v === 'number' ? fmtNum(v, 2).replace(/\./g, '') : String(v);
}

export function numInput({ value = null, placeholder = '', decimal = false, label } = {}) {
  return h('input', {
    type: 'text',
    inputmode: decimal ? 'decimal' : 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    class: 'input',
    value: toInputText(value),
    placeholder,
    'aria-label': label,
  });
}

export function textInput({ value = '', placeholder = '', multiline = false } = {}) {
  return multiline
    ? h('textarea', { class: 'input', rows: 3, placeholder, value })
    : h('input', { type: 'text', class: 'input', placeholder, value });
}

export function selectEl(options, value, onChange) {
  return h('select', { class: 'input', value: value ?? '', onChange: onChange ? (e) => onChange(e.target.value) : null },
    options.map((o) => h('option', { value: String(o.value), text: o.label })));
}

/** Tek seçimli düğme grubu. getValue() ile okunur. */
export function segmented(options, value, onChange) {
  let current = value;
  const group = h('div', { class: 'segmented', role: 'radiogroup' });
  const buttons = options.map((o) => h('button', {
    type: 'button',
    role: 'radio',
    class: 'seg',
    'aria-checked': String(o.value === current),
    text: o.label,
    onClick: () => {
      current = current === o.value && o.allowNone ? null : o.value;
      for (const [i, b] of buttons.entries()) b.setAttribute('aria-checked', String(options[i].value === current));
      onChange?.(current);
    },
  }));
  appendChildren(group, buttons);
  group.getValue = () => current;
  return group;
}

/** Çok seçimli etiketler. getValue() → seçili değerler dizisi. */
export function chips(options, values = []) {
  const set = new Set(values);
  const group = h('div', { class: 'chips' });
  for (const o of options) {
    const b = h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(set.has(o.value)),
      text: o.label,
      onClick: () => {
        if (set.has(o.value)) set.delete(o.value); else set.add(o.value);
        b.setAttribute('aria-pressed', String(set.has(o.value)));
      },
    });
    group.append(b);
  }
  group.getValue = () => options.map((o) => o.value).filter((v) => set.has(v));
  return group;
}

export function checkbox(label, checked = false) {
  const input = h('input', { type: 'checkbox', checked });
  const wrap = h('label', { class: 'check' }, input, h('span', { text: label }));
  wrap.input = input;
  return wrap;
}

export function card(...children) {
  return h('section', { class: 'card' }, children);
}

export function stat(label, value, sub) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-label', text: label }),
    h('div', { class: 'stat-value', text: value }),
    sub ? h('div', { class: 'stat-sub', text: sub }) : null);
}

export function btn(label, onClick, cls = '') {
  return h('button', { type: 'button', class: `btn ${cls}`.trim(), onClick, text: label });
}
