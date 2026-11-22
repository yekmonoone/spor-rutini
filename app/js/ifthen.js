// "Eğer … o zaman …" planları (implementation intentions): engel çıktığında ne yapacağını önceden belirlemek.
// Saf fonksiyonlar. settings.ifThen = [{ trigger, text }] (en fazla 3).

export const MAX_IFTHEN = 3;

export const IFTHEN_TRIGGERS = {
  busy: { when: 'Mesai uzar / antrenmana vakit olmazsa', suggestion: '20 dakikalık kısa antrenmanı yaparım.' },
  eatout: { when: 'Dışarıda yemem gerekirse', suggestion: 'Izgara + salata + ayran seçerim, ekmeği yarım bırakırım.' },
  craving: { when: 'Canım fast food ya da tatlı çekerse', suggestion: 'Önce proteinli öğünümü yerim, sonra küçük bir porsiyon alırım.' },
  nowalk: { when: 'Akşam yürüyüşe çıkamazsam', suggestion: 'Evde 15 dakika tempolu yürüyüş ya da merdiven yaparım.' },
  padelcancel: { when: 'Padel iptal olursa', suggestion: 'Evde kuvvet B gününü yaparım.' },
};

export function suggestedIfThen() {
  return ['busy', 'eatout', 'craving'].map((trigger) => ({ trigger, text: IFTHEN_TRIGGERS[trigger].suggestion }));
}

/** Kullanıcının o tetikleyici için planı (yoksa null). */
export function planFor(settings, trigger) {
  const p = (settings?.ifThen ?? []).find((x) => x.trigger === trigger);
  if (!p) return null;
  const when = IFTHEN_TRIGGERS[trigger]?.when ?? trigger;
  return { when, text: p.text?.trim() || IFTHEN_TRIGGERS[trigger]?.suggestion || '' };
}

/** Planları doğrular: bilinen tetikleyici, benzersiz, en fazla 3, metin ≤ 140 karakter. */
export function normalizeIfThen(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || !IFTHEN_TRIGGERS[x.trigger] || out.some((o) => o.trigger === x.trigger)) continue;
    const text = String(x.text ?? '').trim().slice(0, 140) || IFTHEN_TRIGGERS[x.trigger].suggestion;
    out.push({ trigger: x.trigger, text });
    if (out.length >= MAX_IFTHEN) break;
  }
  return out;
}
