// Açılış: verileri yükle, yönlendiriciyi başlat, service worker'ı kaydet.
import { loadAll, subscribe, state } from './store.js';
import { requestPersistence } from './db.js';
import { h } from './ui.js';
import { renderToday } from './views/today.js';
import { renderProgram } from './views/program.js';
import { renderActive } from './views/active.js';
import { renderProgress } from './views/progress.js';
import { renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderSyncPage } from './views/sync-card.js';
import { initSync } from './sync.js';
import { renderAssistant } from './views/assistant.js';
import { renderMeals } from './views/meals.js';
import { renderCheckin } from './views/checkin.js';

const ROUTES = {
  '/bugun': { render: renderToday, tab: 'bugun', title: 'Bugün' },
  '/antrenman': { render: renderProgram, tab: 'antrenman', title: 'Antrenman' },
  '/antrenman/aktif': { render: renderActive, tab: 'antrenman', title: 'Antrenman' },
  '/ilerleme': { render: renderProgress, tab: 'ilerleme', title: 'İlerleme' },
  '/gecmis': { render: renderHistory, tab: 'ilerleme', title: 'Geçmiş' },
  '/yemek': { render: (r) => renderMeals(r, 'bugun'), tab: 'yemek', title: 'Yemek' },
  '/yemek/plan': { render: (r) => renderMeals(r, 'plan'), tab: 'yemek', title: 'Yemek planı' },
  '/yemek/alisveris': { render: (r) => renderMeals(r, 'alisveris'), tab: 'yemek', title: 'Alışveriş' },
  '/yemek/rehber': { render: (r) => renderMeals(r, 'rehber'), tab: 'yemek', title: 'Yemek rehberi' },
  '/yemek/tercihler': { render: (r) => renderMeals(r, 'tercihler'), tab: 'yemek', title: 'Yemek tercihleri' },
  '/ayarlar': { render: renderSettings, tab: 'ayarlar', title: 'Ayarlar' },
  '/hosgeldin': { render: renderOnboarding, tab: null, title: 'Hoş geldin' },
  '/esitleme': { render: renderSyncPage, tab: null, title: 'Eşitleme' },
  '/asistan': { render: renderAssistant, tab: 'bugun', title: 'Asistan' },
  '/haftalik': { render: renderCheckin, tab: 'bugun', title: 'Haftalık kontrol' },
};
const NO_PROFILE_OK = ['/hosgeldin', '/esitleme'];

const TABS = [
  { id: 'bugun', path: '/bugun', icon: '🏠', label: 'Bugün' },
  { id: 'antrenman', path: '/antrenman', icon: '🏋️', label: 'Antrenman' },
  { id: 'yemek', path: '/yemek', icon: '🍽️', label: 'Yemek' },
  { id: 'ilerleme', path: '/ilerleme', icon: '📈', label: 'İlerleme' },
  { id: 'ayarlar', path: '/ayarlar', icon: '⚙️', label: 'Ayarlar' },
];

let current = null; // { path, handle }
const viewEl = () => document.getElementById('view');

function currentPath() {
  const p = location.hash.replace(/^#/, '');
  return ROUTES[p] ? p : '/bugun';
}

function errorBox(err) {
  return h('section', { class: 'card alert warn' },
    h('div', { class: 'alert-main' },
      h('strong', { text: 'Bir şeyler ters gitti' }),
      h('p', { class: 'pre small', text: String(err?.message ?? err) }),
      h('button', { type: 'button', class: 'btn small', text: 'Sayfayı yenile', onClick: () => location.reload() })));
}

function updateTabs(active) {
  const nav = document.getElementById('tabbar');
  nav.hidden = !active;
  document.body.classList.toggle('no-tabs', !active);
  for (const a of nav.querySelectorAll('.tab')) {
    const on = a.dataset.tab === active;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function render(path = currentPath(), { keepScroll = false } = {}) {
  if (!state.profile && !NO_PROFILE_OK.includes(path)) {
    history.replaceState(null, '', '#/hosgeldin');
    path = '/hosgeldin';
  }
  const route = ROUTES[path];
  const y = window.scrollY;
  const same = current?.path === path;
  try { current?.handle?.unmount?.(); } catch (err) { console.error(err); }
  const root = viewEl();
  root.replaceChildren();
  let handle = null;
  try {
    handle = route.render(root) ?? null;
  } catch (err) {
    console.error(err);
    root.append(errorBox(err));
  }
  current = { path, handle };
  document.title = `${route.title} · Spor Rutini`;
  updateTabs(route.tab);
  window.scrollTo(0, same && keepScroll ? y : 0);
}

function buildTabs() {
  document.getElementById('tabbar').replaceChildren(...TABS.map((t) =>
    h('a', { href: `#${t.path}`, class: 'tab', dataset: { tab: t.id } },
      h('span', { class: 'tab-icon', 'aria-hidden': 'true', text: t.icon }),
      h('span', { class: 'tab-label', text: t.label }))));
}

function showUpdateBanner(onAccept) {
  if (document.getElementById('update-banner')) return;
  document.body.append(h('div', { id: 'update-banner', class: 'update-banner', role: 'status' },
    h('span', { text: 'Yeni sürüm hazır.' }),
    h('button', { type: 'button', class: 'btn small primary', text: 'Yenile', onClick: onAccept })));
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const enabled = location.protocol === 'https:' || new URLSearchParams(location.search).has('sw');
  if (!enabled) {
    // Yerel geliştirmede önbellek eski dosya göstermesin.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => showUpdateBanner(() => worker.postMessage('SKIP_WAITING'));
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Service worker kaydedilemedi:', err));
}

async function boot() {
  buildTabs();
  try {
    await loadAll();
  } catch (err) {
    viewEl().replaceChildren(errorBox(err));
    return;
  }
  requestPersistence();
  subscribe(() => {
    if (!current || current.handle?.sticky) return;
    render(current.path, { keepScroll: true });
  });
  window.addEventListener('hashchange', () => render());
  // Uygulama arka plandan dönünce (ör. ertesi gün) ekranı tazele.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current && !current.handle?.sticky) render(current.path, { keepScroll: true });
  });
  render();
  initSync();
  setupServiceWorker();
}

boot();
