-- ============================================================================
-- 05-realtime-private.sql — Özel Realtime Kanalları ('pair:live' ve 'pair:draw')
-- Yalnızca public.profiles tablosundaki iki yetkili kullanıcıya SELECT ve INSERT izni verir.
-- Supabase Dashboard -> SQL Editor -> New query içine yapıştırıp Run'a basın.
-- ============================================================================

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

-- DOĞRULAMA SORGUSU (iki politikanın da oluştuğunu kontrol edin):
select policyname, cmd, roles
from pg_policies
where schemaname = 'realtime'
  and tablename = 'messages'
  and policyname in ('pair_realtime_select_allowed', 'pair_realtime_insert_allowed');
