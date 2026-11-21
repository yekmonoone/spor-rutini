import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseProgram } from '../app/js/ai.js';
import { programFor, PROGRAMS } from '../app/js/program.js';
import { defaultSettings } from '../app/js/store.js';

const state = {
  profile: { sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 85, kcalMin: 2250, kcalMax: 2350, kcalFloor: 1800, proteinMin: 140, proteinMax: 150, lossMinKg: 0.4, lossMaxKg: 0.9 },
  settings: { ...defaultSettings(), phase: 'band' },
  workouts: [{ id: 'w', date: '2026-11-18', day: 'A', exercises: [{ exerciseId: 'band_squat', min: 12, max: 15, plannedSets: 3, unit: 'reps', resistance: { kind: 'miniband', level: 3 }, sets: [{ reps: 14, rir: 2, done: true }, { reps: 13, rir: 1, done: true }] }] }],
  padel: [{ id: 'p', date: '2026-11-15', kind: 'lesson', durationMin: 60, feel: 4, pain: ['elbow'] }],
  measurements: [{ id: 'm', date: '2026-11-17', waistCm: 92 }],
  daily: { '2026-11-18': { date: '2026-11-18', weight: 84.2, sleepH: 7, proteinG: 130, steps: 8000 } },
};

test('mesaj verileri ve güvenlik kurallarını içerir, kişisel kimlik yok', () => {
  const p = buildPrompt('review', { state, today: '2026-11-22', startKey: '2026-11-02', alerts: [{ title: 'Uyku ortalaması 6,5 saat' }] });
  for (const s of ['30 yaş', 'Bant + mat', 'Bantlı squat', '14-13', 'Orta mini bant', 'Dirsek', '84,2', 'Uyku ortalaması', 'hekim değilsin', 'Görev: Son haftalarımı']) {
    assert.ok(p.includes(s), `eksik: ${s}`);
  }
  assert.ok(!/@/.test(p), 'e-posta olmamalı');
});

test('program isteği izinli hareket listesi ve JSON biçimini içerir', () => {
  const p = buildPrompt('program', { state, today: '2026-11-22', startKey: '2026-11-02' });
  assert.ok(p.includes('```json') && p.includes('band_row (Bant row)'));
});

const answer = `Gerekçe: bacaklar ilerliyor.
\`\`\`json
{"phase":"band","note":"Bacak hacmi arttı","A":[{"ex":"band_squat","sets":4,"min":10,"max":15},{"ex":"plank","sets":3,"min":30,"max":60}],"B":[{"ex":"reverse_lunge","sets":3,"min":8,"max":12},{"ex":"lateral_lunge","sets":2,"min":8,"max":8,"prep":true}]}
\`\`\`
İyi antrenmanlar!`;

test('yapay zekâ cevabındaki program okunur ve uygulanır', () => {
  const prog = parseProgram(answer);
  assert.equal(prog.A[0].sets, 4);
  assert.equal(prog.B[1].prep, true);
  const settings = { phase: 'band', customProgram: { ...prog, phase: 'band' } };
  assert.equal(programFor(settings).custom, true);
  assert.equal(programFor({ ...settings, phase: 'dumbbell' }), PROGRAMS.dumbbell);
});

test('hatalı program reddedilir', () => {
  assert.throws(() => parseProgram('merhaba'), /bulunamadı/);
  assert.throws(() => parseProgram('```json\n{"A":[{"ex":"zipla","sets":3,"min":5,"max":10}],"B":[{"ex":"plank","sets":3,"min":5,"max":10}]}\n```'), /uygulamada yok/);
  assert.throws(() => parseProgram('```json\n{"A":[{"ex":"plank","sets":9,"min":5,"max":10}],"B":[{"ex":"plank","sets":3,"min":5,"max":10}]}\n```'), /set sayısı/);
  assert.throws(() => parseProgram('```json\n{bozuk\n```'), /JSON bozuk/);
});
