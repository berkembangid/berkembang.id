-- ---------------------------------------------------------------------------
-- 0086 — Penyusutan tanpa nilai residu, sesuai SAK EMKM 11.14
-- ---------------------------------------------------------------------------
-- SAK EMKM paragraf 11.14, apa adanya:
--
--   "Penyusutan aset tetap dapat dilakukan dengan menggunakan metode garis
--    lurus atau metode saldo menurun DAN TANPA MEMPERHITUNGKAN NILAI RESIDU
--    (nilai sisa)."
--
-- Itu bukan anjuran. Entitas yang memakai SAK EMKM menyusutkan seluruh harga
-- perolehan, dan nilai sisa tidak masuk hitungan sama sekali. Kesederhanaan itu
-- memang inti SAK EMKM: ia dibuat supaya usaha mikro tidak perlu menaksir
-- harga jual sebuah kulkas delapan tahun ke depan.
--
-- `0067` MEMPERBAIKI ARITMETIKANYA DAN MELANGGAR STANDARNYA.
--
-- `0067` berangkat dari pengamatan yang benar: mesin penyusutan mengurangi
-- nilai sisa, tetapi tidak ada yang pernah menanyakannya, jadi setiap alat
-- disusutkan sampai habis. Kesimpulannya keliru. Yang seharusnya dibuang
-- bukan pertanyaannya yang hilang, melainkan pengurangannya -- karena untuk
-- SAK EMKM, "disusutkan sampai habis" justru jawaban yang benar.
--
-- Akibat `0067` bagi laporan: beban penyusutan tiap bulan terlalu KECIL, untung
-- bulanan terlihat lebih besar daripada yang seharusnya, dan nilai alat di
-- Posisi Keuangan berhenti di atas nol pada angka yang ditaksir sendiri
-- pemiliknya. Laporan seperti itu tidak bisa disebut disusun menurut SAK EMKM,
-- dan justru keterbacaan oleh pihak luar itulah satu-satunya alasan produk ini
-- menyusun laporan.
--
-- Dan bagi pemiliknya, pertanyaan itu yang paling sulit di seluruh kondisi
-- awal: "kalau nanti dijual, kira-kira laku berapa?" menuntut taksiran
-- bertahun ke depan, untuk angka yang ternyata tidak boleh dipakai.
--
-- YANG DIKERJAKAN DI SINI.
--
--   1. Hitungannya berhenti mengurangi nilai sisa.
--   2. Nilai sisa yang sudah tersimpan dinolkan.
--   3. Penyusutan yang sudah diposting atas dasar lama dibalik, supaya laporan
--      bulan-bulan lalu ikut benar -- bukan hanya bulan depan.
--   4. Pemicu yang membuat KOLOMNYA tetap nol, siapa pun penulisnya.
--
-- Batas pemicunya, supaya tidak dianggap lebih kuat daripada kenyataannya:
-- ia menjamin `salvage_value_idr` nol, jadi penyusutan bulanan pasti
-- mengabaikan nilai residu. Tetapi nilai buku AWAL sebuah alat yang dibeli
-- sebelum pembukuan mulai dihitung di dalam `rebuild_opening_balance` dari
-- payload `p_assets`, sebelum barisnya disimpan -- jadi pemanggil lama yang
-- masih mengirim `salvageValueIdr` akan mendapat nilai buku awal yang
-- memperhitungkannya. Satu-satunya penulis payload itu adalah wizard kondisi
-- awal, dan bidangnya sudah dibuang dari sana. Menutupnya sepenuhnya menuntut
-- penulisan ulang fungsi 243 baris, dan itu pekerjaan tersendiri.
--
-- KENAPA KOLOMNYA TIDAK DIHAPUS.
--
-- `salvage_value_idr` dibiarkan ada dan dipaksa nol, bukan di-drop. Dua
-- alasan. Pertama, ia ada di skema dasar dan dibaca beberapa fungsi besar;
-- menghapusnya menuntut penulisan ulang fungsi 243 baris yang tidak ada
-- kaitannya dengan perubahan ini. Kedua, kalau suatu hari produk ini melayani
-- entitas yang memakai SAK ETAP -- yang MEMANG memperhitungkan nilai residu --
-- yang diperlukan hanya mencabut pemicunya, bukan memindahkan kolom kembali.
--
-- Pemicunya MENORMALKAN, bukan menolak. Nilai bukan nol yang dikirim pemanggil
-- lama tidak menggagalkan penyimpanan kondisi awal seseorang; ia diabaikan,
-- yang persis perlakuan yang dituntut standarnya.

begin;

-- ---------------------------------------------------------------------------
-- 1. Hitungannya
-- ---------------------------------------------------------------------------
-- Sama persis dengan versi sebelumnya kecuali satu baris: `v_depreciable`.
-- Ditulis utuh, bukan ditambal dengan penggantian teks atas `prosrc`:
-- migrasi yang mengubah dirinya sendiri berdasarkan isi basis data akan diam
-- saja ketika isinya tidak seperti yang diduga.

create or replace function private.post_monthly_depreciation(p_business_id uuid, p_period_month date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_start date;
  v_asset record;
  v_depreciable bigint;
  v_posted bigint;
  v_monthly bigint;
  v_amount bigint;
  v_total bigint := 0;
  v_entry_id uuid;
begin
  select date_trunc('month', start_date)::date into v_start
  from public.opening_balances where business_id = p_business_id;
  if v_start is not null and v_month < v_start then
    return null;
  end if;

  for v_asset in
    select * from public.fixed_assets
    where business_id = p_business_id
      and date_trunc('month', acquired_on)::date < v_month
      and (disposed_on is null or disposed_on >= v_month)
    order by acquired_on, created_at
  loop
    if exists (
      select 1 from public.depreciation_postings
      where asset_id = v_asset.id and period_month = v_month
    ) then
      continue;
    end if;

    -- SAK EMKM 11.14: tanpa memperhitungkan nilai residu. Seluruh harga
    -- perolehan yang disusutkan, bukan harga perolehan dikurangi taksiran
    -- harga jual nanti.
    v_depreciable := v_asset.cost_idr;

    select coalesce(sum(amount_idr), 0) into v_posted
    from public.depreciation_postings where asset_id = v_asset.id;
    if v_posted >= v_depreciable then
      continue;
    end if;

    v_monthly := greatest(v_depreciable / v_asset.useful_life_months, 1);
    v_amount := least(v_monthly, v_depreciable - v_posted);
    if v_amount <= 0 then
      continue;
    end if;

    if v_entry_id is null then
      insert into public.journal_entries (
        business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
      ) values (
        p_business_id, v_month_end, 'DEPRECIATION',
        'Penyusutan alat usaha ' || to_char(v_month, 'MM-YYYY'),
        'coa-emkm-v1', null, 'NON_KAS'
      ) returning id into v_entry_id;
    end if;

    insert into public.depreciation_postings (asset_id, business_id, period_month, amount_idr, journal_entry_id)
    values (v_asset.id, p_business_id, v_month, v_amount, v_entry_id);
    v_total := v_total + v_amount;
  end loop;

  if v_entry_id is null then
    return null;
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, p_business_id, '5280', v_total, 0, 1),
         (v_entry_id, p_business_id, '1690', 0, v_total, 2);

  return v_entry_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Pemicu yang menjaga kolomnya nol
-- ---------------------------------------------------------------------------

create or replace function private.fixed_assets_drop_salvage()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  -- Menormalkan, bukan menolak. Lihat catatan di kepala berkas: pemanggil lama
  -- yang masih mengirim nilai sisa tidak boleh kehilangan seluruh kondisi
  -- awalnya karena satu bidang yang sudah tidak berlaku.
  new.salvage_value_idr := 0;
  return new;
end;
$fn$;

drop trigger if exists fixed_assets_drop_salvage on public.fixed_assets;
create trigger fixed_assets_drop_salvage
before insert or update on public.fixed_assets
for each row execute function private.fixed_assets_drop_salvage();

comment on column public.fixed_assets.salvage_value_idr is
  'Selalu 0. SAK EMKM 11.14 menyusutkan tanpa memperhitungkan nilai residu; kolomnya dipertahankan untuk SAK ETAP, dan dijaga nol oleh pemicu fixed_assets_drop_salvage.';

-- ---------------------------------------------------------------------------
-- 3. Data yang sudah ada, dan penyusutan yang sudah diposting
-- ---------------------------------------------------------------------------
-- Memperbaiki hitungannya tanpa membalik yang sudah diposting hanya membenarkan
-- bulan-bulan berikutnya, dan meninggalkan laporan bulan lalu dengan beban yang
-- terlalu kecil. Pemilik yang membandingkan dua bulan akan melihat lompatan
-- yang tidak pernah terjadi di usahanya.

do $$
declare
  v_row record;
  v_assets integer := 0;
  v_businesses integer := 0;
begin
  create temporary table terdampak_0086 on commit drop as
  select
    asset.business_id,
    min(date_trunc('month', asset.acquired_on)::date) as bulan_awal,
    count(*) as jumlah_aset
  from public.fixed_assets as asset
  where asset.salvage_value_idr <> 0
  group by asset.business_id;

  select coalesce(sum(jumlah_aset), 0), count(*) into v_assets, v_businesses from terdampak_0086;

  -- Pemicu di atas ikut berlaku pada UPDATE ini, jadi nilainya pasti nol
  -- sesudahnya tanpa bergantung pada ekspresi di sini.
  update public.fixed_assets set salvage_value_idr = 0, updated_at = now()
  where salvage_value_idr <> 0;

  for v_row in select * from terdampak_0086 loop
    -- Dibalik dari bulan perolehan paling awal usaha itu: penyusutan bulan
    -- mana pun sesudahnya dihitung dengan dasar yang baru oleh
    -- `ensure_depreciation_posted`, yang dipanggil sebelum setiap pembacaan
    -- laporan.
    perform private.reset_depreciation_from(
      v_row.business_id,
      v_row.bulan_awal,
      'SAK EMKM 11.14: penyusutan dihitung tanpa nilai residu'
    );
  end loop;

  raise notice '0086: % aset pada % usaha dinolkan dan penyusutannya dihitung ulang.', v_assets, v_businesses;
end;
$$;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_src text;
begin
  select proc.prosrc into v_src from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'private' and proc.proname = 'post_monthly_depreciation';

  -- Inti `0086`. Kalau hitungannya menyebut nilai sisa lagi, laporan berhenti
  -- disusun menurut SAK EMKM -- dan itu tidak terlihat dari mana pun kecuali
  -- dari angka bebannya.
  if v_src ilike '%salvage%' then
    raise exception 'NILAI_RESIDU_KEMBALI: hitungan penyusutan menyebut nilai sisa; SAK EMKM 11.14 menyusutkan tanpa itu.';
  end if;
  if v_src not ilike '%v_depreciable := v_asset.cost_idr;%' then
    raise exception 'DASAR_PENYUSUTAN_SALAH: yang disusutkan harus seluruh harga perolehan.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'fixed_assets_drop_salvage' and not tgisinternal
  ) then
    raise exception 'TANPA_PEMICU: kolom nilai sisa tidak dijaga nol, jadi penulis mana pun bisa menghidupkannya kembali.';
  end if;

  if exists (select 1 from public.fixed_assets where salvage_value_idr <> 0) then
    raise exception 'MASIH_ADA_NILAI_RESIDU: ada aset yang nilai sisanya bukan nol sesudah migrasi ini.';
  end if;
end;
$$;

commit;
