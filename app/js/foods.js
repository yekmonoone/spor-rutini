// Besin ve öğün kütüphanesi. Değerler YAKLAŞIKTIR (USDA FoodData Central, TürKomp ve market etiketleri
// baz alınmıştır); ürüne ve porsiyona göre değişir. Ekranda her zaman aralık olarak gösterilir.

export const CATEGORIES = {
  fridge: 'Buzdolabı',
  fresh: 'Taze (kısa ömürlü)',
  freezer: 'Dondurucu',
  pantry: 'Kiler',
  other: 'Diğer',
};
export const CATEGORY_ORDER = ['fridge', 'fresh', 'freezer', 'pantry', 'other'];

/**
 * Malzemeler: p / kcal = 1 birim başına (unit 'g' ise 1 g, 'ml' ise 1 ml, 'adet'/'dilim'/'kutu' ise 1 tane).
 * shelf = açtıktan/aldıktan sonra yaklaşık kaç gün dayandığı.
 */
export const INGREDIENTS = {
  yumurta: { name: 'Yumurta', cat: 'fridge', shelf: 25, unit: 'adet', p: 6.3, kcal: 72, aliases: ['yumurtalar', 'haşlanmış yumurta'] },
  beyaz_peynir: { name: 'Beyaz peynir', cat: 'fridge', shelf: 21, unit: 'g', p: 0.15, kcal: 2.4, aliases: ['peynir', 'feta'] },
  lor: { name: 'Lor peyniri', cat: 'fridge', shelf: 5, unit: 'g', p: 0.11, kcal: 0.98, aliases: ['lor'] },
  kasar: { name: 'Kaşar peyniri', cat: 'fridge', shelf: 21, unit: 'g', p: 0.25, kcal: 3.6, aliases: ['kaşar'] },
  suzme_yogurt: { name: 'Süzme yoğurt', cat: 'fridge', shelf: 14, unit: 'g', p: 0.08, kcal: 1.25, aliases: ['yunan yoğurdu', 'süzme'] },
  yogurt: { name: 'Yoğurt', cat: 'fridge', shelf: 10, unit: 'g', p: 0.035, kcal: 0.6, aliases: ['yoğurt', 'sade yoğurt'] },
  kefir: { name: 'Kefir', cat: 'fridge', shelf: 10, unit: 'ml', p: 0.033, kcal: 0.6 },
  ayran: { name: 'Ayran', cat: 'fridge', shelf: 10, unit: 'ml', p: 0.017, kcal: 0.35 },
  hindi_fume: { name: 'Hindi füme', cat: 'fridge', shelf: 5, unit: 'g', p: 0.17, kcal: 1.2, aliases: ['hindi', 'hindi jambon'] },
  sut: { name: 'Süt (uzun ömürlü)', cat: 'pantry', shelf: 90, unit: 'ml', p: 0.032, kcal: 0.46, aliases: ['süt', 'yarım yağlı süt'] },
  whey: { name: 'Whey protein', cat: 'pantry', shelf: 365, unit: 'g', p: 0.77, kcal: 4, hint: '1 ölçek ≈ 30 g', aliases: ['protein tozu', 'whey'] },
  ton: { name: 'Ton balığı konservesi', cat: 'pantry', shelf: 730, unit: 'kutu', p: 25, kcal: 170, aliases: ['ton balığı', 'ton', 'ton balığı konserve'] },
  nohut: { name: 'Haşlanmış nohut (kavanoz)', cat: 'pantry', shelf: 365, unit: 'g', p: 0.07, kcal: 1.4, aliases: ['nohut', 'haşlanmış nohut'] },
  yulaf: { name: 'Yulaf', cat: 'pantry', shelf: 365, unit: 'g', p: 0.13, kcal: 3.8 },
  fistik_ezmesi: { name: 'Fıstık ezmesi', cat: 'pantry', shelf: 180, unit: 'g', p: 0.25, kcal: 6 },
  kuruyemis: { name: 'Çiğ badem / ceviz', cat: 'pantry', shelf: 120, unit: 'g', p: 0.2, kcal: 6 },
  bal: { name: 'Bal', cat: 'pantry', shelf: 365, unit: 'g', p: 0, kcal: 3 },
  zeytinyagi: { name: 'Zeytinyağı', cat: 'pantry', shelf: 365, unit: 'ml', p: 0, kcal: 8.8, aliases: ['zeytin yağı'] },
  tavuk_gogus: { name: 'Tavuk göğsü', cat: 'freezer', shelf: 180, unit: 'g', p: 0.225, kcal: 1.2, hint: 'porsiyonlayıp dondur', aliases: ['tavuk', 'tavuk göğüs', 'tavuk eti'] },
  kofte: { name: 'Donuk köfte', cat: 'freezer', shelf: 120, unit: 'g', p: 0.16, kcal: 2.3, aliases: ['köfte'] },
  lavas: { name: 'Lavaş', cat: 'freezer', shelf: 90, unit: 'adet', p: 6, kcal: 190, hint: 'dondurucuda sakla', aliases: ['tortilla', 'wrap', 'dürüm lavaşı'] },
  ekmek: { name: 'Tam buğday ekmeği', cat: 'freezer', shelf: 90, unit: 'dilim', p: 3.5, kcal: 75, hint: 'dilimleyip dondur', aliases: ['ekmek', 'tam buğday ekmek', 'tam tahıllı ekmek'] },
  donuk_sebze: { name: 'Donuk sebze karışımı', cat: 'freezer', shelf: 240, unit: 'g', p: 0.025, kcal: 0.4, aliases: ['karışık sebze', 'dondurulmuş sebze', 'sebze'] },
  donuk_meyve: { name: 'Donuk meyve', cat: 'freezer', shelf: 240, unit: 'g', p: 0.01, kcal: 0.5 },
  patates: { name: 'Donuk patates (airfryer)', cat: 'freezer', shelf: 240, unit: 'g', p: 0.025, kcal: 1.5 },
  yesillik: { name: 'Hazır yeşillik / salata', cat: 'fresh', shelf: 4, unit: 'g', p: 0.015, kcal: 0.2, aliases: ['yeşillik', 'salata', 'marul', 'roka'] },
  domates: { name: 'Domates', cat: 'fresh', shelf: 6, unit: 'adet', p: 1, kcal: 22, aliases: ['domatesler'] },
  salatalik: { name: 'Salatalık', cat: 'fresh', shelf: 6, unit: 'adet', p: 1, kcal: 25 },
  biber: { name: 'Sivri biber', cat: 'fresh', shelf: 6, unit: 'adet', p: 0.3, kcal: 5, aliases: ['biber'] },
  muz: { name: 'Muz', cat: 'fresh', shelf: 5, unit: 'adet', p: 1.3, kcal: 105 },
  elma: { name: 'Elma', cat: 'fresh', shelf: 21, unit: 'adet', p: 0.5, kcal: 80 },
  limon: { name: 'Limon', cat: 'fresh', shelf: 21, unit: 'adet', p: 0, kcal: 10 },
};

export const TOOLS = {
  airfryer: 'Airfryer',
  toaster: 'Tost makinesi',
  stove: 'Ocak / tava',
};

/**
 * Ev öğünleri. slot: 'first' (ilk öğün, kahvaltı tipi) | 'dinner' | 'snack'.
 * ingredients: [malzemeId, miktar]; protein/kcal bunlardan hesaplanır.
 */
const home = (id, slot, name, o) => ({ id, slot, name, place: 'home', minutes: 5, dishes: 1, tools: [], veg: false, steps: [], ...o });

export const MEALS = Object.fromEntries([
  // İlk öğün (öğlen, kahvaltı tipi) — hedef 30–40 g protein
  home('menemen_peynir', 'first', 'Menemen + beyaz peynir + 2 dilim ekmek + elma', {
    minutes: 10, tools: ['stove'], veg: true,
    ingredients: [['yumurta', 3], ['domates', 2], ['biber', 2], ['beyaz_peynir', 40], ['ekmek', 2], ['zeytinyagi', 5], ['elma', 1]],
    steps: ['Domates ve biberi doğrayıp tavada 3–4 dk pişir.', 'Yumurtaları kır, karıştırarak pişir.', 'Yanına peynir ve 2 dilim ekmek.'],
  }),
  home('lorlu_omlet', 'first', 'Lorlu omlet + söğüş + 2 dilim ekmek + elma', {
    minutes: 8, tools: ['stove'], veg: true,
    ingredients: [['yumurta', 3], ['lor', 150], ['domates', 1], ['salatalik', 1], ['ekmek', 2], ['zeytinyagi', 5], ['elma', 1]],
    steps: ['Yumurtaları çırp, loru ekle.', 'Tavada kapağı kapalı 4–5 dk pişir.', 'Domates ve salatalığı doğra, yanına 2 dilim ekmek.'],
  }),
  home('tost_yumurta', 'first', 'Kaşarlı tost + 2 haşlanmış yumurta + kefir + elma', {
    minutes: 5, tools: ['toaster'], veg: true,
    ingredients: [['ekmek', 2], ['kasar', 40], ['yumurta', 2], ['domates', 1], ['kefir', 250], ['elma', 1]],
    steps: ['Haftada bir kez 6–8 yumurtayı birden haşla, buzdolabında 5 gün dayanır.', 'Tostu makinede kızart.', 'Yanına 2 yumurta, domates ve kefir.'],
  }),
  home('suzme_kase', 'first', 'Süzme yoğurt kasesi (yulaf, meyve, fıstık ezmesi, yarım ölçek whey)', {
    minutes: 3,
    ingredients: [['suzme_yogurt', 250], ['yulaf', 50], ['donuk_meyve', 100], ['fistik_ezmesi', 15], ['whey', 15]],
    steps: ['Yoğurda whey\'i karıştır.', 'Yulaf, donuk meyve ve fıstık ezmesini ekle (meyve birkaç dakikada çözülür).'],
  }),
  home('hindi_durum', 'first', 'Hindi füme + yumurtalı lavaş dürüm + ayran + elma', {
    minutes: 8, tools: ['stove', 'toaster'], veg: true,
    ingredients: [['lavas', 1], ['yumurta', 2], ['hindi_fume', 60], ['kasar', 20], ['yesillik', 30], ['ayran', 300], ['elma', 1]],
    steps: ['2 yumurtayı tavada ince omlet yap.', 'Lavaşa omlet, hindi, kaşar ve yeşillik koy, sar.', 'Tost makinesinde 2–3 dk kızart; yanına ayran.'],
  }),
  home('whey_shake', 'first', 'Whey + yulaf + muz + fıstık ezmesi shake', {
    minutes: 2,
    ingredients: [['whey', 30], ['sut', 300], ['yulaf', 40], ['muz', 1], ['fistik_ezmesi', 15]],
    steps: ['Hepsini shaker\'a ya da kapaklı kavanoza koy, 30 sn çalkala (muzu ezerek).', 'Acele günler için.'],
  }),

  // Akşam — hedef 45–55 g protein
  home('airfryer_tavuk', 'dinner', 'Airfryer tavuk + patates + donuk sebze + yoğurt', {
    minutes: 20, tools: ['airfryer'], veg: true,
    ingredients: [['tavuk_gogus', 180], ['patates', 150], ['donuk_sebze', 200], ['yogurt', 150], ['zeytinyagi', 10]],
    steps: ['Tavuğu kuşbaşı doğra (ya da önceden doğranmış dondur), baharat + yağ ile karıştır.', 'Pişirme kağıdı serili sepete tavuk, patates ve donuk sebzeyi birlikte koy.', '200 °C\'de 15–18 dk, yarıda bir karıştır. Yanına yoğurt.'],
  }),
  home('airfryer_kofte', 'dinner', 'Airfryer köfte + patates + sebze + salata + ayran', {
    minutes: 18, tools: ['airfryer'], veg: true,
    ingredients: [['kofte', 200], ['patates', 100], ['donuk_sebze', 150], ['yesillik', 80], ['ayran', 300]],
    steps: ['Donuk köfte, patates ve sebzeyi pişirme kağıdıyla sepete koy.', '190 °C\'de 15 dk, yarıda bir karıştır.', 'Yanına salata ve ayran.'],
  }),
  home('ton_durum', 'dinner', 'Ton balıklı dürüm + yumurta + ayran', {
    minutes: 5, veg: true,
    ingredients: [['lavas', 1], ['ton', 1], ['yumurta', 1], ['yesillik', 40], ['domates', 1], ['yogurt', 50], ['ayran', 300]],
    steps: ['Ton balığını süz, yoğurtla karıştır.', 'Lavaşa yeşillik, domates, ton ve dilimlenmiş haşlanmış yumurtayı koy, sar.', 'İstersen tost makinesinde ısıt.'],
  }),
  home('nohut_ton_salata', 'dinner', 'Nohutlu ton salatası (tek kase) + ekmek', {
    minutes: 7, veg: true,
    ingredients: [['ton', 1], ['nohut', 150], ['yumurta', 1], ['yesillik', 100], ['domates', 1], ['salatalik', 1], ['zeytinyagi', 10], ['limon', 1], ['ekmek', 1]],
    steps: ['Nohut ve tonu süz.', 'Hepsini tek kasede karıştır, zeytinyağı ve limon ekle.'],
  }),
  home('tavuk_lavas', 'dinner', 'Airfryer tavuklu lavaş + patates + ayran', {
    minutes: 20, tools: ['airfryer'], veg: true,
    ingredients: [['tavuk_gogus', 180], ['lavas', 1], ['patates', 100], ['yesillik', 40], ['domates', 1], ['yogurt', 80], ['ayran', 300]],
    steps: ['Tavuğu ince şeritler halinde baharatla airfryer\'da 200 °C\'de 12–15 dk pişir.', 'Lavaşa yoğurt sür, tavuk ve yeşillikle sar.'],
  }),
  home('tavuk_sote', 'dinner', 'Tek tava tavuk sote + 2 dilim ekmek + ayran', {
    minutes: 20, tools: ['stove'], veg: true,
    ingredients: [['tavuk_gogus', 200], ['donuk_sebze', 250], ['zeytinyagi', 10], ['ekmek', 2], ['ayran', 300]],
    steps: ['Tavuğu tavada 6–7 dk kavur.', 'Donuk sebzeyi ekle, kapağı kapalı 8–10 dk pişir.'],
  }),

  // Ara öğün — hedef 15–25 g protein
  home('suzme_meyve', 'snack', 'Süzme yoğurt + donuk meyve', {
    minutes: 2,
    ingredients: [['suzme_yogurt', 250], ['donuk_meyve', 100]],
    steps: ['Kaseye koy, karıştır.'],
  }),
  home('whey_su', 'snack', 'Whey (suyla)', {
    minutes: 1,
    ingredients: [['whey', 30]],
    steps: ['1 ölçeği 300 ml suyla çalkala.'],
  }),
  home('yumurta3', 'snack', '3 haşlanmış yumurta', {
    minutes: 1,
    ingredients: [['yumurta', 3]],
    steps: ['Önceden haşlanmış yumurtalardan.'],
  }),
  home('lor_bal', 'snack', 'Lor + bal', {
    minutes: 2,
    ingredients: [['lor', 150], ['bal', 10]],
    steps: ['Lora bir tatlı kaşığı bal.'],
  }),
  home('kefir_whey', 'snack', 'Kefir + yarım ölçek whey', {
    minutes: 1,
    ingredients: [['kefir', 250], ['whey', 15]],
    steps: ['Şişeye whey\'i ekleyip çalkala.'],
  }),
  home('meyve_kuruyemis', 'snack', 'Muz + 1 avuç badem/ceviz (kalori tamamlama)', {
    minutes: 1,
    ingredients: [['muz', 1], ['kuruyemis', 30]],
    steps: ['Protein düşük, enerji yüksek: kalori hedefinin altında kalan günler için.'],
  }),
].map((m) => [m.id, m]));

/** Dışarıda / paket seçenekleri — restoran porsiyonları değişken olduğu için aralıklar geniştir. */
const out = (id, slots, name, protein, kcal, tip) => ({ id, slots, name, place: 'out', protein, kcal, tip });

export const OUT_OPTIONS = Object.fromEntries([
  out('izgara_kofte', ['first', 'dinner'], 'Izgara köfte + salata (ekmek yarım)', [30, 40], [450, 650], 'Pilav/patates yerine salata iste; ekmeğin yarısını ye; yanında ayran.'),
  out('tavuk_sis', ['first', 'dinner'], 'Tavuk şiş + salata (bulgur yarım)', [35, 45], [400, 600], 'Lavaş/ekmeği az tut, sos ayrı.'),
  out('doner_porsiyon', ['first', 'dinner'], 'Tavuk döner porsiyon (pilav yarım ya da salata)', [30, 40], [450, 650], 'Patates kızartması alma; sos ayrı.'),
  out('doner_durum', ['first', 'dinner'], 'Döner dürüm (lavaş ya da yarım ekmek)', [25, 35], [500, 750], 'Tam ekmek arası 800 kcal\'yi geçebilir; et ağırlıklı iste, yanına ayran.'),
  out('mercimek_izgara', ['first', 'dinner'], 'Mercimek çorbası + ızgara (köfte/tavuk) + salata', [35, 50], [550, 750], 'Ekmeği 1 dilimle sınırla.'),
  out('esnaf', ['first', 'dinner'], 'Esnaf lokantası: etli/tavuklu yemek + yoğurt (pilav yarım)', [25, 35], [500, 700], 'Kızartma ve börek yerine etli sebze yemeği; yanına yoğurt ya da cacık.'),
  out('pilavustu', ['first', 'dinner'], 'Pilavüstü tavuk (yarım pilav) + ayran', [30, 40], [550, 750], 'Pilavı yarım iste, tavuğu tam.'),
  out('wrap', ['first', 'dinner'], 'Tavuk wrap ya da tavuk salata (kafe)', [25, 35], [450, 650], 'Sos az; cips/patates yok.'),
  out('lahmacun', ['first', 'dinner'], 'Lahmacun 2 + ayran + yeşillik', [25, 30], [550, 700], 'Protein orta; günün diğer öğününde protein ağırlıklı ye.'),
  out('pide', ['first', 'dinner'], 'Kıymalı pide (yarım) + ayran', [25, 35], [600, 800], 'Yarısını paketlet ya da paylaş.'),
  out('burger', ['first', 'dinner'], 'Tek köfteli burger (patatessiz) + ayran', [25, 30], [500, 700], 'Patates ve kola yerine salata, ayran ya da şekersiz içecek.'),
  out('disarida_kahvalti', ['first'], 'Dışarıda kahvaltı: menemen/omlet + peynir + 1–2 dilim ekmek', [25, 35], [500, 700], 'Börek, poğaça, simit yerine yumurta ve peynir; çay şekersiz.'),
  out('simit_ayran', ['first'], 'Simit + ayran (kaçamak)', [12, 16], [400, 480], 'Protein düşük: yanına yumurta ya da peynir ekle, günün kalanında telafi et.'),
].map((o) => [o.id, o]));

/** Planda "dışarıda" (henüz seçilmemiş) slotlar için kullanılan tahmini aralıklar. */
export const OUT_ESTIMATE = {
  first: { protein: [25, 35], kcal: [500, 700] },
  dinner: { protein: [30, 40], kcal: [500, 750] },
  snack: { protein: [5, 15], kcal: [150, 300] },
};

/** Plan kalori hedefinin altında kaldığında önerilen kolay eklemeler (yaklaşık kcal). */
export const KCAL_FILLERS = [
  { name: 'Muz + 1 avuç badem/ceviz', kcal: 290 },
  { name: '1 su bardağı süt', kcal: 115 },
  { name: '+1 dilim tam buğday ekmeği', kcal: 75 },
  { name: '+1 yemek kaşığı zeytinyağı (salataya/yemeğe)', kcal: 90 },
  { name: '+1 meyve', kcal: 90 },
];

export const EAT_OUT_RULES = [
  'Izgara et, tavuk, köfte ya da balık + salata seç.',
  'Pilav, ekmek ve patatesi yarıya indir.',
  'Çorbayla başla (mercimek, ezogelin); içecek ayran ya da su.',
  'Döner/dürüm: porsiyon ya da yarım ekmek, sos az.',
  'Kızartma ve kremalı yemekler haftada 1–2 kez.',
  'Ekstra salata ya da söğüş iste — günde 2 porsiyon sebze hedefi için.',
];
