// Ayarlar: profil ve hedefler, program, yedekleme, kurulum, yapay zekâ (3. aşama), veriler.
import { state, setKV, updateSettings, wipeAll } from '../store.js';
import { h, appendChildren, btn, card, field, segmented, selectEl, checkbox, confirmSheet, toast } from '../ui.js';
import { DAY_TYPES, PHASES, PHASE_ORDER } from '../program.js';
import { WEEKDAYS, fmtDate } from '../util.js';
import { APP_VERSION } from '../version.js';
import { isIOS, isStandalone } from '../env.js';
import { exportBackupFlow, importBackupFlow } from '../forms.js';
import { go } from '../context.js';
import { profileForm } from './profile-form.js';
import { installHint } from './onboarding.js';

export function renderSettings(root) {
  const s = state.settings;
  const form = profileForm(state.profile ?? {}, { showTargets: true });

  const saveProfile = async () => {
    try {
      const p = form.read();
      await setKV('profile', { ...state.profile, ...p });
      toast('Profil ve hedefler kaydedildi ✓');
    } catch (err) {
      toast(err.message);
    }
  };

  const saved = () => toast('Kaydedildi ✓');
  const start = h('input', { type: 'date', class: 'input', value: s.programStart ?? '' });
  start.addEventListener('change', async () => { if (start.value) { await updateSettings({ programStart: start.value }); saved(); } });
  const phase = segmented(PHASE_ORDER.map((p) => ({ value: p, label: PHASES[p].label })), s.phase, async (v) => {
    if (!v) return;
    await updateSettings({ phase: v });
    toast(`Dönem: ${PHASES[v].label}`);
  });
  const typeOptions = Object.entries(DAY_TYPES).map(([value, d]) => ({ value, label: `${d.icon} ${d.label}` }));
  const schedule = h('div', { class: 'schedule' }, WEEKDAYS.map((name, i) => {
    const sel = selectEl(typeOptions, s.schedule[i], async (v) => {
      const next = [...state.settings.schedule];
      next[i] = v;
      await updateSettings({ schedule: next });
      saved();
    });
    return field(name, sel);
  }));
  const rest = selectEl([45, 60, 75, 90, 120].map((v) => ({ value: v, label: `${v} sn` })), s.restSec, async (v) => { await updateSettings({ restSec: Number(v) }); saved(); });
  const sound = checkbox('Dinlenme bitince sesli uyarı', s.sound !== false);
  sound.input.addEventListener('change', async () => { await updateSettings({ sound: sound.input.checked }); saved(); });

  const wipe = async () => {
    const ok1 = await confirmSheet({ title: 'Tüm verileri sil', message: 'Bu cihazdaki tüm kayıtlar, profil ve ayarlar silinecek. Geri alınamaz.\n\nÖnce yedek almanı öneririm.', confirmLabel: 'Devam', danger: true });
    if (!ok1) return;
    const ok2 = await confirmSheet({ title: 'Emin misin?', message: 'Son onay: her şey kalıcı olarak silinecek.', confirmLabel: 'Hepsini sil', danger: true });
    if (!ok2) return;
    await wipeAll();
    toast('Tüm veriler silindi');
    go('/hosgeldin');
  };

  const lastBackup = state.meta?.lastBackupAt;

  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null, h('h1', { text: 'Ayarlar' }))),
    card(h('h2', { text: 'Profil ve hedefler' }), form.el, btn('Profili kaydet', saveProfile, 'primary block')),
    card(
      h('h2', { text: 'Program' }),
      field('Başlangıç tarihi', start, 'Hafta ve 4 haftalık blok sayımı bu tarihten başlar.'),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Dönem (ekipman)' }), phase,
        h('div', { class: 'hint', text: 'Bant yetmemeye başlayınca (genelde 6–10 hafta, önce bacaklarda) dambıla geç.' })),
      h('h3', { text: 'Haftalık takvim' }),
      schedule,
      h('div', { class: 'grid2' }, field('Set arası dinlenme', rest), h('div', { class: 'field end' }, sound))),
    card(
      h('h2', { text: 'Yedekleme' }),
      h('p', { class: 'muted', text: lastBackup ? `Son yedek: ${fmtDate(lastBackup, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Henüz yedek alınmadı.' }),
      h('p', { class: 'small', text: 'Veriler yalnızca bu cihazda duruyor. Haftada bir yedek al: iPhone\'da paylaşım penceresinden "Dosyalar\'a Kaydet" → iCloud Drive.' }),
      h('div', { class: 'actions-row' }, btn('Yedeği dışa aktar', exportBackupFlow, 'primary'), btn('Yedekten geri yükle', importBackupFlow))),
    isIOS() && !isStandalone() ? installHint() : null,
    card(
      h('h2', { text: 'Yapay zekâ asistanı' }),
      h('label', { class: 'check disabled' }, h('input', { type: 'checkbox', disabled: true }), h('span', { text: 'Kapalı — 3. aşamada eklenecek' })),
      h('p', { class: 'muted small', text: 'Planlanan: açılıp kapatılabilen, farklı AI servisleriyle çalışan sohbet, haftalık değerlendirme ve program önerisi. Kapalıyken uygulama aynen çalışır.' })),
    card(
      h('h2', { text: 'Veriler' }),
      btn('Tüm verileri sil', wipe, 'danger-ghost')),
    h('p', { class: 'muted small center disclaimer', text: `Spor Rutini ${APP_VERSION} · Genel bilgi verir, tıbbi tavsiye değildir. Ağrı veya sağlık şikâyetinde bir hekime ya da fizyoterapiste danış.` }),
  ]);
}
