-- ============================================================================
-- 10-keep-last-2-stars.sql — Son 2 yıldız dışındaki bütün yıldızları ve medyalarını sil
-- Supabase Dashboard -> SQL Editor -> New query -> yapıştır -> Run.
-- ============================================================================

drop policy if exists "stars_delete_own" on public.stars;
create policy "stars_delete_own"
  on public.stars for delete
  to authenticated
  using (public.is_allowed_user() and from_user = auth.uid());

with keep as (
  select id
  from public.stars
  order by created_at desc
  limit 2
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
