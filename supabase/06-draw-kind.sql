-- ============================================================================
-- 06-draw-kind.sql — public.stars.kind kısıtına 'draw' ve 'text' türlerini ekler
-- Supabase Dashboard -> SQL Editor -> New query içine yapıştırıp Run'a basın.
-- ============================================================================

-- 1) ÖNCE MEVCUT KISIT ADINI OKUMA (bilgi amaçlı, aynı sorguda çalışır):
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.stars'::regclass and contype = 'c';

do $$
declare
  r record;
begin
  -- public.stars üzerindeki 'kind' sütununu kontrol eden mevcut CHECK kısıtlarını bul ve kaldır
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
    check (kind in ('note', 'miss', 'text', 'photo', 'voice', 'draw'));
end $$;

-- 2) DOĞRULAMA SORGUSU (sonuçta stars_kind_check içinde 'draw' görünmelidir):
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.stars'::regclass
  and contype = 'c';
