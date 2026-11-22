// Hatırlatma türleri ve varsayılan saatleri. Sunucudaki supabase/functions/send-reminders/logic.js ile aynı olmalı (test kontrol eder).
export const PUSH_TYPES = {
  weigh: { label: 'Sabah tartı', time: '08:30', hint: 'Bugün kilo girmediysen' },
  workout: { label: 'Antrenman', time: '19:45', hint: 'Kuvvet günüysen ve henüz kaydetmediysen' },
  dayEnd: { label: 'Gün sonu', time: '22:30', hint: 'Adımını girmediysen' },
  checkin: { label: 'Pazar haftalık kontrol', time: '20:00', hint: 'Yalnızca Pazar, yapmadıysan' },
};

export function defaultPushPrefs() {
  return Object.fromEntries(Object.entries(PUSH_TYPES).map(([k, t]) => [k, { on: true, time: t.time }]));
}
