-- Spor Rutini — 0.7.0 bildirimler (Web Push).
-- Bu dosya şablondur: __PROJECT_URL__ ve __CRON_SECRET__ yerine gerçek değerler gelir.
-- Doldurulmuş hâlini `node tools/push-setup.mjs` üretir (supabase/push-setup.local.sql, depoya girmez).
-- Supabase panelinde: SQL Editor → New query → doldurulmuş dosyanın tamamını yapıştır → Run. Tekrar çalıştırmak güvenlidir.

-- 1) Bildirim abonelikleri: her cihaz (ana ekran uygulaması) bir satır.
create table if not exists public.push_subscriptions (
  endpoint text primary key,                 -- tarayıcının push adresi (Apple/Google)
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,                      -- abonenin şifreleme açık anahtarı
  auth text not null,                        -- abonenin kimlik doğrulama sırrı
  prefs jsonb not null default '{}'::jsonb,  -- { weigh: { on, time }, workout: …, dayEnd: …, checkin: … }
  tz text not null default 'Europe/Istanbul',
  last_sent jsonb not null default '{}'::jsonb,  -- { weigh: 'YYYY-AA-GG', … } günde bir kez
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_update_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;

create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_update_own" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 2) Zamanlayıcı: 15 dakikada bir Edge Function'ı gizli başlıkla çağırır.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gizli değer Vault'ta saklanır (SQL'de düz metin kalmaz).
do $$
declare
  sid uuid;
begin
  select id into sid from vault.secrets where name = 'spor_rutini_cron_secret';
  if sid is null then
    perform vault.create_secret('__CRON_SECRET__', 'spor_rutini_cron_secret');
  else
    perform vault.update_secret(sid, '__CRON_SECRET__');
  end if;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'spor-rutini-hatirlatma';

select cron.schedule(
  'spor-rutini-hatirlatma',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := '__PROJECT_URL__/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'spor_rutini_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
