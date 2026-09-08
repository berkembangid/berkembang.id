-- ---------------------------------------------------------------------------
-- 0070 — Sakelar fitur: satu bacaan untuk pemilik, satu jalan tulis untuk admin
-- ---------------------------------------------------------------------------
-- `0069` membuat mejanya: tabel sakelar, tabel penyimpangan per akun, dan
-- `feature_flag_enabled()` yang menjawab satu sakelar untuk satu usaha. Yang
-- belum ada adalah dua ujungnya.
--
-- UJUNG PEMILIK. Layar Catat perlu tahu apakah tombol kamera boleh muncul,
-- dan ia tahu itu sebelum menggambar apa pun. Memanggil `feature_flag_enabled`
-- dari klien menuntut id usaha, dan mencarinya lebih dulu berarti dua
-- perjalanan bolak-balik untuk satu pertanyaan yang jawabannya sekalimat.
-- `my_feature_flags()` menjawab seluruh sakelar sekaligus, dengan penyimpangan
-- per akun sudah diperhitungkan -- klien tidak pernah perlu tahu id usahanya.
--
-- UJUNG ADMIN. Mematikan sakelar adalah tindakan tulis, dan di Ruang Mesin
-- setiap tindakan tulis wajib beralasan dan tercatat dalam transaksi yang sama.
-- Karena itu tidak ada `update` langsung ke `feature_flags` dari mana pun:
-- satu-satunya jalan adalah fungsi di bawah, yang menulis catatannya sendiri.
--
-- KENAPA MEMATIKAN TIDAK MENUNTUT PERAN SETINGGI MENYALAKAN. Sakelar darurat
-- ada justru untuk dipakai saat ada yang jebol, sering oleh siapa pun yang
-- kebetulan sedang berjaga. Menuntut SUPER_ADMIN untuk mematikan berarti
-- meminta orang mencari atasannya sementara kerusakannya berjalan terus.
-- Menyalakan kembali adalah keputusan yang bisa ditunggu -- itu menuntut
-- SUPER_ADMIN. Asimetri yang sama dengan pembekuan akun di `0069`.

begin;

/**
 * Seluruh sakelar untuk usaha pemanggil, penyimpangan sudah diperhitungkan.
 *
 * Mengembalikan objek, bukan baris: klien membacanya sebagai kamus dan tidak
 * perlu tahu ada berapa sakelar. Menambah sakelar keenam nanti tidak menuntut
 * satu baris pun berubah di sisi klien.
 */
create or replace function public.my_feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with mine as (
    select business.id
    from public.businesses as business
    where private.business_access(business.id)
    limit 1
  )
  select coalesce(
    jsonb_object_agg(flag.flag_key, coalesce(override.enabled, flag.enabled)),
    '{}'::jsonb
  )
  from public.feature_flags as flag
  left join mine on true
  left join public.feature_flag_overrides as override
    on override.flag_key = flag.flag_key and override.business_id = mine.id;
$fn$;

revoke all on function public.my_feature_flags() from public, anon;
grant execute on function public.my_feature_flags() to authenticated;

/**
 * Menyalakan atau mematikan sakelar secara global.
 *
 * Alasannya wajib dan catatannya ditulis dalam transaksi yang sama; kalau
 * catatannya gagal, sakelarnya tidak jadi berubah. Itulah kenapa tidak ada
 * `grant update` atas `feature_flags` kepada siapa pun.
 */
create or replace function public.admin_set_feature_flag(
  p_flag_key text,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_previous boolean;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN_OPS';
  end if;

  select enabled into v_previous from public.feature_flags where flag_key = p_flag_key;
  if v_previous is null then
    raise exception using errcode = '22023', message = 'SAKELAR_TIDAK_DIKENAL';
  end if;

  -- Menyalakan kembali adalah keputusan yang bisa ditunggu; mematikan tidak.
  if p_enabled and not v_previous and v_role <> 'SUPER_ADMIN' then
    raise exception using errcode = '42501', message = 'MENYALAKAN_BUTUH_SUPER_ADMIN';
  end if;

  update public.feature_flags
  set enabled = p_enabled, updated_by = v_actor, updated_at = now()
  where flag_key = p_flag_key;

  perform private.write_admin_log(
    v_role,
    case when p_enabled then 'FEATURE_FLAG_ENABLED' else 'FEATURE_FLAG_DISABLED' end,
    p_reason, 'feature_flag', p_flag_key, null,
    jsonb_build_object('from', v_previous, 'to', p_enabled)
  );

  return jsonb_build_object('flagKey', p_flag_key, 'from', v_previous, 'to', p_enabled);
end;
$fn$;

/**
 * Penyimpangan untuk satu akun.
 *
 * Dipakai untuk membuka fitur baru ke sekelompok kecil lebih dulu, dan untuk
 * menutupnya pada satu akun yang bermasalah tanpa mematikannya bagi semua
 * orang. `p_enabled = null` menghapus penyimpangannya, mengembalikan akun itu
 * ke nilai global -- dan itu memang harus bisa, karena penyimpangan yang tidak
 * bisa dicabut lama-lama menjadi lapisan aturan yang tidak ada yang ingat.
 */
create or replace function public.admin_set_feature_flag_for_business(
  p_flag_key text,
  p_business_id uuid,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN_OPS';
  end if;

  if not exists (select 1 from public.feature_flags where flag_key = p_flag_key) then
    raise exception using errcode = '22023', message = 'SAKELAR_TIDAK_DIKENAL';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception using errcode = '22023', message = 'USAHA_TIDAK_DITEMUKAN';
  end if;

  if p_enabled is null then
    delete from public.feature_flag_overrides
    where flag_key = p_flag_key and business_id = p_business_id;
  else
    insert into public.feature_flag_overrides (flag_key, business_id, enabled, set_by)
    values (p_flag_key, p_business_id, p_enabled, v_actor)
    on conflict (flag_key, business_id)
    do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
  end if;

  perform private.write_admin_log(
    v_role, 'FEATURE_FLAG_OVERRIDE_SET', p_reason, 'feature_flag', p_flag_key, p_business_id,
    jsonb_build_object('enabled', p_enabled)
  );

  return jsonb_build_object('flagKey', p_flag_key, 'businessId', p_business_id, 'enabled', p_enabled);
end;
$fn$;

revoke all on function public.admin_set_feature_flag(text, boolean, text) from public, anon;
revoke all on function public.admin_set_feature_flag_for_business(text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_feature_flag(text, boolean, text) to authenticated;
grant execute on function public.admin_set_feature_flag_for_business(text, uuid, boolean, text) to authenticated;

-- Penjaga: tidak ada satu pun peran yang boleh menulis langsung ke tabel
-- sakelar. Kalau suatu saat ada yang memberi `grant update`, alasan wajib dan
-- catatan tindakan bisa dilewati tanpa ada yang menyadarinya.
do $$
declare
  v_grants int;
begin
  select count(*) into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('feature_flags', 'feature_flag_overrides')
    and privilege_type in ('UPDATE', 'INSERT', 'DELETE')
    and grantee in ('authenticated', 'anon');

  if v_grants > 0 then
    raise exception 'SAKELAR_BISA_DIUBAH_DIAM_DIAM: ada % hak tulis langsung yang melewati alasan dan catatan.', v_grants;
  end if;
end;
$$;

commit;
