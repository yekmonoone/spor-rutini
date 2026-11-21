-- Spor Rutini — 2. aşama eşitleme şeması.
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştır → Run.
-- Tekrar çalıştırmak güvenlidir.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null check (store in ('kv', 'workouts', 'daily', 'padel', 'measurements')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,           -- kaydın cihazdaki son değişiklik zamanı (son yazan kazanır)
  deleted boolean not null default false,    -- silinen kayıtlar diğer cihazlara da silinmiş olarak gider
  server_updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);

create index if not exists records_user_server_updated_idx on public.records (user_id, server_updated_at);

-- Satır düzeyinde güvenlik: herkes yalnızca kendi kayıtlarını görür ve değiştirir.
alter table public.records enable row level security;
alter table public.records force row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

create policy "records_select_own" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "records_insert_own" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "records_update_own" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "records_delete_own" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Toplu gönderim: yalnızca daha yeni olan kayıt üzerine yazar. RLS geçerlidir (security invoker).
create or replace function public.sync_push(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  insert into public.records (user_id, store, id, data, updated_at, deleted, server_updated_at)
  select auth.uid(), r->>'store', r->>'id', r->'data', (r->>'updated_at')::timestamptz,
         coalesce((r->>'deleted')::boolean, false), clock_timestamp()
  from jsonb_array_elements(rows) as r
  on conflict (user_id, store, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        server_updated_at = clock_timestamp()
    where public.records.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
