// İlk açılış: profil, program başlangıcı ve ekipman durumu.
import { state, setKV, updateSettings } from '../store.js';
import { h, appendChildren, btn, field, segmented, toast } from '../ui.js';
import { PHASES, PHASE_ORDER } from '../program.js';
import { dateKey } from '../util.js';
import { isIOS, isStandalone } from '../env.js';
import { importBackupFlow } from '../forms.js';
import { go } from '../context.js';
import { profileForm } from './profile-form.js';

export function installHint() {
  return h('section', { class: 'card highlight' },
    h('h2', { text: '📲 Önce ana ekrana ekle' }),
    h('ol', { class: 'steps' },
      h('li', { text: 'Safari\'de alttaki Paylaş düğmesine (kare ve yukarı ok) dokun.' }),
      h('li', { text: '"Ana Ekrana Ekle"yi seç, sonra "Ekle"ye dokun.' }),
      h('li', { text: 'Uygulamayı bundan sonra ana ekrandaki simgeden aç.' })),
    h('p', { class: 'muted small', text: 'Önemli: Safari sekmesinde girilen veriler ana ekran uygulamasına taşınmaz. Kurulumu yapıp oradan başla.' }));
}

export function renderOnboarding(root) {
  if (state.profile) { go('/bugun'); return; }
  const form = profileForm({});
  const start = h('input', { type: 'date', class: 'input', value: dateKey() });
  const phase = segmented(PHASE_ORDER.map((p) => ({ value: p, label: PHASES[p].label })), 'bodyweight');

  const begin = async () => {
    try {
      const profile = form.read();
      if (!start.value) throw new Error('Program başlangıç tarihini seç.');
      await updateSettings({ programStart: start.value, phase: phase.getValue() ?? 'bodyweight' });
      await setKV('profile', { ...profile, createdDay: dateKey(), createdAt: new Date().toISOString() });
      toast('Hazırsın! İlk hafta 2 setle başla 💪');
      go('/bugun');
    } catch (err) {
      toast(err.message);
    }
  };

  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: 'Hoş geldin 👋' }),
      h('p', { class: 'muted', text: 'Rutinini, antrenmanlarını ve ilerlemeni burada takip edeceksin. Veriler yalnızca bu cihazda saklanır.' }))),
    isIOS() && !isStandalone() ? installHint() : null,
    h('section', { class: 'card' }, h('h2', { text: 'Profilin' }), form.el),
    h('section', { class: 'card' },
      h('h2', { text: 'Program' }),
      field('Başlangıç tarihi', start, 'Hafta ve blok (4 hafta) sayımı bu tarihten başlar.'),
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Şu anki ekipmanın' }),
        phase,
        h('div', { class: 'hint', text: 'Bant ve mat gelene kadar "Ekipmansız" ile başla; sonra Ayarlar\'dan değiştirirsin.' }))),
    btn('Başla', begin, 'primary block big'),
    h('p', { class: 'center' }, h('button', { type: 'button', class: 'link', text: 'Yeni telefon mu? Yedekten geri yükle', onClick: importBackupFlow })),
    h('p', { class: 'muted small center disclaimer', text: 'Bu uygulama genel bilgi verir, tıbbi tavsiye değildir.' }),
  ]);
}
