// Hareket kütüphanesi. unit: 'reps' | 'sec' | 'steps'; side: her bacak/taraf/yön ayrı sayılıyorsa.
// resist: 'none' | 'band' | 'miniband' | 'dumbbell'

const PUSHUP_LEVELS = ['Duvar', 'Masa / tezgâh', 'Diz', 'Tam', 'Ayaklar yüksekte'];

export const EX = {
  squat: {
    name: 'Squat', muscle: 'Bacak, kalça', unit: 'reps', resist: 'none',
    how: [
      'Ayaklar omuz genişliğinde, parmak uçları hafif dışa baksın.',
      'Sandalyeye oturur gibi kalçanı geriye ve aşağı indir; göğüs dik.',
      'Dizler ayak parmaklarıyla aynı yöne baksın, içe kapanmasın; topuklar yerde.',
      'Uyluklar yere paralel olana dek (ya da rahat inebildiğin kadar) in, topuklardan iterek kalk.',
    ],
    easier: 'Arkana sandalye koy, dokunup kalk.',
    harder: 'İnişi 3–4 sn yap ve altta 1 sn bekle.',
  },
  pushup: {
    name: 'Şınav', muscle: 'Göğüs, omuz, arka kol', unit: 'reps', resist: 'none',
    variants: PUSHUP_LEVELS, defaultVariant: 2,
    how: [
      'Eller omuzlardan biraz geniş.',
      'Baştan topuğa düz bir çizgi; kalça düşmesin, havaya da kalkmasın.',
      'Dirsekler gövdeyle yaklaşık 45° açı yapsın, göğsü yere yaklaştır.',
      'Seviye: duvar → masa → diz → tam. 12 temiz tekrar yapınca bir üst seviyeye geç.',
    ],
    easier: 'Bir alt seviyeye geç (ör. dizden).',
    harder: 'Bir üst seviyeye geç.',
  },
  wide_pushup: {
    name: 'Geniş şınav', muscle: 'Göğüs', unit: 'reps', resist: 'none',
    variants: PUSHUP_LEVELS, defaultVariant: 2,
    how: [
      'Normal şınav gibi, yalnızca eller daha geniş.',
      'Gövde düz, karın sıkı; göğsü kontrollü indir.',
      'A gününde hangi seviyedeysen burada da o seviyeden yap.',
    ],
    easier: 'Bir alt seviyeye geç.',
    harder: 'Bir üst seviyeye geç.',
  },
  glute_bridge: {
    name: 'Glute bridge (kalça köprüsü)', muscle: 'Kalça, arka bacak', unit: 'reps', resist: 'none',
    how: [
      'Sırt üstü yat, dizler bükülü, ayak tabanları yerde.',
      'Topuklardan iterek kalçayı kaldır; omuz, kalça ve diz aynı hizaya gelsin.',
      'Tepede 1–2 sn kalçanı sık, yavaşça in.',
      'Belinde değil kalçanda hissetmelisin.',
    ],
    harder: 'Tepede 3 sn bekle ya da tek bacak köprüye geç.',
  },
  single_leg_bridge: {
    name: 'Tek bacak glute bridge', muscle: 'Kalça', unit: 'reps', side: 'bacak', resist: 'none',
    how: [
      'Köprü pozisyonunda bir bacağı havaya uzat.',
      'Yerdeki bacağın topuğundan iterek kalçayı kaldır.',
      'Kalça bir yana yatmasın; tepede 1 sn sık.',
    ],
    easier: 'Normal (çift bacak) köprü yap.',
    harder: 'Tepede 2–3 sn bekle.',
  },
  chair_dips: {
    name: 'Sandalye dips', muscle: 'Arka kol', unit: 'reps', resist: 'none',
    how: [
      'Sağlam, kaymayan bir sandalyenin kenarını tut, kalçanı öne kaydır.',
      'Dirsekleri geriye doğru bükerek in; 90°\'den fazla inme.',
      'Avuçlarla iterek kalk; omuzlar kulaklara doğru kalkmasın.',
    ],
    easier: 'Dizleri bük, ayakları kalçaya yaklaştır.',
    harder: 'Bacakları düz uzat.',
  },
  plank: {
    name: 'Plank', muscle: 'Karın, core', unit: 'sec', resist: 'none',
    how: [
      'Dirsekler omuzların altında, vücut düz bir çizgide.',
      'Karnını içeri çek, kalçanı hafifçe sık.',
      'Nefesini tutma, düzenli nefes al ver.',
    ],
    easier: 'Dizler yerde yap.',
    harder: 'Süreyi uzat (hedef 60 sn) ya da bir ayağını hafif kaldır.',
  },
  side_plank: {
    name: 'Yan plank', muscle: 'Yan karın', unit: 'sec', side: 'taraf', resist: 'none',
    how: [
      'Yan yat, dirsek omzun altında.',
      'Kalçanı kaldır; baştan ayağa düz bir çizgi.',
      'Kalça düşmesin, gövde öne-arkaya devrilmesin.',
    ],
    easier: 'Alttaki diz yerde yap.',
    harder: 'Süreyi uzat ya da üstteki bacağı hafif kaldır.',
  },
  reverse_lunge: {
    name: 'Geriye lunge', muscle: 'Bacak, kalça, denge', unit: 'reps', side: 'bacak', resist: 'none',
    how: [
      'Dik dur, bir ayağınla geniş bir adım geri at.',
      'İki diz de yaklaşık 90° bükülene kadar in; arka diz yere neredeyse değsin.',
      'Öndeki topuktan iterek başlangıca dön.',
      'Geriye lunge dizler için öne lunge\'dan daha rahattır.',
    ],
    easier: 'Bir yere tutunarak yap, daha az in.',
    harder: 'İnişi 3 sn yap; dambıl döneminde elde dambılla.',
  },
  superman: {
    name: 'Superman', muscle: 'Sırt, duruş', unit: 'reps', resist: 'none',
    how: [
      'Yüzüstü yat, kollar önde uzanmış.',
      'Kolları, göğsü ve bacakları birlikte birkaç cm kaldır; 2 sn tut, indir.',
      'Boynunu zorlama, yere bak.',
    ],
    harder: 'Tepede 3–4 sn bekle.',
  },
  inverted_row: {
    name: 'Sırt çekişi (Y-T / masa altı row)', muscle: 'Sırt, arka omuz, duruş', unit: 'reps', resist: 'none',
    variants: ['Yüzüstü Y-T kaldırma', 'Masa altı row — dizler bükülü', 'Masa altı row — bacaklar düz'], defaultVariant: 0,
    video: 'inverted row masa altı ters row evde',
    how: [
      'Y-T kaldırma: yüzüstü yat; kolları önce Y, sonra T şeklinde yerden birkaç cm kaldır, kürek kemiklerini sık, 2 sn tut.',
      'Masa altı row: sağlam, ağır bir masanın altına sırt üstü gir, kenarını tut; vücut düz, göğsü masaya doğru çek, yavaş in.',
      'Masa sallanıyor ya da devrilebilecek gibiyse row yapma — Y-T kaldırmada kal.',
      'Ekipmansız dönemin sırt hareketi: şınavı dengeler, masa başı duruşuna karşı.',
    ],
    easier: 'Dizleri daha çok bük ya da Y-T kaldırmaya dön.',
    harder: 'Bir üst seviyeye geç; tepede 1 sn bekle.',
  },
  lateral_lunge: {
    name: 'Yana lunge', muscle: 'Bacak, kalça (padel hazırlığı)', unit: 'reps', side: 'taraf', resist: 'none',
    how: [
      'Ayaklar geniş açık; bir tarafa doğru kalçayı geriye iterek otur.',
      'Diğer bacak düz kalsın, iki topuk da yerde.',
      'Bükülü bacağın topuğundan iterek ortaya dön.',
      'Padeldeki yan hareketlere hazırlar.',
    ],
  },
  squat_jump: {
    name: 'Hafif squat jump', muscle: 'Bacak, patlayıcı güç (padel hazırlığı)', unit: 'reps', resist: 'none',
    how: [
      'Yarım squat pozisyonundan hafifçe sıçra.',
      'Yumuşak in: dizler hafif bükülü, içe kapanmasın.',
      'Dizinde rahatsızlık hissedersen bu hareketi atla.',
    ],
  },
  band_squat: {
    name: 'Bantlı squat', muscle: 'Bacak, kalça', unit: 'reps', resist: 'miniband',
    how: [
      'Mini bant dizlerin hemen üstünde.',
      'Squat tekniğiyle in: kalça geriye, göğüs dik, topuklar yerde.',
      'İnip kalkarken dizleri banda karşı hafifçe dışa it.',
    ],
    harder: 'Bir üst bant ya da 3–4 sn iniş.',
  },
  band_row: {
    name: 'Bant row', muscle: 'Sırt', unit: 'reps', resist: 'band',
    how: [
      'Bandı kapı aparatıyla göğüs hizasında sabitle.',
      'Bandı gergin tutacak kadar geri çekil, göğüs dik.',
      'Dirsekleri gövdeye yakın geriye çek, kürek kemiklerini sık.',
      'Yavaşça (2–3 sn) geri bırak.',
    ],
  },
  band_glute_bridge: {
    name: 'Bantlı glute bridge', muscle: 'Kalça', unit: 'reps', resist: 'miniband',
    how: [
      'Mini bant dizlerin üstünde, sırt üstü köprü pozisyonu.',
      'Topuklardan iterek kalk, dizleri banda karşı dışa it.',
      'Tepede 1–2 sn kalçanı sık, yavaşça in.',
    ],
  },
  band_lateral_raise: {
    name: 'Bant lateral raise (yana kaldırma)', muscle: 'Yan omuz', unit: 'reps', resist: 'band',
    how: [
      'Bandın ortasına bas, uçları iki elinde tut.',
      'Dirsekler hafif bükülü, kolları yana omuz hizasına kadar kaldır.',
      'Omuzları kulaklara doğru kaldırma; yavaşça indir.',
      'Hafif bantla başla — omuz küçük bir kas.',
    ],
  },
  band_shoulder_press: {
    name: 'Bant omuz press', muscle: 'Omuz', unit: 'reps', resist: 'band',
    how: [
      'Bandın ortasına bas, uçları omuz hizasında tut.',
      'Karnını sık, kolları yukarı it; belini fazla bükme.',
      'Kontrollü indir.',
    ],
  },
  band_pulldown: {
    name: 'Bant lat pulldown', muscle: 'Sırt (genişlik)', unit: 'reps', resist: 'band',
    how: [
      'Bandı kapının üstüne sabitle; diz çök ya da otur.',
      'Kollar yukarıda başla, dirsekleri aşağı ve yanlara doğru çek.',
      'Kürek kemiklerini aşağı-arkaya topla, yavaşça bırak.',
    ],
  },
  monster_walk: {
    name: 'Monster walk', muscle: 'Kalça yanı, diz sağlığı', unit: 'steps', side: 'yön', resist: 'miniband',
    how: [
      'Mini bant diz üstünde ya da bilekte.',
      'Yarım squat pozisyonunda, bandı gergin tutarak yana adım at.',
      'Dizler içe kapanmasın, gövde dik.',
      'Padeldeki yan hareketler için çok faydalı.',
    ],
  },
  band_face_pull: {
    name: 'Bant face pull', muscle: 'Arka omuz, duruş', unit: 'reps', resist: 'band',
    how: [
      'Bandı yüz hizasında sabitle.',
      'Uçları yüzüne doğru çek; dirsekler yukarıda ve yanlarda.',
      'Sonda kolları dışa döndür, 1 sn tut.',
      'Masa başı duruşuna karşı; hafif bantla yap.',
    ],
  },
  band_wrist_ext: {
    name: 'Bant bilek ekstansiyonu', muscle: 'Önkol (dirsek koruması)', unit: 'reps', resist: 'band',
    how: [
      'Otur, önkolunu dizine koy; avuç aşağı baksın.',
      'Bandın bir ucuna bas, diğer ucunu tut.',
      'Bileği yukarı kaldır, 2–3 sn\'de yavaşça indir.',
      'Padelde dirsek ağrısını (tenisçi dirseği) önlemeye yardımcı olur; hafif bant.',
    ],
  },
  band_ext_rotation: {
    name: 'Bant dış rotasyon', muscle: 'Omuz (ısınma)', unit: 'reps', resist: 'band',
    how: [
      'Dirseğini beline yapıştır, 90° bükülü.',
      'Bandı karşı elinle ya da sabit bir noktadan tut.',
      'Önkolunu dışa doğru aç, yavaşça geri getir.',
    ],
  },
  goblet_squat: {
    name: 'Goblet squat', muscle: 'Bacak, kalça', unit: 'reps', resist: 'dumbbell',
    how: [
      'Dambılı göğsünün önünde dikey tut.',
      'Squat tekniğiyle in; dirsekler dizlerin içinden geçsin.',
      'Göğüs dik, topuklardan iterek kalk.',
      'Hafif gelince plakaların çoğunu tek bara topla — tek ağır dambıl yeter.',
    ],
  },
  db_row: {
    name: 'Dambıl row', muscle: 'Sırt', unit: 'reps', side: 'kol', resist: 'dumbbell',
    how: [
      'Bir el ve diz sandalye/kanepe üzerinde, sırt düz.',
      'Dambılı kalçana doğru çek; dirsek gövdeye yakın.',
      'Yavaşça indir.',
      'Hafif gelince plakaları tek bara toplayıp daha ağır çek.',
    ],
  },
  db_rdl: {
    name: 'Romanian deadlift (RDL)', muscle: 'Arka bacak, kalça', unit: 'reps', resist: 'dumbbell',
    variants: ['İki bacak', 'Tek bacak'], defaultVariant: 0,
    how: [
      'Dambıllar uyluk önünde, dizler hafif bükülü.',
      'Kalçanı geriye iterek gövdeyi öne eğ; sırt düz, dambıllar bacağa yakın.',
      'Arka bacakta gerginlik hissedince kalçayı ileri iterek kalk.',
      'Belini yuvarlama.',
      'Tek bacak: dambıllar yetmeyince geç; bir bacak geriye uzanır, dengede zorlanırsan duvara dokun.',
    ],
  },
  db_lateral_raise: {
    name: 'Dambıl lateral raise', muscle: 'Yan omuz', unit: 'reps', resist: 'dumbbell',
    how: [
      'Hafif dambıllarla, dirsekler hafif bükülü.',
      'Kolları yana omuz hizasına kadar kaldır.',
      'Sallanmadan, kontrollü indir.',
    ],
  },
  db_reverse_lunge: {
    name: 'Dambıl geriye lunge', muscle: 'Bacak, kalça', unit: 'reps', side: 'bacak', resist: 'dumbbell',
    variants: ['Geriye lunge', 'Bulgar split squat'], defaultVariant: 0,
    how: [
      'İki elde dambıl, kollar yanlarda.',
      'Geriye geniş adım, iki diz yaklaşık 90°.',
      'Öndeki topuktan iterek dön.',
      'Bulgar split squat: dambıllar yetmeyince geç; arka ayağın üstü sandalyede, öndeki bacakla in-kalk.',
    ],
  },
  db_shoulder_press: {
    name: 'Dambıl omuz press', muscle: 'Omuz', unit: 'reps', resist: 'dumbbell',
    how: [
      'Dambıllar omuz hizasında, avuçlar öne ya da birbirine bakar.',
      'Karnını sık, yukarı it; belini bükme.',
      'Kontrollü indir.',
    ],
  },
  pullup: {
    name: 'Barfiks', muscle: 'Sırt (genişlik)', unit: 'reps', resist: 'none',
    variants: ['Sandalye destekli', 'Negatif (3–5 sn iniş)', 'Barfiks'], defaultVariant: 0,
    how: [
      'Kapı barfiks barını avuçlar öne bakacak şekilde, omuz genişliğinden biraz geniş tut.',
      'Sandalye destekli: ayaklarını önündeki sağlam sandalyeye koy; bacaklarla yalnızca gerektiği kadar yardım et.',
      'Negatif: sandalyeyle üst noktaya çık, kollar düzleşene kadar 3–5 sn\'de yavaşça in.',
      'Kürek kemiklerini aşağı-arkaya topla, göğsü çubuğa doğru götür; sallanma.',
    ],
  },
  db_glute_bridge: {
    name: 'Dambıllı glute bridge', muscle: 'Kalça', unit: 'reps', resist: 'dumbbell',
    variants: ['Yerde köprü', 'Hip thrust (sırt kanepede)'], defaultVariant: 0,
    how: [
      'Dambılı kalça kemiklerinin üstüne yerleştir, iki elle tut.',
      'Topuklardan iterek kalk, tepede 1–2 sn sık.',
      'Yavaşça in.',
      'Hip thrust: kürek kemikleri kanepe ya da sandalye kenarında; hareket açıklığı büyür, aynı dambıl daha zor gelir.',
    ],
  },
  db_rear_delt_fly: {
    name: 'Dambıl arka omuz açış', muscle: 'Arka omuz, duruş', unit: 'reps', resist: 'dumbbell',
    how: [
      'Kalçadan öne eğil, sırt düz (ya da göğsünü bir sandalye sırtına yasla).',
      'Hafif dambılları, dirsekler hafif bükülü, yana doğru omuz hizasına aç.',
      'Kürek kemiklerini sık, 1 sn tut, yavaşça indir.',
      'Masa başı duruşuna karşı; ağırlık değil kontrol önemli.',
    ],
  },
  db_wrist_ext: {
    name: 'Dambıl bilek ekstansiyonu', muscle: 'Önkol (dirsek koruması)', unit: 'reps', resist: 'dumbbell',
    how: [
      'Otur, önkolunu dizine koy; avuç aşağı baksın, bilek dizden taşsın.',
      'Boş dambıl barıyla (ya da 1 kg plakayla) başla; kaldırırken diğer elinle yardım et.',
      'Yalnızca çalışan elle 3 sn\'de yavaşça indir (eksantrik).',
      'Padelde dirsek ağrısını (tenisçi dirseği) önlemeye yardımcı olur; ağrı yapmamalı.',
    ],
  },
  hip_flexor_stretch: {
    name: 'Kalça fleksör esnetmesi', muscle: 'Kalça önü (masa başı)', unit: 'sec', side: 'taraf', resist: 'none',
    how: [
      'Bir diz yerde, diğer ayak önde (şövalye pozisyonu).',
      'Kalçanı hafif ileri it, arka bacağın kalçasını sık.',
      'Kalça önünde gerilme hissedince 30 sn tut; sonra diğer taraf.',
    ],
  },
};

// Video araması için daha iyi sonuç veren ifadeler (yoksa "<ad> nasıl yapılır").
const VIDEO = {
  pullup: 'negatif barfiks sandalye destekli barfiks nasıl yapılır',
  db_rear_delt_fly: 'dumbbell reverse fly arka omuz nasıl yapılır',
  db_wrist_ext: 'eksantrik bilek ekstansiyonu dambıl tenisçi dirseği egzersizi',
  db_rdl: 'dambıl romanian deadlift nasıl yapılır',
  db_glute_bridge: 'dambıl hip thrust glute bridge evde',
  db_reverse_lunge: 'dambıl geriye lunge bulgar split squat nasıl yapılır',
  band_face_pull: 'bant face pull nasıl yapılır',
  monster_walk: 'monster walk mini bant nasıl yapılır',
  hip_flexor_stretch: 'kalça fleksör esnetme diz çökerek',
};
for (const [id, q] of Object.entries(VIDEO)) if (EX[id] && !EX[id].video) EX[id].video = q;

/** YouTube arama bağlantısı (uygulama video barındırmaz; yalnızca arama açar). */
export function videoUrl(exId) {
  const ex = EX[exId];
  if (!ex) return null;
  const q = ex.video ?? `${ex.name.split('(')[0].trim()} nasıl yapılır`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * Aynı işi gören alternatifler (ağrı, eksik ekipman ya da yer sorunu için o günlük değişim).
 * Dönemde bulunmayan ekipmanı gerektirenler program.js `alternativesFor` ile elenir.
 */
export const ALTERNATIVES = {
  squat: ['reverse_lunge', 'goblet_squat'],
  goblet_squat: ['db_reverse_lunge', 'squat'],
  band_squat: ['squat', 'goblet_squat'],
  reverse_lunge: ['squat', 'lateral_lunge'],
  db_reverse_lunge: ['goblet_squat', 'reverse_lunge'],
  pushup: ['wide_pushup'],
  wide_pushup: ['pushup'],
  chair_dips: ['pushup'],
  inverted_row: ['db_row', 'superman'],
  superman: ['inverted_row'],
  db_row: ['inverted_row', 'band_row'],
  band_row: ['db_row', 'inverted_row'],
  pullup: ['db_row', 'inverted_row', 'band_pulldown'],
  band_pulldown: ['pullup', 'band_row', 'inverted_row'],
  db_rdl: ['db_glute_bridge', 'single_leg_bridge'],
  glute_bridge: ['single_leg_bridge', 'db_glute_bridge'],
  single_leg_bridge: ['glute_bridge', 'db_glute_bridge'],
  db_glute_bridge: ['db_rdl', 'glute_bridge'],
  band_glute_bridge: ['glute_bridge', 'db_glute_bridge'],
  db_shoulder_press: ['band_shoulder_press', 'pushup'],
  band_shoulder_press: ['db_shoulder_press', 'pushup'],
  db_lateral_raise: ['band_lateral_raise', 'db_shoulder_press', 'inverted_row'],
  band_lateral_raise: ['db_lateral_raise'],
  db_rear_delt_fly: ['band_face_pull', 'inverted_row'],
  band_face_pull: ['db_rear_delt_fly', 'inverted_row'],
  plank: ['side_plank'],
  side_plank: ['plank'],
  monster_walk: ['lateral_lunge'],
  lateral_lunge: ['reverse_lunge'],
  squat_jump: ['lateral_lunge'],
  db_wrist_ext: ['band_wrist_ext'],
  band_wrist_ext: ['db_wrist_ext'],
};
