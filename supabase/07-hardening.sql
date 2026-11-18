-- ============================================================================
-- 07-hardening.sql — GÜVENLİK SIKILAŞTIRMA (HOTFIX 17). Tekrar çalıştırılabilir (idempotent).
-- Supabase Dashboard -> SQL Editor -> New query -> yapıştır -> Run.
-- SIRA: ÖNCE istemcinin v6.0.31+ sürümü yayında olmalı (artık profiles.push_subscription okumuyor), SONRA bu dosya.
-- Kapsam: anon yetkilerini kaldır, tüm politikaları 'to authenticated' yap, fonksiyon yürütme yetkilerini kapat,
--         push_subscription'ı partnerden gizle, profiles.who/id değiştirilemesin, bucket'ı private tut.
-- ============================================================================

-- 1) anon rolünden her şeyi al (public şeması)
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 2) fonksiyonlar: PUBLIC/anon çalıştıramasın; yalnızca giriş yapmış kullanıcı
revoke all on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;
revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;

-- 3) profiles: kolon bazlı yetki — partner (ve herkes) push_subscription'ı OKUYAMAZ.
--    (Edge function service_role ile okur; istemci yalnızca YAZAR.)
revoke select on public.profiles from authenticated;
grant  select (id, who, updated_at) on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant  update (push_subscription, updated_at) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- 3b) who / id asla değişmesin (yetki kolonlarla zaten kısıtlı; tetikleyici ikinci kilit)
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.who <> old.who then
    raise exception 'profiles.id / who değiştirilemez';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 4) Politikaları yalnızca 'authenticated' rolüne bağla (anon hiçbir politikaya girmesin)
alter policy "profiles_select_allowed" on public.profiles to authenticated;
alter policy "profiles_update_own"     on public.profiles to authenticated;
alter policy "stars_select_allowed"    on public.stars to authenticated;
alter policy "stars_insert_own"        on public.stars to authenticated;
alter policy "stars_update_recipient"  on public.stars to authenticated;
alter policy "star_secrets_select_unlocked" on public.star_secrets to authenticated;
alter policy "star_secrets_insert_own"      on public.star_secrets to authenticated;
alter policy "settings_select_allowed" on public.settings to authenticated;
alter policy "settings_insert_allowed" on public.settings to authenticated;
alter policy "settings_update_allowed" on public.settings to authenticated;
alter policy "media_select_allowed" on storage.objects to authenticated;
alter policy "media_insert_allowed" on storage.objects to authenticated;
alter policy "media_delete_allowed" on storage.objects to authenticated;

-- 5) Storage: bucket private
update storage.buckets set public = false where id = 'media';

-- 5b) Özel Realtime kanalları ('sky:*', 'pair:live', 'pair:draw'): yalnızca iki izinli profil
alter table realtime.messages enable row level security;
drop policy if exists "pair_realtime_select_allowed" on realtime.messages;
create policy "pair_realtime_select_allowed"
  on realtime.messages for select
  to authenticated
  using (
    (realtime.topic() like 'sky:%' or realtime.topic() in ('pair:live', 'pair:draw'))
    and public.is_allowed_user()
  );
drop policy if exists "pair_realtime_insert_allowed" on realtime.messages;
create policy "pair_realtime_insert_allowed"
  on realtime.messages for insert
  to authenticated
  with check (
    (realtime.topic() like 'sky:%' or realtime.topic() in ('pair:live', 'pair:draw'))
    and public.is_allowed_user()
  );

-- 5c) public.stars.kind kısıtına 'draw' ve 'text' türlerini ekle + kind ile has_media tutarlılığını zorla (HOTFIX 23)
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.stars'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%kind%'
  loop
    execute format('alter table public.stars drop constraint %I', r.conname);
  end loop;
  alter table public.stars
    add constraint stars_kind_check
    check (
      kind in ('note', 'miss', 'text', 'photo', 'voice', 'draw')
      and (kind not in ('text', 'miss') or has_media = false)
      and (kind not in ('photo', 'voice', 'draw') or has_media = true)
    );
end $$;

-- 6) Kullanılmayan/geniş politika kalmadığından emin ol: `using (true)` olanlar listelenir (BOŞ dönmeli)
select schemaname, tablename, policyname, roles, qual, with_check
from pg_policies
where (qual = 'true' or with_check = 'true' or 'anon' = any(roles) or 'public' = any(roles))
  and schemaname in ('public', 'storage', 'realtime');

-- ============================ DOĞRULAMA SORGULARI ============================
-- a) RLS her tabloda açık mı? (hepsi true olmalı)
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- b) Yalnızca 2 kullanıcı var mı? (tam 2 satır)
select id, email, created_at from auth.users order by created_at;
-- c) profiller (2 satır: hamham, beto)
select id, who from public.profiles order by who;
-- d) anon'un hiçbir tablo yetkisi kalmadı mı? (BOŞ dönmeli)
select table_schema, table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';
-- e) cron işinde gerçek service_role yazılı mı? (cron.job yalnızca postgres rolüne açık; yine de 'SERVICE_ROLE_BURAYA' dışı bir anahtar kullanıldıysa vault/secret'a taşı)
select jobname, schedule, left(command, 60) as command_head from cron.job;

