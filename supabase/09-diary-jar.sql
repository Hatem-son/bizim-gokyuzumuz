-- ============================================================================
-- 09-diary-jar.sql — Ortak Anı Kavanozu & Gizli Günlük Sayfaları
-- Supabase Dashboard -> SQL Editor -> New query -> yapıştır -> Run.
-- Tekrar çalıştırılabilir (idempotent).
--
-- GİZLİLİK KURALI:
--   - public.diary_entries: iki kullanıcı da kavanozdaki katlı notların varlığını
--     (kim, tarih, ruh hali) görebilir; kavanoz birlikte dolar.
--   - public.diary_secrets: şifreli günlük metni YALNIZCA yazan kullanıcıya
--     (auth.uid() = from_user) açılır. Karşı taraf veritabanından bile okuyamaz.
-- ============================================================================

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  from_who text not null check (from_who in ('hamham', 'beto')),
  entry_date text not null,
  mood text not null default 'heart' check (mood in ('sun', 'coffee', 'moon', 'rain', 'heart', 'spark')),
  created_at timestamptz not null default now()
);

create index if not exists diary_entries_created_at_idx on public.diary_entries(created_at desc);

create table if not exists public.diary_secrets (
  diary_id uuid primary key references public.diary_entries(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  payload text not null,
  created_at timestamptz not null default now()
);

alter table public.diary_entries enable row level security;
alter table public.diary_secrets enable row level security;

revoke all on public.diary_entries from anon;
revoke all on public.diary_secrets from anon;
grant select, insert, delete on public.diary_entries to authenticated;
grant select, insert, delete on public.diary_secrets to authenticated;

drop policy if exists "diary_entries_select_allowed" on public.diary_entries;
create policy "diary_entries_select_allowed"
  on public.diary_entries for select
  to authenticated
  using (public.is_allowed_user());

drop policy if exists "diary_entries_insert_own" on public.diary_entries;
create policy "diary_entries_insert_own"
  on public.diary_entries for insert
  to authenticated
  with check (auth.uid() = from_user and public.is_allowed_user());

drop policy if exists "diary_entries_delete_own" on public.diary_entries;
create policy "diary_entries_delete_own"
  on public.diary_entries for delete
  to authenticated
  using (auth.uid() = from_user and public.is_allowed_user());

drop policy if exists "diary_secrets_select_author_only" on public.diary_secrets;
create policy "diary_secrets_select_author_only"
  on public.diary_secrets for select
  to authenticated
  using (auth.uid() = from_user and public.is_allowed_user());

drop policy if exists "diary_secrets_insert_own" on public.diary_secrets;
create policy "diary_secrets_insert_own"
  on public.diary_secrets for insert
  to authenticated
  with check (auth.uid() = from_user and public.is_allowed_user());

drop policy if exists "diary_secrets_delete_own" on public.diary_secrets;
create policy "diary_secrets_delete_own"
  on public.diary_secrets for delete
  to authenticated
  using (auth.uid() = from_user and public.is_allowed_user());
