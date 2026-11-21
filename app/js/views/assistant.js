// Yapay zekâ asistanı (kopyala-yapıştır modu): hazır mesajı kopyala → seçilen yapay zekâ uygulamasında yapıştır.
// Program önerisi geri yapıştırılınca doğrulanır, önizlenir ve onaylanırsa uygulanır.
import { state, updateSettings } from '../store.js';
import { h, appendChildren, btn, card, segmented, toast, confirmSheet } from '../ui.js';
import { AI_TARGETS, PROMPT_KINDS, buildPrompt, parseProgram } from '../ai.js';
import { EX, PHASES, targetText } from '../program.js';
import { today, startKey, currentAlerts, go } from '../context.js';

let kind = 'review';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function programPreview(p) {
  const list = (items) => h('ul', { class: 'rules' }, items.map((it) => h('li', { text: `${EX[it.ex].name} — ${targetText(it, it.sets)}${it.prep ? ' (hazırlık)' : ''}` })));
  return h('div', null,
    p.note ? h('p', { class: 'pre', text: p.note }) : null,
    h('h4', { text: 'Gün A' }), list(p.A),
    h('h4', { text: 'Gün B' }), list(p.B));
}

export function renderAssistant(root) {
  const s = state.settings;
  if (!s.aiEnabled) {
    appendChildren(root, [
      h('header', { class: 'page-head' }, h('h1', { text: 'Yapay zekâ asistanı' })),
      card(h('p', { text: 'Asistan kapalı. Ayarlar → Yapay zekâ asistanı bölümünden açabilirsin.' }), btn('Ayarlara git', () => go('/ayarlar'), 'primary')),
    ]);
    return;
  }
  const target = AI_TARGETS[s.aiTarget] ?? AI_TARGETS.claude;
  const question = h('textarea', { class: 'input', rows: 3, placeholder: 'Örn: Bu hafta dizim ağrıdı, B gününde neyi değiştirmeliyim?' });
  const preview = h('pre', { class: 'prompt-preview' });
  const refresh = () => {
    preview.textContent = buildPrompt(kind, { state, today: today(), startKey: startKey(), alerts: currentAlerts(), question: question.value });
  };
  question.addEventListener('input', refresh);
  const qWrap = h('div', { class: 'field', hidden: kind !== 'question' }, h('label', { text: 'Sorun' }), question);
  const kinds = segmented(Object.entries(PROMPT_KINDS).map(([value, k]) => ({ value, label: `${k.icon} ${k.label}` })), kind, (v) => {
    kind = v ?? 'review';
    qWrap.hidden = kind !== 'question';
    refresh();
  });
  refresh();

  const send = async () => {
    const ok = await copyText(preview.textContent);
    if (!ok) { toast('Kopyalanamadı: aşağıdaki metni elle seçip kopyala.'); return; }
    if (target.url) {
      toast(`Kopyalandı ✓ ${target.label}'da yapıştır`);
      window.open(target.url, '_blank', 'noopener');
    } else {
      toast('Kopyalandı ✓ İstediğin yapay zekâ uygulamasına yapıştır.');
    }
  };

  // Program önerisini geri al
  const answer = h('textarea', { class: 'input', rows: 5, placeholder: 'Yapay zekânın cevabını (```json bloğu dahil) buraya yapıştır' });
  const result = h('div');
  const check = async () => {
    result.replaceChildren();
    let p;
    try { p = parseProgram(answer.value); } catch (err) { result.append(h('p', { class: 'small pre', text: `⚠️ ${err.message}` })); return; }
    const phase = p.phase ?? s.phase;
    result.append(
      h('p', { class: 'ok', text: `✓ Program okundu (${PHASES[phase].label} dönemi). Önizleme:` }),
      programPreview(p),
      btn('Bu programı uygula', async () => {
        const msg = phase !== s.phase
          ? `Program "${PHASES[phase].label}" dönemi için. Dönem de buna değiştirilecek. Uygulansın mı?`
          : 'Gün A ve Gün B bu programla değiştirilecek. Varsayılan programa Ayarlar\'dan her zaman dönebilirsin. Uygulansın mı?';
        if (!(await confirmSheet({ title: 'Programı uygula', message: msg, confirmLabel: 'Uygula' }))) return;
        await updateSettings({ phase, customProgram: { phase, A: p.A, B: p.B, note: p.note, appliedAt: today() } });
        toast('Yeni program uygulandı ✓');
        go('/antrenman');
      }, 'primary block'));
  };

  appendChildren(root, [
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { text: 'Yapay zekâ asistanı' }),
      h('p', { class: 'muted', text: `Mesajı kopyala, ${target.label}'da yapıştır. Pro üyeliğinle çalışır, ek ücret yok.` }))),
    card(
      h('h2', { text: '1. Ne soracaksın?' }),
      kinds,
      qWrap,
      btn(target.url ? `Kopyala ve ${target.label}'ı aç` : 'Kopyala', send, 'primary block'),
      h('details', { class: 'how' },
        h('summary', { text: 'Gönderilecek metni gör' }),
        h('p', { class: 'muted small', text: 'Yalnızca bu metin paylaşılır: adın, e-postan ve fotoğrafların yoktur. Göndermeden önce düzenleyebilirsin.' }),
        preview)),
    card(
      h('h2', { text: '2. Program önerisini uygula (isteğe bağlı)' }),
      h('p', { class: 'muted small', text: '"Yeni program" istediysen cevabın tamamını buraya yapıştır; uygulama kontrol edip önizleme gösterir.' }),
      answer,
      btn('Kontrol et', check, 'block'),
      result),
    h('p', { class: 'muted small center disclaimer', text: 'Yapay zekâ önerileri genel bilgidir, tıbbi tavsiye değildir. Ağrıda bir uzmana danış.' }),
  ]);
  // Arka planda eşitleme olsa da yapıştırılan metin kaybolmasın.
  return { sticky: true };
}
