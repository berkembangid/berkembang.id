-- ---------------------------------------------------------------------------
-- 0073 — Daftar akun demo
-- ---------------------------------------------------------------------------
-- `0069` membuat tabel `demo_accounts` dan `private.is_demo_business()`, dan
-- `0072` memakainya untuk mengeluarkan akun demo dari setiap metrik. Sampai
-- migrasi ini, pengecualian itu adalah kode mati: tidak ada satu pun jalan
-- untuk menandai sebuah usaha sebagai demo, jadi jawabannya selalu "bukan".
--
-- Aturan yang sama dengan seluruh tulis di Ruang Mesin: beralasan, tercatat,
-- satu transaksi. Ditambah satu yang khusus untuk daftar ini --
--
-- MENANDAI SEBUAH USAHA SEBAGAI DEMO MENGELUARKANNYA DARI SELURUH ANGKA. Itu
-- membuatnya berguna untuk pertunjukan, dan berbahaya kalau tersalah pasang:
-- usaha sungguhan yang tertandai demo akan lenyap dari dasbor tanpa jejak yang
-- terlihat, dan tidak ada yang akan mencarinya. Karena itu penandaan menuntut
-- SUPER_ADMIN, bukan OPS.
--
-- Yang BELUM ada di sini: "Reset ke fixture". Reset yang benar harus menghapus
-- lalu menyusun ulang catatan sebuah usaha lewat jalur resmi -- pembalikan,
-- posting ulang, hitung ulang penyusutan -- dan itu pekerjaan tersendiri yang
-- tidak boleh ditempelkan ke migrasi pendaftaran. Menandai dan mereset adalah
-- dua keputusan yang berbeda; yang satu tidak menuntut yang lain ada.

begin;

/**
 * Menandai atau melepas tanda demo pada sebuah usaha.
 *
 * `p_is_demo = false` menghapus barisnya, bukan menyetel kolom -- `0069`
 * sengaja tidak punya kolom `is_demo`, supaya "apakah ini demo" hanya punya
 * satu tempat untuk dijawab.
 */
create or replace function public.admin_set_demo_account(
  p_business_id uuid,
  p_is_demo boolean,
  p_fixture_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_name text;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  -- Bukan OPS: tanda ini mengeluarkan sebuah usaha dari seluruh angka.
  if not private.has_admin_role('SUPER_ADMIN') then
    raise exception using errcode = '42501', message = 'BUTUH_SUPER_ADMIN';
  end if;

  select name into v_name from public.businesses where id = p_business_id;
  if v_name is null then
    raise exception using errcode = '22023', message = 'USAHA_TIDAK_DITEMUKAN';
  end if;

  if p_is_demo then
    if length(btrim(coalesce(p_fixture_key, ''))) < 3 then
      raise exception using errcode = '22023', message = 'FIXTURE_WAJIB';
    end if;
    insert into public.demo_accounts (business_id, fixture_key, created_by)
    values (p_business_id, btrim(p_fixture_key), v_actor)
    on conflict (business_id) do update set fixture_key = excluded.fixture_key;
  else
    delete from public.demo_accounts where business_id = p_business_id;
  end if;

  perform private.write_admin_log(
    'SUPER_ADMIN',
    case when p_is_demo then 'DEMO_ACCOUNT_MARKED' else 'DEMO_ACCOUNT_UNMARKED' end,
    p_reason, 'business', p_business_id::text, p_business_id,
    jsonb_build_object('fixtureKey', p_fixture_key, 'businessName', v_name)
  );

  return jsonb_build_object('businessId', p_business_id, 'isDemo', p_is_demo);
end;
$fn$;

/**
 * Daftar akun demo beserta nama usahanya.
 *
 * Fungsi tersendiri, bukan `select` biasa dari klien, karena layarnya butuh
 * nama usaha DAN barisnya demo sekaligus -- dan menggabungkannya di klien
 * berarti dua permintaan yang bisa berselisih di antaranya.
 *
 * Tidak ada satu pun angka rupiah di sini, sama seperti seluruh rute admin.
 */
create or replace function public.admin_demo_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_rows jsonb;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  select coalesce(jsonb_agg(row_to_json(demo_row) order by demo_row.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      demo.business_id,
      demo.fixture_key,
      demo.created_at,
      business.name as business_name,
      business.sector,
      business.status
    from public.demo_accounts as demo
    join public.businesses as business on business.id = demo.business_id
  ) as demo_row;

  return v_rows;
end;
$fn$;

revoke all on function public.admin_set_demo_account(uuid, boolean, text, text) from public, anon;
revoke all on function public.admin_demo_accounts() from public, anon;
grant execute on function public.admin_set_demo_account(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_demo_accounts() to authenticated;

commit;
