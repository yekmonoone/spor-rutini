// 3. aşama (kopyala-yapıştır modu): verilerden yapay zekâ için hazır mesaj üretir ve
// yapay zekânın önerdiği programı okur. Ağ isteği yok; mesajı kullanıcı kendisi kopyalar.
// Saf fonksiyonlar — testlerde de kullanılır.
import { EX, PHASES, DAY_TYPES, programFor, programWeek, blockOf, targetText, plannedSets, resistanceText } from './program.js';
import { weeklyAverages, weeklySessions, exerciseHistory, trackedItems, valuesInRange } from './stats.js';
import { ageFromBirthYear } from './targets.js';
import { addDays, avg, fmtDate, fmtNum, weekStart, WEEKDAYS } from './util.js';
import { PAIN_AREAS } from './rules.js';

export const AI_TARGETS = {
  claude: { label: 'Claude', url: 'https://claude.ai/new' },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { label: 'Gemini', url: 'https://gemini.google.com/app' },
  other: { label: 'Diğer (yalnızca kopyala)', url: null },
};

export const PROMPT_KINDS = {
  review: { label: 'Değerlendir', icon: '📋' },
  program: { label: 'Yeni program', icon: '🗓️' },
  question: { label: 'Soru', icon: '💬' },
};

const n = (v, d = 1, unit = '') => (v == null ? '–' : `${fmtNum(v, d)}${unit}`);

function profileSection(p, today) {
  if (!p) return 'Profil: girilmemiş.';
  const age = p.birthYear ? ageFromBirthYear(p.birthYear, new Date(today)) : null;
  return [
    `- ${p.sex === 'female' ? 'Kadın' : 'Erkek'}, ${age ?? '?'} yaş, boy ${n(p.heightCm, 0, ' cm')}, başlangıç kilosu ${n(p.weightKg, 1, ' kg')}`,
    `- Hedef: yağ kaybı + kas kazanımı (fit görünüm), haftada ${n(p.lossMinKg)}–${n(p.lossMaxKg)} kg kayıp`,
    `- Günlük hedef: ${n(p.kcalMin, 0)}–${n(p.kcalMax, 0)} kcal (alt sınır ${n(p.kcalFloor, 0)} kcal), protein ${p.proteinMin}–${p.proteinMax} g`,
    '- Masa başı iş, akşamları ~1 saat yürüyüş, sosyal spor olarak padel; ev antrenmanı',
  ].join('\n');
}

function programSection(settings, startKey, today) {
  const week = Math.max(1, programWeek(startKey, today));
  const { block, weekInBlock } = blockOf(week);
  const prog = programFor(settings);
  const day = (d) => prog[d].map((it) => `  - ${EX[it.ex]?.name ?? it.ex}: ${targetText(it, plannedSets(it, week))}`).join('\n');
  const schedule = settings.schedule.map((t, i) => `${WEEKDAYS[i]}: ${DAY_TYPES[t]?.label ?? t}`).join(', ');
  return [
    `- Dönem: ${PHASES[settings.phase]?.label} · Program haftası ${week} (blok ${block}, ${weekInBlock}/4)${prog.custom ? ' · şu an yapay zekâ önerisi özel program kullanılıyor' : ''}`,
    `- Takvim: ${schedule}`,
    `- Gün A:\n${day('A')}`,
    `- Gün B:\n${day('B')}`,
    '- Kurallar: setler RIR 1–3 ile biter; 2 seans üst üste tüm setlerde üst sınır → zorlaştır.',
  ].join('\n');
}

function weeksSection(state, today, weeks = 4) {
  const cur = weekStart(today);
  const rows = weeklySessions(state.workouts, state.padel, today, weeks).map((r) => {
    const end = addDays(r.week, 6);
    const waist = state.measurements.filter((m) => m.waistCm != null && m.date >= r.week && m.date <= end).map((m) => m.waistCm);
    return `| ${fmtDate(r.week)}${r.week === cur ? ' (bu hafta)' : ''} | ${n(avg(valuesInRange(state.daily, 'weight', r.week, end)))} | ${n(waist.length ? waist[waist.length - 1] : null)} | ${r.strength} | ${r.padel} | ${n(avg(valuesInRange(state.daily, 'sleepH', r.week, end)))} | ${n(avg(valuesInRange(state.daily, 'proteinG', r.week, end)), 0)} | ${n(avg(valuesInRange(state.daily, 'steps', r.week, end)), 0)} |`;
  });
  const all = weeklyAverages(state.daily, 'weight');
  const first = all[0];
  return [
    '| Hafta | Kilo ort. | Bel (cm) | Kuvvet | Padel | Uyku (sa) | Protein (g) | Adım |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    first ? `İlk tartı haftası ${fmtDate(first.week)}: ortalama ${n(first.avg)} kg.` : '',
  ].join('\n');
}

function exercisesSection(state) {
  const lines = [];
  for (const it of trackedItems(programFor(state.settings))) {
    const h = exerciseHistory(state.workouts, it.ex).slice(-3);
    if (!h.length) continue;
    const s = h.map((e) => {
      const load = [e.variant, resistanceText(e.resistance)].filter(Boolean).join(', ');
      const rir = e.sets.some((x) => x.rir != null) ? ` RIR ${e.sets.map((x) => x.rir ?? '–').join('/')}` : '';
      return `${fmtDate(e.date)}: ${e.sets.map((x) => x.reps).join('-')}${load ? ` (${load})` : ''}${rir}`;
    }).join('; ');
    lines.push(`- ${EX[it.ex].name} [hedef ${it.min}–${it.max}]: ${s}`);
  }
  return lines.length ? lines.join('\n') : 'Henüz kayıtlı antrenman yok.';
}

function padelSection(state, today) {
  const recent = state.padel.filter((p) => p.date >= addDays(today, -28));
  if (!recent.length) return 'Son 4 haftada padel yok.';
  return recent.map((p) => {
    const pain = (p.pain ?? []).map((k) => PAIN_AREAS[k]).filter(Boolean);
    return `- ${fmtDate(p.date)}: ${p.kind === 'match' ? 'maç' : 'ders'}, ${p.durationMin ?? '?'} dk, his ${p.feel ?? '–'}/5${pain.length ? `, ağrı: ${pain.join(', ')}` : ''}`;
  }).join('\n');
}

export function allowedExerciseList() {
  return Object.entries(EX).map(([id, e]) => `${id} (${e.name}${e.unit === 'sec' ? ', saniye' : e.unit === 'steps' ? ', adım' : ''})`).join(', ');
}

const SAFETY = [
  'Kurallar:',
  '- Türkçe, kısa ve uygulanabilir yaz; madde işaretleri kullan.',
  '- Sen hekim değilsin: ağrı, sakatlık ya da sağlık belirtisinde teşhis koyma; dinlenmeyi ve bir fizyoterapist/hekime danışmayı öner.',
  '- Kalori önerin alt sınırın altına inmesin; haftalık kilo kaybı vücut ağırlığının %1\'ini geçmesin.',
  '- Mevcut ekipmanla yapılabilecek hareketler öner; zorlaştırmayı küçük adımlarla yap.',
].join('\n');

/**
 * kind: 'review' | 'program' | 'question'
 * ctx: { state, today, startKey, alerts, question }
 */
export function buildPrompt(kind, { state, today, startKey, alerts = [], question = '' }) {
  const task = {
    review: 'Görev: Son haftalarımı değerlendir. 1) Neler iyi gidiyor, 2) en önemli 2–3 sorun, 3) önümüzdeki hafta için 3 somut öneri (antrenman, beslenme, uyku). Kalori hedefimi değiştirmem gerekiyorsa gerekçesiyle söyle.',
    program: [
      'Görev: Verilerime göre önümüzdeki 4 haftalık blok için Gün A ve Gün B programını öner. Önce kısa gerekçeni yaz.',
      'Sonra programı uygulamaya aktarabilmem için TAM OLARAK şu biçimde tek bir ```json kod bloğu ver:',
      '```json',
      '{"phase": "bodyweight|band|dumbbell", "note": "kısa açıklama", "A": [{"ex": "hareket_id", "sets": 3, "min": 8, "max": 12}], "B": [...]}',
      '```',
      `- "ex" yalnızca şu kimliklerden biri olabilir: ${allowedExerciseList()}`,
      '- Her gün 4–9 hareket; sets 1–5; min ≤ max; süreli hareketlerde min/max saniyedir. Padel hazırlık hareketlerine "prep": true ekleyebilirsin.',
      `- Şu anki dönem "${state.settings.phase}"; ekipmanım değişmediyse aynı dönemi kullan.`,
    ].join('\n'),
    question: `Sorum: ${question.trim() || '(buraya sorunu yaz)'}`,
  }[kind];

  return [
    'Kişisel spor koçum gibi davranmanı istiyorum. Aşağıda spor takip uygulamamdan aldığım güncel verilerim var.',
    '',
    `## Profil\n${profileSection(state.profile, today)}`,
    '',
    `## Program\n${programSection(state.settings, startKey, today)}`,
    '',
    `## Son 4 hafta\n${weeksSection(state, today)}`,
    '',
    `## Hareketler (son 3 seans)\n${exercisesSection(state)}`,
    '',
    `## Padel\n${padelSection(state, today)}`,
    '',
    `## Uygulamanın uyarıları\n${alerts.length ? alerts.map((a) => `- ${a.title}`).join('\n') : '- Yok'}`,
    '',
    SAFETY,
    '',
    task,
    '',
    `(Tarih: ${fmtDate(today, { day: 'numeric', month: 'long', year: 'numeric' })})`,
  ].join('\n');
}

/** Yapay zekânın cevabındaki JSON programı okur ve doğrular. Hata varsa Türkçe mesajla fırlatır. */
export function parseProgram(text) {
  const s = String(text ?? '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : null;
  if (!body) {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) body = s.slice(a, b + 1);
  }
  if (!body) throw new Error('Metinde program bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');
  let obj;
  try { obj = JSON.parse(body); } catch { throw new Error('Program okunamadı: JSON bozuk. Yapay zekâdan aynı biçimde tekrar vermesini iste.'); }
  if (obj.phase != null && !PHASES[obj.phase]) throw new Error(`Bilinmeyen dönem: "${obj.phase}".`);
  const day = (list, name) => {
    if (!Array.isArray(list) || list.length < 1 || list.length > 12) throw new Error(`Gün ${name}: 1–12 hareket olmalı.`);
    return list.map((it, i) => {
      if (!it || !EX[it.ex]) throw new Error(`Gün ${name}, ${i + 1}. hareket: "${it?.ex}" uygulamada yok.`);
      const sets = Number(it.sets);
      const min = Number(it.min);
      const max = Number(it.max ?? it.min);
      if (!Number.isInteger(sets) || sets < 1 || sets > 5) throw new Error(`Gün ${name}, ${EX[it.ex].name}: set sayısı 1–5 olmalı.`);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 120 || min > max) throw new Error(`Gün ${name}, ${EX[it.ex].name}: tekrar aralığı hatalı.`);
      return { ex: it.ex, sets, min, max, ...(it.prep ? { prep: true } : {}) };
    });
  };
  return {
    phase: obj.phase ?? null,
    note: typeof obj.note === 'string' ? obj.note.slice(0, 500) : '',
    A: day(obj.A, 'A'),
    B: day(obj.B, 'B'),
  };
}
