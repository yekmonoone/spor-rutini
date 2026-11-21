// Profil formu (hoş geldin ve ayarlar ekranlarında ortak).
import { h, field, numInput, segmented, selectEl } from '../ui.js';
import { ACTIVITY, computeTargets } from '../targets.js';
import { fmtNum, parseNum } from '../util.js';

function num(input, label, min, max) {
  const n = parseNum(input.value);
  if (n == null || n < min || n > max) throw new Error(`${label}: ${fmtNum(min, 0)}–${fmtNum(max, 0)} arasında bir değer gir.`);
  return n;
}

/** showTargets: hedef alanlarını da düzenlenebilir göster (ayarlar ekranı). */
export function profileForm(initial = {}, { showTargets = false } = {}) {
  const thisYear = new Date().getFullYear();
  const sex = segmented([{ value: 'male', label: 'Erkek' }, { value: 'female', label: 'Kadın' }], initial.sex ?? 'male', () => update());
  const birth = numInput({ value: initial.birthYear ?? null, placeholder: 'ör. 2000' });
  const height = numInput({ value: initial.heightCm ?? null, placeholder: 'cm' });
  const weight = numInput({ value: initial.weightKg ?? null, decimal: true, placeholder: 'kg' });
  const activity = selectEl(ACTIVITY.map((a) => ({ value: a.value, label: a.label })), initial.activity ?? 1.5, () => update());
  const activityHint = h('div', { class: 'hint' });
  const preview = h('div', { class: 'notice' });

  const tIn = {
    kcalMin: numInput({ value: initial.kcalMin ?? null, placeholder: 'kcal' }),
    kcalMax: numInput({ value: initial.kcalMax ?? null, placeholder: 'kcal' }),
    proteinMin: numInput({ value: initial.proteinMin ?? null, placeholder: 'g' }),
    proteinMax: numInput({ value: initial.proteinMax ?? null, placeholder: 'g' }),
  };

  function rawProfile() {
    return {
      sex: sex.getValue() ?? 'male',
      birthYear: parseNum(birth.value),
      heightCm: parseNum(height.value),
      weightKg: parseNum(weight.value),
      activity: Number(activity.value),
    };
  }

  function update() {
    activityHint.textContent = ACTIVITY.find((a) => a.value === Number(activity.value))?.desc ?? '';
    const t = computeTargets(rawProfile());
    preview.replaceChildren(t
      ? h('div', null,
        h('strong', { text: `Önerilen: ${fmtNum(t.kcalMin, 0)}–${fmtNum(t.kcalMax, 0)} kcal · ${t.proteinMin}–${t.proteinMax} g protein` }),
        h('div', { class: 'small', text: `Bazal metabolizma ~${fmtNum(t.bmr, 0)} kcal · günlük harcama ~${fmtNum(t.tdee, 0)} kcal · BKİ ${fmtNum(t.bmi)} · hedef kilo kaybı haftada ${fmtNum(t.lossMinKg)}–${fmtNum(t.lossMaxKg)} kg` }),
        h('div', { class: 'small muted', text: 'Tahmindir; 2–3 haftalık tartı ortalamasına göre ayarlanır.' }))
      : h('span', { class: 'muted', text: 'Bilgileri girince kalori ve protein hedefin hesaplanır.' }));
  }
  for (const el of [birth, height, weight]) el.addEventListener('input', update);
  update();

  const applyBtn = h('button', {
    type: 'button', class: 'btn small', text: 'Önerilen hedefleri uygula',
    onClick: () => {
      const t = computeTargets(rawProfile());
      if (!t) return;
      tIn.kcalMin.value = String(t.kcalMin);
      tIn.kcalMax.value = String(t.kcalMax);
      tIn.proteinMin.value = String(t.proteinMin);
      tIn.proteinMax.value = String(t.proteinMax);
    },
  });

  const el = h('div', { class: 'form' },
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Cinsiyet' }), sex),
    h('div', { class: 'grid3' },
      field('Doğum yılı', birth),
      field('Boy (cm)', height),
      field('Kilo (kg)', weight)),
    field('Günlük hareket', activity),
    activityHint,
    preview,
    showTargets ? h('div', null,
      h('p', { class: 'label', text: 'Günlük hedeflerin (düzenlenebilir)' }),
      h('div', { class: 'grid2' },
        field('Kalori alt', tIn.kcalMin), field('Kalori üst', tIn.kcalMax),
        field('Protein alt (g)', tIn.proteinMin), field('Protein üst (g)', tIn.proteinMax)),
      applyBtn) : null);

  /** Doğrulanmış profil (hedefler dahil) döndürür; hatalıysa Türkçe mesajla hata fırlatır. */
  function read() {
    const p = {
      sex: sex.getValue() ?? 'male',
      birthYear: Math.round(num(birth, 'Doğum yılı', 1930, thisYear - 12)),
      heightCm: num(height, 'Boy', 120, 230),
      weightKg: num(weight, 'Kilo', 30, 250),
      activity: Number(activity.value),
    };
    const t = computeTargets(p);
    const pick = (input, fallback, label, min, max) => (showTargets && input.value.trim() ? Math.round(num(input, label, min, max)) : fallback);
    const out = {
      ...p,
      kcalMin: pick(tIn.kcalMin, t.kcalMin, 'Kalori alt', 1000, 5000),
      kcalMax: pick(tIn.kcalMax, t.kcalMax, 'Kalori üst', 1000, 5000),
      proteinMin: pick(tIn.proteinMin, t.proteinMin, 'Protein alt', 30, 400),
      proteinMax: pick(tIn.proteinMax, t.proteinMax, 'Protein üst', 30, 400),
      kcalFloor: t.kcalFloor,
      lossMinKg: t.lossMinKg,
      lossMaxKg: t.lossMaxKg,
    };
    if (out.kcalMin > out.kcalMax) throw new Error('Kalori alt sınırı üst sınırdan büyük olamaz.');
    if (out.proteinMin > out.proteinMax) throw new Error('Protein alt sınırı üst sınırdan büyük olamaz.');
    return out;
  }

  return { el, read };
}
