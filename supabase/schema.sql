-- Bizim Gökyüzümüz — Supabase Şeması ve RLS Kuralları
-- Supabase SQL Editor içine yapıştırıp çalıştırın.

create extension if not exists pgcrypto;

-- 1. Profiller: sadece 2 kullanıcı ('hamham' ve 'beto')
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  who text unique not null check (who in ('hamham', 'beto')),
  push_subscription jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Yıldızlar: yalnızca açık metadata durur (kim, tür, konum, boyut, zaman, unlock_at).
-- Şifreli içerik ve medya yolu star_secrets tablosunda tutulur ve kilit açılmadan alıcıya dönmez.
create table if not exists public.stars (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'miss', 'photo', 'voice')),
  x real not null check (x >= 0 and x <= 100),
  y real not null check (y >= 0 and y <= 100),
  size real not null check (size >= 4 and size <= 20),
  once boolean not null default false,
  spent boolean not null default false,
  has_media boolean not null default false,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  unlock_at timestamptz,
  unlock_notified boolean not null default false,
  unlock_push_sent boolean not null default false
);

-- Mevcut veritabanından yükseltme yapılıyorsa yeni sütunları ekle
alter table public.stars add column if not exists unlock_at timestamptz;
alter table public.stars add column if not exists unlock_notified boolean not null default false;
alter table public.stars add column if not exists unlock_push_sent boolean not null default false;

create index if not exists stars_created_at_idx on public.stars(created_at asc);
create index if not exists stars_unlock_pending_idx
  on public.stars(unlock_at asc)
  where unlock_at is not null and unlock_push_sent = false;

-- 2b. Şifreli yıldız içerikleri: Realtime'a EKLEMEZ, kilit açılana dek alıcıya SELECT vermez
create table if not exists public.star_secrets (
  star_id uuid primary key references public.stars(id) on delete cascade,
  payload text not null,
  media_path text,
  once boolean not null default false,
  created_at timestamptz not null default now()
);

-- Eski şemadan gelen stars.payload varsa star_secrets içine taşı ve stars.payload sütununu kaldır
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stars' and column_name = 'payload'
  ) then
    execute $mig$
      insert into public.star_secrets (star_id, payload, media_path, once, created_at)
      select id, payload, case when has_media then id::text else null end, once, created_at
      from public.stars
      on conflict (star_id) do nothing
    $mig$;
    alter table public.stars drop column payload;
  end if;
end $$;

-- 3. Ortak gizli kelime doğrulama metni (tek satır, id = 1)
create table if not exists public.settings (
  id integer primary key check (id = 1),
  verify_blob text not null,
  updated_at timestamptz not null default now()
);

-- Yardımcı güvenlik fonksiyonu: yalnızca profiles tablosundaki iki yetkili hesap
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
  );
$$;

-- Sunucu saatini istemciye vermek için RPC (istemci saat manipülasyonunu önler)
create or replace function public.server_now()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

grant execute on function public.server_now() to authenticated;

-- RLS aktif et
alter table public.profiles enable row level security;
alter table public.stars enable row level security;
alter table public.star_secrets enable row level security;
alter table public.settings enable row level security;

-- Profiles RLS
drop policy if exists "profiles_select_allowed" on public.profiles;
create policy "profiles_select_allowed"
  on public.profiles for select
  using (public.is_allowed_user());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid() and public.is_allowed_user())
  with check (id = auth.uid() and public.is_allowed_user());

-- Stars RLS (kilitli yıldızın açık metadata'sı her iki tarafa görünür; içerik görünmez)
drop policy if exists "stars_select_allowed" on public.stars;
create policy "stars_select_allowed"
  on public.stars for select
  using (public.is_allowed_user());

drop policy if exists "stars_insert_own" on public.stars;
create policy "stars_insert_own"
  on public.stars for insert
  with check (public.is_allowed_user() and from_user = auth.uid());

drop policy if exists "stars_update_recipient" on public.stars;
create policy "stars_update_recipient"
  on public.stars for update
  using (
    public.is_allowed_user()
    and from_user <> auth.uid()
    and (unlock_at is null or unlock_at <= now())
  )
  with check (
    public.is_allowed_user()
    and from_user <> auth.uid()
    and (unlock_at is null or unlock_at <= now())
  );

-- Gönderilen yıldızın sabit alanları ve kilit/push bayrakları istemciden değiştirilemez
create or replace function public.guard_star_update()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id
     or new.from_user <> old.from_user
     or new.kind <> old.kind
     or new.x <> old.x
     or new.y <> old.y
     or new.size <> old.size
     or new.once <> old.once
     or new.has_media <> old.has_media
     or new.created_at <> old.created_at
     or new.unlock_at is distinct from old.unlock_at then
    raise exception 'Yıldızın sabit alanları değiştirilemez';
  end if;
  if auth.uid() is not null and new.unlock_push_sent is distinct from old.unlock_push_sent then
    raise exception 'unlock_push_sent yalnızca sunucu tarafından güncellenebilir';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_star_update on public.stars;
create trigger trg_guard_star_update
  before update on public.stars
  for each row execute function public.guard_star_update();

-- Star Secrets RLS: alıcı kilit açılmadan (unlock_at > now()) satırı HİÇ okuyamaz
drop policy if exists "star_secrets_select_unlocked" on public.star_secrets;
create policy "star_secrets_select_unlocked"
  on public.star_secrets for select
  using (
    public.is_allowed_user()
    and exists (
      select 1 from public.stars s
      where s.id = star_secrets.star_id
        and (
          s.from_user = auth.uid()
          or s.unlock_at is null
          or s.unlock_at <= now()
        )
    )
  );

drop policy if exists "star_secrets_insert_own" on public.star_secrets;
create policy "star_secrets_insert_own"
  on public.star_secrets for insert
  with check (
    public.is_allowed_user()
    and exists (
      select 1 from public.stars s
      where s.id = star_secrets.star_id
        and s.from_user = auth.uid()
    )
  );

-- Settings RLS (gizli kelime doğrulama blob'u)
drop policy if exists "settings_select_allowed" on public.settings;
create policy "settings_select_allowed"
  on public.settings for select
  using (public.is_allowed_user());

drop policy if exists "settings_insert_allowed" on public.settings;
create policy "settings_insert_allowed"
  on public.settings for insert
  with check (public.is_allowed_user() and id = 1);

drop policy if exists "settings_update_allowed" on public.settings;
create policy "settings_update_allowed"
  on public.settings for update
  using (public.is_allowed_user() and id = 1)
  with check (public.is_allowed_user() and id = 1);

-- Realtime yayınını SADECE public.stars için aç (star_secrets kesinlikle eklenmez!)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stars'
  ) then
    alter publication supabase_realtime add table public.stars;
  end if;
end $$;

-- Özel Storage bucket ('media')
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = false;

drop policy if exists "media_select_allowed" on storage.objects;
create policy "media_select_allowed"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and public.is_allowed_user()
    and exists (
      select 1 from public.stars s
      where s.id::text = storage.objects.name
        and (
          s.from_user = auth.uid()
          or s.unlock_at is null
          or s.unlock_at <= now()
        )
    )
  );

drop policy if exists "media_insert_allowed" on storage.objects;
create policy "media_insert_allowed"
  on storage.objects for insert
  with check (bucket_id = 'media' and public.is_allowed_user() and owner = auth.uid());

drop policy if exists "media_delete_allowed" on storage.objects;
create policy "media_delete_allowed"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and public.is_allowed_user()
    and exists (
      select 1 from public.stars s
      where s.id::text = storage.objects.name
        and (
          s.from_user = auth.uid()
          or s.unlock_at is null
          or s.unlock_at <= now()
        )
    )
  );

-- ============================================================================
-- Zamanlı Yıldız Bildirimleri (pg_cron + pg_net)
-- Supabase Dashboard > Database > Extensions içinden pg_cron ve pg_net'i açın,
-- ardından aşağıdaki bloğu kendi proje adresiniz ve service_role anahtarınızla
-- (veya Vault gizli anahtarıyla) SQL Editor'de bir kez çalıştırın:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.unschedule('unlock-stars-push')
-- where exists (select 1 from cron.job where jobname = 'unlock-stars-push');
--
-- select cron.schedule(
--   'unlock-stars-push',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJE_REF>.supabase.co/functions/v1/send-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
--     ),
--     body := '{"mode":"check_unlocks"}'::jsonb
--   );
--   $$
-- );
-- ============================================================================
