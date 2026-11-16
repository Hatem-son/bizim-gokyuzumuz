-- ============================================================================
-- 02-profiles.sql — Ham ham ve Beto Profillerini Otomatik Eşleştirme
-- ÖNCE aşağıdaki 2 e-postayı Supabase -> Authentication -> Users ekranında
-- oluşturduğun gerçek/uydurma e-postalarla değiştir (src/config.ts ile aynı olsun),
-- sonra SQL Editor -> New query -> Yapıştır -> Run'a bas.
-- ============================================================================

do $$
declare
  v_hamham_email text := 'humam@gokyuzu.app';
  v_beto_email   text := 'beto@gokyuzu.app';
  v_hamham_id    uuid;
  v_beto_id      uuid;
begin
  select id into v_hamham_id from auth.users where lower(email) = lower(v_hamham_email) limit 1;
  select id into v_beto_id   from auth.users where lower(email) = lower(v_beto_email)   limit 1;

  if v_hamham_id is null then
    raise exception 'Ham ham kullanıcısı auth.users içinde bulunamadı (%). E-posta yazımını kontrol et.', v_hamham_email;
  end if;

  if v_beto_id is null then
    raise exception 'Beto kullanıcısı auth.users içinde bulunamadı (%). E-posta yazımını kontrol et.', v_beto_email;
  end if;

  insert into public.profiles (id, who)
  values
    (v_hamham_id, 'hamham'),
    (v_beto_id, 'beto')
  on conflict (who) do update
    set id = excluded.id,
        updated_at = now();
end $$;
