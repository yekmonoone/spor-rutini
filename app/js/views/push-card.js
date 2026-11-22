// Ayarlar → Bildirimler kartı.
import { h, btn, card, checkbox, toast } from '../ui.js';
import { go } from '../context.js';
import { PUSH_TYPES, pushSupport, currentSubscription, enablePush, disablePush, updatePushPrefs, sendTestPush, localPrefs } from '../push.js';

const REASONS = {
  sync: 'Bildirimler için önce eşitlemeyi bağla (hatırlatmaları sunucu gönderir ve verine bakarak yalnızca gerekirse gönderir).',
  'ios-browser': 'iPhone\'da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4+). Safari\'de Paylaş → Ana Ekrana Ekle, sonra uygulamayı oradan aç.',
  unsupported: 'Bu tarayıcı bildirimleri desteklemiyor.',
  denied: 'Bildirim izni kapalı. iPhone Ayarlar → Bildirimler → Spor Rutini\'den açabilirsin.',
};

function prefsEditor(prefs) {
  const rows = Object.entries(PUSH_TYPES).map(([k, t]) => {
    const cb = checkbox(t.label, prefs[k].on);
    const time = h('input', { type: 'time', class: 'input time-input', value: prefs[k].time, 'aria-label': `${t.label} saati` });
    return { k, cb, time, el: h('div', { class: 'push-row' }, h('div', null, cb, h('div', { class: 'hint', text: t.hint })), time) };
  });
  const read = () => Object.fromEntries(rows.map((r) => [r.k, { on: r.cb.input.checked, time: /^\d{2}:\d{2}$/.test(r.time.value) ? r.time.value : prefs[r.k].time }]));
  return { el: h('div', { class: 'push-list' }, rows.map((r) => r.el)), read };
}

export function pushCard() {
  const body = h('div', null, h('p', { class: 'muted small', text: 'Yükleniyor…' }));
  const el = card(h('h2', { text: '🔔 Bildirimler' }), body);
  const render = async () => {
    const support = pushSupport();
    if (!support.ok) {
      body.replaceChildren(h('p', { class: 'small', text: REASONS[support.reason] }),
        support.reason === 'sync' ? btn('Eşitlemeyi bağla', () => go('/esitleme'), 'small') : null);
      return;
    }
    const sub = await currentSubscription();
    const prefs = localPrefs();
    const editor = prefsEditor(prefs);
    if (!sub) {
      body.replaceChildren(
        h('p', { class: 'small', text: 'Seçtiğin saatlerde hatırlatma gelir — yalnızca gerekiyorsa: kilo girdiysen sabah bildirimi gelmez, antrenmanı kaydettiysen akşam bildirimi gelmez.' }),
        editor.el,
        btn('Bildirimleri aç', async (e) => {
          e.target.disabled = true;
          try {
            await enablePush(editor.read());
            toast('Bildirimler açıldı 🔔');
          } catch (err) {
            toast(err.message);
          }
          render();
        }, 'primary block'));
      return;
    }
    body.replaceChildren(
      h('p', { class: 'small', text: '✓ Bu cihazda açık. Hatırlatmalar yalnızca gerekiyorsa gelir.' }),
      editor.el,
      h('div', { class: 'actions-row' },
        btn('Saatleri kaydet', async () => {
          try { await updatePushPrefs(editor.read()); toast('Kaydedildi ✓'); } catch (err) { toast(err.message); }
        }, 'primary'),
        btn('Deneme bildirimi', async () => {
          try { await sendTestPush(); toast('Gönderildi — birkaç saniye içinde gelmeli'); } catch (err) { toast(err.message); }
        })),
      btn('Bildirimleri kapat', async () => {
        try { await disablePush(); toast('Bildirimler kapatıldı'); } catch (err) { toast(err.message); }
        render();
      }, 'small danger-ghost'));
  };
  render().catch((err) => body.replaceChildren(h('p', { class: 'small', text: err.message })));
  return el;
}
