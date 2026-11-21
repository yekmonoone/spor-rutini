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
      'Sonra programı uygulamaya aktarabilmem için en sonda TEK bir ```json kod bloğu ver. Kurallar:',
      '- Yalnızca geçerli JSON: çift tırnak, yorum yok, sondaki virgül yok, "..." gibi kısaltma yok.',
      '- Alanlar: "phase", "note", "A", "B". A ve B listelerindeki her öğe: "ex" (kimlik), "sets" (sayı), "min" (sayı), "max" (sayı), isteğe bağlı "prep": true.',
      `- "ex" yalnızca şu kimliklerden biri olabilir (adını değil kimliğini yaz): ${allowedExerciseList()}`,
      '- Her gün 4–9 hareket; sets 1–5; min ≤ max; süreli hareketlerde min/max saniyedir.',
      `- Şu anki dönem "${state.settings.phase}"; ekipmanım değişmediyse aynı dönemi kullan.`,
      'Şu anki programım bu biçimde (örnek olarak kullan, değiştirerek ver):',
      '```json',
      JSON.stringify({ phase: state.settings.phase, note: 'kısa açıklama', ...(() => { const p = programFor(state.settings); return { A: p.A.map(({ ex, sets, min, max, prep }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}) })), B: p.B.map(({ ex, sets, min, max, prep }) => ({ ex, sets, min, max, ...(prep ? { prep } : {}) })) }; })() }),
      '```',
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
  // Aday metinler: tüm kod blokları, sonra ilk { ile son } arası.
  const candidates = [...s.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(s.slice(a, b + 1));
  if (!candidates.length) throw new Error('Metinde program bulunamadı. Cevaptaki ```json bloğunun tamamını yapıştır.');

  let obj = null;
  for (const c of candidates) {
    obj = tryJson(c);
    if (obj && typeof obj === 'object') break;
  }
  if (!obj) throw new Error('Program okunamadı: JSON bozuk. Yapay zekâya "Programı yalnızca geçerli JSON olarak, tek bir ```json bloğunda tekrar ver" yaz.');
  obj = unwrap(obj);

  const phase = obj.phase ?? obj.donem ?? obj['dönem'] ?? null;
  if (phase != null && !PHASES[phase]) throw new Error(`Bilinmeyen dönem: "${phase}". bodyweight, band ya da dumbbell olmalı.`);
  const A = pickDay(obj, 'A');
  const B = pickDay(obj, 'B');
  if (!A || !B) throw new Error('Programda Gün A ve Gün B listeleri bulunamadı ("A": [...], "B": [...]).');
  const note = obj.note ?? obj.not ?? obj['açıklama'] ?? '';
  return { phase, note: typeof note === 'string' ? note.slice(0, 500) : '', A: parseDay(A, 'A'), B: parseDay(B, 'B') };
}

/** JSON'u dener; olmazsa akıllı tırnak, yorum ve sondaki virgülleri temizleyip tekrar dener. */
function tryJson(text) {
  try { return JSON.parse(text); } catch { /* temizle */ }
  const cleaned = text
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch { return null; }
}

function unwrap(obj) {
  for (const k of ['program', 'plan', 'block', 'blok']) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) return { ...obj[k], note: obj[k].note ?? obj.note, phase: obj[k].phase ?? obj.phase };
  }
  return obj;
}

function pickDay(obj, d) {
  const keys = [d, d.toLowerCase(), `day${d}`, `day_${d}`, `gun${d}`, `gün${d}`, `Gün ${d}`, `gun_${d}`, `Day ${d}`];
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k];
  const days = obj.days ?? obj.gunler ?? obj['günler'];
  if (days && Array.isArray(days[d] ?? days[d.toLowerCase()])) return days[d] ?? days[d.toLowerCase()];
  return null;
}

const norm = (t) => String(t ?? '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, ' ').trim();

/** Kimlik ya da adla hareketi bulur ("band_squat", "Bantlı squat", "bantli squat"). */
function findExercise(it) {
  const raw = it.ex ?? it.id ?? it.exercise ?? it.hareket ?? it.name ?? it.ad;
  if (raw && EX[raw]) return raw;
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (EX[key]) return key;
  const n = norm(raw);
  const ascii = (t) => t.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  for (const [id, e] of Object.entries(EX)) {
    const en = norm(e.name);
    if (en === n || ascii(en) === ascii(n) || norm(e.name.split('(')[0]) === n) return id;
  }
  return null;
}

function parseDay(list, name) {
  if (list.length < 1 || list.length > 12) throw new Error(`Gün ${name}: 1–12 hareket olmalı.`);
  return list.map((it, i) => {
    const id = it && typeof it === 'object' ? findExercise(it) : null;
    if (!id) throw new Error(`Gün ${name}, ${i + 1}. hareket: "${it?.ex ?? it?.name ?? it}" uygulamada yok.`);
    let min = it.min;
    let max = it.max;
    const reps = it.reps ?? it.tekrar ?? it.range;
    if ((min == null || max == null) && reps != null) {
      const m = String(reps).match(/(\d+)\s*(?:[-–—]|to|ile)?\s*(\d+)?/);
      if (m) { min = min ?? m[1]; max = max ?? m[2] ?? m[1]; }
    }
    let lo = Math.round(Number(min));
    let hi = Math.round(Number(max ?? min));
    if (lo > hi) [lo, hi] = [hi, lo];
    const sets = Math.round(Number(it.sets ?? it.set));
    if (!Number.isFinite(sets) || sets < 1 || sets > 5) throw new Error(`Gün ${name}, ${EX[id].name}: set sayısı 1–5 olmalı.`);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 1 || hi > 120) throw new Error(`Gün ${name}, ${EX[id].name}: tekrar aralığı hatalı.`);
    return { ex: id, sets, min: lo, max: hi, ...(it.prep ? { prep: true } : {}) };
  });
}
