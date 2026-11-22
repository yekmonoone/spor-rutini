// 0.9.0: yapay zekâ — yapılandırılmış haftalık değerlendirme, "Dışarıda ne yesem?", koç notları, veri azaltma.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrompt, promptSections, parseWeeklyReview, parseEatOut, answerText, addCoachNote, currentFocus, MAX_COACH_NOTES, PROMPT_KINDS,
} from '../app/js/ai.js';

const SCHEDULE = ['strength', 'brisk', 'strength', 'strength', 'walk', 'padel', 'rest'];
const profile = { sex: 'male', heightCm: 180, weightKg: 85, birthYear: 1995, kcalMin: 2000, kcalMax: 2100, kcalFloor: 1750, proteinMin: 140, proteinMax: 150, lossMinKg: 0.4, lossMaxKg: 0.9 };
const state = (over = {}) => ({
  profile, settings: { phase: 'dumbbell', schedule: SCHEDULE }, meta: { dismissed: {} },
  workouts: [], padel: [], measurements: [], mealplan: null, shopping: null,
  daily: { '2026-11-23': { date: '2026-11-23', proteinG: 60, meals: { first: { name: 'Lor + yumurta', protein: 60 } } } },
  ...over,
});
const T = '2026-11-23';
const args = (s, extra = {}) => ({ state: s, today: T, startKey: '2026-11-09', alerts: [], ...extra });

test('haftalık değerlendirme: en fazla 3 odak, kalori ±150 adım, bakımda 0, planlar doğrulanır', () => {
  const ans = 'Güzel hafta.\n```json\n{"focus": ["  Her gün 140 g protein  ", "3 kuvvet", "Uyku 7,5 sa", "fazla madde"], "kcal": -200, "ifThen": [{"trigger": "busy", "text": "Kısa antrenman"}, {"trigger": "uydurma", "text": "x"}]}\n```';
  const r = parseWeeklyReview(ans, { settings: { schedule: SCHEDULE }, today: T });
  assert.deepEqual(r.focus, ['Her gün 140 g protein', '3 kuvvet', 'Uyku 7,5 sa']);
  assert.equal(r.kcal, -150);
  assert.deepEqual(r.ifThen, [{ trigger: 'busy', text: 'Kısa antrenman' }]);
  assert.equal(parseWeeklyReview('```json\n{"focus": ["a"], "kcal": 40}\n```').kcal, 0);
  assert.equal(parseWeeklyReview('```json\n{"focus": ["a"], "kcal": 150}\n```').ifThen, null);
  const maint = parseWeeklyReview('```json\n{"focus": ["a"], "kcal": 150}\n```', { settings: { maintenanceUntil: '2026-11-30' }, today: T });
  assert.equal(maint.kcal, 0);
  assert.match(maint.kcalNote, /Bakım/);
  assert.throws(() => parseWeeklyReview('Sadece metin, JSON yok'), /odak listesi bulunamadı/);
  assert.throws(() => parseWeeklyReview('```json\n{"focus": []}\n```'), /boş/);
});

test('dışarıda seçenekleri: ad + protein zorunlu, en fazla 3, kcal mantıksızsa yok sayılır', () => {
  const r = parseEatOut('```json\n{"options": [{"name": "Tavuk şiş + salata + ayran", "protein": 45, "kcal": 650}, {"name": "Lahmacun", "protein": 300}, {"name": "Köfte", "protein": 35, "kcal": 99999}]}\n```');
  assert.deepEqual(r.options, [{ name: 'Tavuk şiş + salata + ayran', protein: 45, kcal: 650 }, { name: 'Köfte', protein: 35, kcal: null }]);
  assert.throws(() => parseEatOut('```json\n{"options": [{"name": "", "protein": 10}]}\n```'), /ad ve protein/);
  assert.throws(() => parseEatOut('metin'), /bulunamadı/);
});

test('koç notları: JSON blokları çıkarılır, en fazla 8 not; odak 8 gün geçerli', () => {
  assert.equal(answerText('Öneri:\n```json\n{"focus": []}\n```\n\n\n\nSon.'), 'Öneri:\n\nSon.');
  let notes = [];
  for (let i = 0; i < 10; i++) notes = addCoachNote(notes, { date: T, kind: 'question', text: `not ${i}` });
  assert.equal(notes.length, MAX_COACH_NOTES);
  assert.equal(notes.at(-1).text, 'not 9');
  assert.deepEqual(addCoachNote(notes, { date: T, kind: 'question', text: '```json\n{}\n```' }), notes);
  const meta = { weeklyFocus: { date: '2026-11-16', items: ['a'] } };
  assert.ok(currentFocus(meta, '2026-11-23'));
  assert.equal(currentFocus(meta, '2026-11-25'), null);
  assert.equal(currentFocus({}, T), null);
});

test('her türe yalnızca gereken veri gider; önceki öneriler yalnızca varsa eklenir', () => {
  const s = state();
  assert.deepEqual(promptSections('eatout', s, T), ['profile', 'todayFood']);
  assert.ok(!promptSections('meals', s, T).includes('exercises'));
  assert.ok(!promptSections('review', s, T).includes('coach'));
  assert.ok(!promptSections('review', s, T).includes('padel'));
  const withCoach = state({ meta: { weeklyFocus: { date: '2026-11-16', items: ['Her gün 140 g protein'] } }, padel: [{ date: '2026-11-21', kind: 'lesson', durationMin: 60 }] });
  assert.ok(promptSections('review', withCoach, T).includes('coach'));
  assert.ok(promptSections('review', withCoach, T).includes('padel'));
  for (const k of Object.keys(PROMPT_KINDS)) assert.ok(promptSections(k, s, T).includes('profile'));
});

test('mesajlar: dışarıda ne yesem kısa ve hedefli; değerlendirme odak JSON ister ve önceki odağı içerir', () => {
  const eat = buildPrompt('eatout', args(state(), { question: 'kebapçı' }));
  assert.match(eat, /Mekân \/ menü: kebapçı/);
  assert.match(eat, /Kalan protein ~80 g/);
  assert.match(eat, /Lor \+ yumurta ~60 g/);
  assert.match(eat, /"options"/);
  assert.ok(!/Hareketler \(son 3 seans\)/.test(eat));
  assert.ok(eat.length < 2500, `çok uzun: ${eat.length}`);
  const s = state({ meta: { weeklyFocus: { date: '2026-11-16', items: ['Her gün 140 g protein'] }, coachNotes: [{ id: 'n', date: '2026-11-20', kind: 'question', text: 'Uykunu 23:30\'a çek.' }] } });
  const rev = buildPrompt('review', args(s));
  assert.match(rev, /## Önceki öneriler/);
  assert.match(rev, /Her gün 140 g protein/);
  assert.match(rev, /Uykunu 23:30/);
  assert.match(rev, /"focus"/);
  assert.ok(!/@/.test(rev));
  const maint = buildPrompt('review', args(state({ settings: { phase: 'dumbbell', schedule: SCHEDULE, maintenanceUntil: '2026-11-30' } })));
  assert.match(maint, /bakım dönemindeyim: 0 olmalı/);
});
