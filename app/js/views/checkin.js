// Haftalık kontrol (~3 dk, Pazar/Pazartesi): haftanın özeti, bel ölçümü, kalibrasyon, gelecek hafta, eğer–o zaman planları.
import { state, saveRecord, updateMeta, updateSettings } from '../store.js';
import { h, btn, card, stat, numInput, textInput, toast, checkbox } from '../ui.js';
import { WEEKLY_STRENGTH_TARGET, dayPlan, dayPlanFor } from '../program.js';
import { trendRate, trendWeight, weekSummary, weeklyStreak } from '../stats.js';
import { maintenanceWeek, whtr } from '../targets.js';
import { addDays, fmtDate, fmtNum, parseNum, uid, weekStart, weekday, WEEKDAYS, WEEKDAYS_SHORT } from '../util.js';
import { today, startKey, currentAlerts, runAction, go, maintenanceOn, targetsToday, setMaintenance } from '../context.js';
import { checkinWeek } from '../rules.js';
import { IFTHEN_TRIGGERS, MAX_IFTHEN, normalizeIfThen, suggestedIfThen } from '../ifthen.js';
import { setAssistantKind } from './assistant.js';

/** Kontrol edilen hafta: Pazar → bu hafta, Pazartesi → geçen hafta, diğer günler → bu hafta. */
export const reviewWeek = (t) => checkinWeek(t) ?? weekStart(t);

/** Gelecek haftanın kuvvet günleri (takvime göre) ve "yoğun hafta" için yürüyüşe çevrilen gün. */
export function busyWeekInfo(settings, nextWk) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(nextWk, i);
    const base = dayPlan(settings, weekday(d));
    if (base.type === 'strength') days.push(d);
  }
  const last = days.length >= 3 ? days[days.length - 1] : null;
  const on = !!last && settings?.scheduleOverrides?.[last] === 'walk';
  return { strengthDays: days, last, on };
}

/** Aralıktaki antrenmanlarda kaydedilen ilerleme (rekor) sayısı. */
function winsInRange(from, to) {
  return state.workouts.filter((w) => w.date >= from && w.date <= to).reduce((n, w) => n + (w.improvements?.length ?? 0), 0);
}

function summaryCard(t, wk) {
  const end = addDays(wk, 6);
  const ref = end < t ? end : t;
  const s = weekSummary(state, wk);
  const walks = Object.values(state.daily).filter((d) => d.date >= wk && d.date <= end && d.walked).length;
  const tw = trendWeight(state.daily, ref);
  const rate = trendRate(state.daily, ref);
  const streak = weeklyStreak(state, ref, { startKey: startKey(), isMaintenanceWeek: (k) => maintenanceWeek(state.settings, k) });
  const p = targetsToday(t) ?? {};
  return card(
    h('h2', { text: `Hafta: ${fmtDate(wk)} – ${fmtDate(end)}` }),
    h('div', { class: 'stats' },
      stat('Kuvvet', `${s.strength}/${WEEKLY_STRENGTH_TARGET}`, s.strength >= 2 ? 'seri devam' : 'hedef en az 2'),
      stat('Yürüyüş', String(walks), s.brisk ? `${s.brisk} tempolu` : null),
      stat('Padel', String(s.padel)),
      stat('Trend kilo', tw == null ? '–' : `${fmtNum(tw)} kg`, rate == null ? 'en az 3 tartı gerekir' : `haftada ${rate <= 0 ? '−' : '+'}${fmtNum(Math.abs(rate))} kg`),
      stat('Protein', s.protein == null ? '–' : `${fmtNum(s.protein, 0)} g`, p.proteinMin ? `hedef ${p.proteinMin}+` : null),
      stat('Uyku', s.sleep == null ? '–' : `${fmtNum(s.sleep)} sa`, 'hedef 7,5+'),
      stat('Adım', s.steps == null ? '–' : fmtNum(s.steps, 0), 'hedef 7.000+'),
      stat('Seri', streak ? `🔥 ${streak} hafta` : '–', '2+ kuvvetli haftalar'),
      stat('İlerleme', `🏆 ${winsInRange(wk, end)}`, 'geçen sefere göre')));
}

function waistCard(t, wk) {
  const has = state.measurements.some((m) => m.date >= wk && m.waistCm != null && m.kind !== 'test');
  const height = state.profile?.heightCm;
  if (has) {
    const last = [...state.measurements].reverse().find((m) => m.waistCm != null);
    const w = whtr(last.waistCm, height);
    return card(h('h2', { text: '📏 Bel' }),
      h('p', { text: `${fmtNum(last.waistCm)} cm${w ? ` · bel/boy ${fmtNum(w.ratio, 2)} (${w.label})` : ''}` }),
      w && w.ratio >= 0.5 ? h('p', { class: 'muted small', text: `Sağlıklı aralık için hedef bel < ${fmtNum(w.targetWaist)} cm.` }) : null);
  }
  const input = numInput({ decimal: true, placeholder: 'ör. 92,5', label: 'Bel çevresi (cm)' });
  const save = async () => {
    const v = parseNum(input.value);
    if (v == null || v < 40 || v > 200) return toast('Bel çevresi: 40–200 cm arasında gir.');
    await saveRecord('measurements', { id: uid(), date: t, waistCm: Math.round(v * 10) / 10, photo: false, note: '' });
    toast('Bel ölçümü kaydedildi 📏');
  };
  return card(h('h2', { text: '📏 Bu hafta bel ölçümü' }),
    h('p', { class: 'muted small', text: 'Sabah, göbek hizasından, nefes verdikten sonra.' }),
    h('div', { class: 'inline-inputs' }, h('label', null, h('span', { class: 'muted small', text: 'cm' }), input), btn('Kaydet', save, 'small primary')));
}

function targetsCard(t) {
  const p = targetsToday(t) ?? {};
  const kcal = p.kcalMin ? `${fmtNum(p.kcalMin, 0)}–${fmtNum(p.kcalMax, 0)} kcal` : 'hedef yok';
  const cal = currentAlerts().filter((a) => a.action?.to?.startsWith('kcal:'));
  const maint = maintenanceOn(t);
  return card(h('h2', { text: '🎯 Kalori hedefi' }),
    h('p', { text: `${maint ? 'Bakım dönemi: ' : ''}${kcal}` }),
    maint
      ? h('div', null,
        h('p', { class: 'muted small', text: `Bakım ${fmtDate(state.settings.maintenanceUntil)} tarihine kadar. Kilo bu dönemde 0,5–1 kg oynayabilir (su ve glikojen).` }),
        btn('Bakımı bitir', () => setMaintenance(false), 'small ghost'))
      : cal.length
        ? cal.map((a) => h('div', { class: 'alert info' },
          h('div', { class: 'alert-main' }, h('strong', { text: a.title }), h('p', { class: 'pre', text: a.body }),
            btn(a.action.label, () => runAction(a.action.to), 'small primary'))))
        : h('p', { class: 'muted small', text: 'Değişiklik gerekmiyor. Hedef, 2–3 haftalık trend kiloya göre ayarlanır; tek haftalık oynamalar için değiştirme.' }));
}

function nextWeekCard(t, wk) {
  const nextWk = addDays(wk, 7);
  const info = busyWeekInfo(state.settings, nextWk);
  const parts = [h('h2', { text: '📅 Gelecek hafta' })];
  const plan = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(nextWk, i);
    plan.push(`${WEEKDAYS_SHORT[i]} ${dayPlanFor(state.settings, d, i).icon}`);
  }
  parts.push(h('p', { class: 'small', text: plan.join(' · ') }));
  if (info.last) {
    const cb = checkbox(`Yoğun bir hafta olacak (2 kuvvet yeter — ${WEEKDAYS[weekday(info.last)]} yürüyüşe dönsün)`, info.on);
    cb.input.addEventListener('change', async () => {
      const o = { ...(state.settings.scheduleOverrides ?? {}) };
      if (cb.input.checked) o[info.last] = 'walk';
      else delete o[info.last];
      await updateSettings({ scheduleOverrides: o });
      toast(cb.input.checked ? 'Gelecek hafta 2 kuvvet günü' : 'Plan normale döndü');
    });
    parts.push(cb, h('p', { class: 'muted small', text: 'Kuvveti korumak için haftada 2 seans yeterli; 3 ideal.' }));
  }
  if (state.mealplan?.days) parts.push(btn('🛒 Alışveriş listesi', () => go('/yemek/alisveris'), 'small'));
  return card(...parts);
}

function ifThenCard() {
  const first = state.settings.ifThen == null;
  const initial = first ? suggestedIfThen() : state.settings.ifThen;
  const rows = Object.entries(IFTHEN_TRIGGERS).map(([trigger, def]) => {
    const cur = initial.find((x) => x.trigger === trigger);
    const cb = checkbox(`Eğer: ${def.when}`, !!cur);
    const text = textInput({ value: cur?.text ?? def.suggestion, placeholder: def.suggestion });
    const wrap = h('div', { class: `ifthen-item${cur ? ' on' : ''}` }, cb, h('label', { class: 'muted small', text: 'O zaman:' }), text);
    cb.input.addEventListener('change', () => {
      if (cb.input.checked && rows.filter((r) => r.cb.input.checked).length > MAX_IFTHEN) {
        cb.input.checked = false;
        toast(`En fazla ${MAX_IFTHEN} plan — az ama net olanlar daha iyi işliyor.`);
      }
      wrap.classList.toggle('on', cb.input.checked);
    });
    return { trigger, cb, text, wrap };
  });
  const save = async () => {
    const list = normalizeIfThen(rows.filter((r) => r.cb.input.checked).map((r) => ({ trigger: r.trigger, text: r.text.value })));
    await updateSettings({ ifThen: list });
    toast(list.length ? 'Planların kaydedildi 📌' : 'Planlar kaldırıldı');
  };
  return card(
    h('h2', { text: '📌 Eğer–o zaman planların' }),
    h('p', { class: 'muted small', text: first
      ? 'Engel çıktığında ne yapacağını önceden belirlemek, yapma olasılığını artırıyor. En sık yaşadığın 2–3 durumu seç; ilgili an geldiğinde Bugün ekranında hatırlatılır.'
      : 'Bu hafta işe yaradı mı? Gerekirse değiştir.' }),
    h('div', { class: 'form' }, rows.map((r) => r.wrap)),
    h('div', { class: 'actions-row' }, btn(first ? 'Planları kaydet' : 'Güncelle', save, first ? 'primary' : '')));
}

export function renderCheckin(root) {
  const t = today();
  const wk = reviewWeek(t);
  const done = state.meta?.lastCheckin && state.meta.lastCheckin >= wk;
  root.append(h('header', { class: 'page-head' },
    h('div', null, h('h1', { text: 'Haftalık kontrol' }), h('p', { class: 'muted', text: done ? 'Bu hafta yapıldı ✓ — istersen tekrar bakabilirsin.' : '~3 dakika' })),
    btn('Kapat', () => go('/bugun'), 'small ghost')));
  root.append(summaryCard(t, wk), waistCard(t, wk), targetsCard(t), nextWeekCard(t, wk), ifThenCard());
  root.append(h('div', { class: 'actions-row' },
    state.settings.aiEnabled ? btn('🤖 Yapay zekâya haftayı değerlendirt', () => { setAssistantKind('review'); go('/asistan'); }) : null,
    btn(done ? 'Bitti' : 'Kontrolü bitir ✓', async () => {
      await updateMeta({ lastCheckin: wk });
      toast('Haftalık kontrol tamam 🗓️');
      go('/bugun');
    }, 'primary')));
}
