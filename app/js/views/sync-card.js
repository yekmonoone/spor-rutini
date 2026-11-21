// Eşitleme kartı (Ayarlar ve "Eşitleme ile giriş" ekranında).
import { state } from '../store.js';
import { h, field, btn, toast, confirmSheet } from '../ui.js';
import { getConfig, getStatus, onSyncStatus, signIn, signUp, signOut, syncNow } from '../sync.js';
import { go } from '../context.js';

function fmtTime(iso) {
  if (!iso) return 'henüz yok';
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusLine(s) {
  if (s.state === 'syncing') return '🔄 Eşitleniyor…';
  if (s.state === 'error') return `⚠️ ${s.error}`;
  return `✓ Son eşitleme: ${fmtTime(s.lastSyncAt)}`;
}

function loginForm(onDone) {
  const c = getConfig() ?? {};
  const url = h('input', { type: 'url', class: 'input', placeholder: 'https://xxxx.supabase.co', value: c.url ?? '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const key = h('textarea', { class: 'input', rows: 3, placeholder: 'anon / publishable anahtar', value: c.anonKey ?? '', autocapitalize: 'off', spellcheck: 'false' });
  const email = h('input', { type: 'email', class: 'input', value: c.email ?? '', autocomplete: 'email', autocapitalize: 'off' });
  const password = h('input', { type: 'password', class: 'input', autocomplete: 'current-password' });
  const msg = h('p', { class: 'small pre', hidden: true });
  let busy = false;

  const run = async (kind) => {
    if (busy) return;
    busy = true;
    msg.hidden = false;
    msg.textContent = kind === 'in' ? 'Giriş yapılıyor…' : 'Hesap oluşturuluyor…';
    const creds = { url: url.value, anonKey: key.value, email: email.value, password: password.value };
    try {
      if (kind === 'in') {
        const r = await signIn(creds);
        toast(`Bağlandı ✓ (${r?.pulled ?? 0} kayıt alındı)`);
        onDone();
      } else {
        const r = await signUp(creds);
        if (r.confirmed) { toast('Hesap oluşturuldu ve bağlandı ✓'); onDone(); } else {
          msg.textContent = 'Hesap oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra buradan "Giriş yap"a bas.';
        }
      }
    } catch (err) {
      msg.textContent = `⚠️ ${err.message}`;
    } finally {
      password.value = '';
      busy = false;
    }
  };

  return h('div', { class: 'form' },
    field('Supabase proje adresi (Project URL)', url),
    field('Genel anahtar (anon / publishable)', key, 'Gizli "service_role / secret" anahtarını asla girme.'),
    field('E-posta', email),
    field('Şifre', password, 'En az 8 karakter. Şifre bu cihazda saklanmaz.'),
    msg,
    h('div', { class: 'actions-row' },
      btn('Hesap oluştur', () => run('up')),
      btn('Giriş yap', () => run('in'), 'primary')));
}

export function syncCard({ onConnected } = {}) {
  const root = h('section', { class: 'card', id: 'sync-card' });

  const render = () => {
    const s = getStatus();
    root.replaceChildren(h('h2', { text: 'Eşitleme (telefon ↔ bilgisayar)' }));
    if (!s.connected) {
      root.append(
        h('p', { class: 'muted small', text: 'Aynı hesapla giriş yaptığın tüm cihazlarda kayıtların eşitlenir. Bağlantı bilgileri ve oturum yalnızca bu cihazda tutulur, yedek dosyasına girmez.' }),
        loginForm(() => { render(); onConnected?.(); }));
      return;
    }
    const line = h('p', { class: 'small pre', text: statusLine(s) });
    root.append(
      h('p', null, h('strong', { text: `Bağlı: ${s.email}` })),
      line,
      h('div', { class: 'actions-row' },
        btn('Çıkış yap', async () => {
          if (await confirmSheet({ title: 'Eşitlemeden çık', message: 'Bu cihazdaki kayıtlar silinmez, yalnızca eşitleme durur. Sunucudaki veriler kalır.', confirmLabel: 'Çıkış yap' })) {
            await signOut();
            render();
          }
        }, 'danger-ghost'),
        btn('Şimdi eşitle', () => syncNow().then((r) => toast(`Eşitlendi ✓ (${r?.pushed ?? 0} gönderildi, ${r?.pulled ?? 0} alındı)`)).catch(() => {}), 'primary')));
    root.statusLine = line;
  };

  render();
  const off = onSyncStatus((s) => {
    if (!root.isConnected && root.dataset.mounted) { off(); return; }
    root.dataset.mounted = '1';
    if (s.connected && root.statusLine) root.statusLine.textContent = statusLine(s);
    else if (!s.connected && root.statusLine) render();
  });
  return root;
}

/** Profil olmadan da açılabilen ekran: başka cihazda zaten kullanan kişi için. */
export function renderSyncPage(root) {
  root.append(
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: 'Eşitlemeyle giriş' }),
      h('p', { class: 'muted', text: 'Başka bir cihazda zaten kullanıyorsan, aynı hesapla giriş yap; kayıtların buraya gelir.' }))),
    syncCard({ onConnected: () => go(state.profile ? '/bugun' : '/hosgeldin') }),
    btn(state.profile ? 'Ayarlara dön' : 'Geri: yeni profil oluştur', () => go(state.profile ? '/ayarlar' : '/hosgeldin'), 'ghost block'));
}
