// Set arası dinlenme sayacı. Bitiş zamanı saklanır; uygulama arka plana gidip dönse de doğru kalır.
import { h } from './ui.js';
import { fmtClock } from './util.js';

let audioCtx = null;
let endAt = 0;
let tick = null;
let soundOn = true;

/** Ses yalnızca kullanıcı dokunuşuyla açılabilir (iOS); bu yüzden set onayında çağrılır. */
export function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* ses yok */ }
}

function beep() {
  if (!soundOn || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    for (const [i, f] of [880, 1175].entries()) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * 0.22);
      o.stop(t0 + i * 0.22 + 0.22);
    }
  } catch { /* yoksay */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* yoksay */ }
}

function bar() {
  return document.getElementById('restbar');
}

function render() {
  const el = bar();
  if (!el) return;
  const left = Math.ceil((endAt - Date.now()) / 1000);
  if (left <= 0) {
    stop();
    beep();
    el.replaceChildren(h('div', { class: 'rest-inner done' }, h('strong', { text: 'Dinlenme bitti — sıradaki set!' })));
    el.hidden = false;
    setTimeout(() => { if (!tick) el.hidden = true; }, 3500);
    return;
  }
  el.hidden = false;
  el.replaceChildren(h('div', { class: 'rest-inner' },
    h('span', { class: 'muted', text: 'Dinlenme' }),
    h('strong', { class: 'rest-time', text: fmtClock(left) }),
    h('button', { type: 'button', class: 'btn small', text: '+15 sn', onClick: () => { endAt += 15000; render(); } }),
    h('button', { type: 'button', class: 'btn small', text: 'Geç', onClick: () => { stop(); el.hidden = true; } })));
}

export function startRest(seconds, { sound = true } = {}) {
  soundOn = sound;
  endAt = Date.now() + seconds * 1000;
  if (tick) clearInterval(tick);
  tick = setInterval(render, 250);
  render();
}

export function stop() {
  if (tick) clearInterval(tick);
  tick = null;
}

export function cancelRest() {
  stop();
  const el = bar();
  if (el) el.hidden = true;
}

/** Plank gibi süreli hareketler için kronometre: { start(onTick), stop() → saniye } */
export function stopwatch() {
  let t0 = 0;
  let iv = null;
  return {
    get running() { return iv != null; },
    start(onTick) {
      t0 = Date.now();
      iv = setInterval(() => onTick(Math.floor((Date.now() - t0) / 1000)), 250);
      onTick(0);
    },
    stop() {
      if (iv) clearInterval(iv);
      iv = null;
      return Math.round((Date.now() - t0) / 1000);
    },
  };
}
