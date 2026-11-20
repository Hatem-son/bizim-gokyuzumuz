-- ============================================================================
-- 08-keep-last-8-stars.sql — Son 8 yıldız dışındaki eski yıldızları ve medyalarını temizle
-- Supabase Dashboard -> SQL Editor -> New query -> yapıştır -> Run.
-- ============================================================================

-- 1) İzinli kullanıcının kendi yıldızlarını silebilmesi için RLS politikası
drop policy if exists "stars_delete_own" on public.stars;
create policy "stars_delete_own"
  on public.stars for delete
  to authenticated
  using (public.is_allowed_user() and from_user = auth.uid());

-- 2) Son 8 yıldız dışındaki eski yıldızlara ait Storage dosyalarını ve satırları sil
with keep as (
  select id
  from public.stars
  order by created_at desc
  limit 8
),
to_delete as (
  select id
  from public.stars
  where id not in (select id from keep)
),
del_storage as (
  delete from storage.objects
  where bucket_id = 'media'
    and (
      name in (select id::text from to_delete)
      or split_part(split_part(name, '/', 2), '.', 1) in (select id::text from to_delete)
    )
)
delete from public.stars
where id in (select id from to_delete);

