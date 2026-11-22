// Yapay zekâ cevaplarından JSON çıkarma (esnek): kod blokları ya da ilk { … son } arası denenir;
// akıllı tırnak, yorum ve sondaki virgüller temizlenir. Saf fonksiyonlar.

/** JSON'u dener; olmazsa akıllı tırnak, yorum ve sondaki virgülleri temizleyip tekrar dener. */
export function tryJson(text) {
  try { return JSON.parse(text); } catch { /* temizle */ }
  const cleaned = String(text)
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch { return null; }
}

/**
 * Metindeki aday JSON'ları sırayla dener; accept(obj) true dönen ilk nesneyi verir.
 * Hiç aday yoksa { found: false }, aday var ama okunamadıysa { found: true, obj: null }.
 */
export function extractJson(text, accept = (o) => o != null && typeof o === 'object') {
  const s = String(text ?? '');
  const candidates = [...s.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const a = Math.min(...['{', '['].map((ch) => { const i = s.indexOf(ch); return i < 0 ? Infinity : i; }));
  const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (Number.isFinite(a) && b > a) candidates.push(s.slice(a, b + 1));
  if (!candidates.length) return { found: false, obj: null };
  for (const c of candidates) {
    const o = tryJson(c);
    if (accept(o)) return { found: true, obj: o };
  }
  return { found: true, obj: null };
}

/** Türkçe metni karşılaştırma için sadeleştirir: küçük harf, noktalama yok, ı→i gibi harf katlama isteğe bağlı. */
export function normText(t, { fold = false } = {}) {
  let s = String(t ?? '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, ' ').trim();
  if (fold) s = s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  return s;
}
