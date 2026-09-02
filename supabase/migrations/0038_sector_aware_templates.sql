-- ============================================================================
-- 0038: SEKTOR DIBACA DARI JAWABAN PEMILIK, DAN SATU SET TEMPLATE UNTUK JASA
--
-- Halaman Profil sudah menanyakan sektor usaha sejak lama — tujuh pilihan:
-- Kuliner, Fashion, Pertanian, Jasa, Kerajinan, Teknologi, Lainnya. Jawabannya
-- tersimpan di `profiles.sektor_usaha`. Lalu
-- `private.emkm_sector_for_business()` mengembalikan 'PERDAGANGAN_KULINER'
-- untuk siapa pun, tanpa pernah melihatnya.
--
-- Akibatnya bukan angka yang salah — akunnya memang sama untuk semua sektor —
-- melainkan pertanyaan yang salah alamat. Penjual jasa diminta memilih
-- "Belanja bahan / barang — beli bahan baku atau stok dagangan" dan
-- "Kemasan & label", dua hal yang tidak ada di usahanya. Aplikasi menanyakan
-- sesuatu lalu mengabaikan jawabannya.
--
-- EMPAT KEPUTUSAN YANG PERLU DICATAT
--
--   a. DUA set template, bukan delapan. Yang berbeda antar sektor hanyalah
--      kata-katanya; akunnya identik. Membuat delapan set berarti delapan kali
--      lipat baris yang harus dijaga agar labelnya tidak melenceng dari akun
--      yang dipetakannya, demi perbedaan yang bagi penjual baju maupun
--      pengrajin sebenarnya tidak ada — keduanya sama-sama menjual barang.
--      Yang benar-benar berbeda hanyalah usaha jasa, yang tidak punya
--      persediaan maupun kemasan.
--
--   b. Sumber kebenarannya `profiles.sektor_usaha`, BUKAN `businesses.sector`.
--      Kolom `businesses.sector` diisi sekali saat usaha dibuat (0026), dan
--      trigger-nya tidak menyala pada perubahan `sektor_usaha` — jadi pemilik
--      yang membetulkan sektornya hari ini tidak akan pernah terlihat berubah
--      di sana. `businesses.sector` tetap dipakai sebagai cadangan.
--
--   c. Sektor yang tidak dikenal jatuh ke set barang, bukan gagal. Sektor
--      adalah isian bebas yang pernah berubah daftarnya; menggagalkan
--      pencatatan karena satu kata yang tidak dikenali akan menghukum pemilik
--      atas keputusan lama kita sendiri. Yang tetap gagal keras adalah
--      kombinasi (sektor, kategori) yang tidak punya template — di situ
--      menebak berarti menebak AKUN, dan itu tidak pernah boleh.
--
--   d. Kategori 5 pada usaha jasa tetap memakai akun 5100. Bahan yang habis
--      terpakai untuk mengerjakan pesanan memang beban pokok; yang berubah
--      hanya namanya, dari "Belanja bahan / barang" menjadi "Bahan & alat
--      habis pakai". Perbedaannya muncul di tempat lain: usaha jasa yang tidak
--      pernah membeli bahan tidak akan pernah ditagih menghitung stok, karena
--      pengingat di 0037 memang bersyarat adanya belanja pada akun itu.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Pemetaan jawaban pemilik ke set template
-- ---------------------------------------------------------------------------

create or replace function private.emkm_sector_from_answer(p_answer text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_answer, '')))
    when 'jasa' then 'JASA'
    when 'teknologi' then 'JASA'
    else 'PERDAGANGAN_KULINER'
  end;
$$;

revoke all on function private.emkm_sector_from_answer(text) from public, anon, authenticated;

create or replace function private.emkm_sector_for_business(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.emkm_sector_from_answer(
    coalesce(
      -- Jawaban terbaru pemilik. `businesses.sector` hanya potret saat usaha
      -- dibuat dan tidak ikut berubah saat profilnya disunting.
      (select nullif(trim(profile.sektor_usaha), '')
         from public.profiles as profile
         join public.businesses as business on business.legacy_profile_id = profile.id
        where business.id = p_business_id),
      (select nullif(trim(business.sector), '')
         from public.businesses as business
        where business.id = p_business_id)
    )
  );
$$;

revoke all on function private.emkm_sector_for_business(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Template sektor jasa
-- ---------------------------------------------------------------------------
-- Aturan akunnya sama persis dengan sektor barang. Yang berbeda hanya label,
-- keterangan, dan kata pemicunya — dan itu memang seluruh tujuannya.

insert into public.category_templates (
  sector, category_code, subtype, label_umkm, description_umkm, direction,
  debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order
) values
  ('JASA',  1, null,   'Pemasukan jasa',       'Uang masuk dari pekerjaan atau jasa yang selesai', 'income',
     'CASH_STAR', '4100', 'OPERASI', true,
     array['masuk','bayaran','ongkos jasa','upah kerja','servis','service','order','job','omzet'], 10),
  ('JASA',  2, null,   'Pemasukan lain',       'Uang masuk di luar pekerjaan utama, misalnya sewa alat atau komisi', 'income',
     'CASH_STAR', '4200', 'OPERASI', true,
     array['sewa alat','komisi','bonus','hadiah','cashback','royalti'], 20),
  ('JASA',  3, null,   'Piutang dibayar',      'Pelanggan melunasi sisa pembayarannya', 'income',
     'CASH_STAR', '1300', 'OPERASI', false,
     array['bayar utang','lunas','pelunasan','nyaur','dibayar','pelunasan termin'], 30),
  ('JASA',  4, '4a',   'Modal masuk',          'Tambahan modal dari pemilik atau keluarga', 'income',
     'CASH_STAR', '3100', 'PENDANAAN', false,
     array['modal','tambah modal','suntik modal','setoran modal'], 40),
  ('JASA',  4, '4b',   'Pinjaman masuk',       'Uang pinjaman yang cair', 'income',
     'CASH_STAR', 'LIABILITY_STAR', 'PENDANAAN', false,
     array['pinjaman','pinjam','kredit cair','cair','koperasi','utang bank'], 50),
  ('JASA',  5, null,   'Bahan & alat habis pakai','Bahan yang habis terpakai untuk mengerjakan pesanan', 'expense',
     '5100', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['bahan','sparepart','onderdil','benang','kain','cat','oli','material','habis pakai'], 60),
  ('JASA',  6, '5210', 'Bahan bakar & energi', 'Bensin, solar, atau gas untuk menjalankan usaha', 'expense',
     '5210', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['bensin','solar','gas','elpiji','bbm','isi bensin'], 71),
  ('JASA',  6, '5220', 'Listrik, air, internet','Tagihan utilitas usaha', 'expense',
     '5220', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['listrik','token','air','pdam','internet','wifi','pulsa data','server','hosting'], 72),
  ('JASA',  6, '5230', 'Gaji / upah',          'Upah pekerja, tukang, atau tenaga lepas', 'expense',
     '5230', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['gaji','upah','karyawan','tukang','freelance','tenaga lepas','borongan'], 73),
  ('JASA',  6, '5240', 'Sewa tempat',          'Sewa bengkel, studio, salon, atau ruang kerja', 'expense',
     '5240', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['sewa','kontrakan','bengkel','studio','ruko','coworking'], 74),
  ('JASA',  6, '5250', 'Perlengkapan kerja',   'Sarung tangan, masker, alat tulis, dan perlengkapan habis pakai lain', 'expense',
     '5250', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['perlengkapan','sarung tangan','masker','alat tulis','atk','seragam'], 75),
  ('JASA',  6, '5260', 'Transport & perjalanan','Ongkos jalan ke tempat pelanggan, parkir, tol', 'expense',
     '5260', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['transport','ongkos jalan','parkir','tol','ojek','grab','gojek','perjalanan'], 76),
  ('JASA',  6, '5270', 'Promosi & komisi aplikasi','Iklan, endorse, potongan aplikasi tempat Anda menerima order', 'expense',
     '5270', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['promosi','iklan','endorse','komisi aplikasi','potongan aplikasi','ads'], 77),
  ('JASA',  6, '5280', 'Penyusutan alat',      'Nilai alat usaha yang menyusut (dihitung sistem)', 'expense',
     '5280', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['penyusutan','susut'], 78),
  ('JASA',  6, '5290', 'Biaya usaha lainnya',  'Biaya usaha yang tidak masuk kelompok lain', 'expense',
     '5290', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['lain','serba serbi','biaya lain','iuran','retribusi','sampah','keamanan'], 79),
  ('JASA',  7, null,   'Bayar utang / cicilan','Membayar cicilan atau melunasi utang usaha', 'expense',
     'LIABILITY_STAR', 'CASH_STAR', 'PENDANAAN', false,
     array['cicilan','nyicil','angsuran','bayar utang','setor koperasi','bayar pinjaman'], 80),
  ('JASA',  8, null,   'Beli alat / aset',     'Beli peralatan kerja yang dipakai lama', 'expense',
     '1600', 'CASH_OR_PAYABLE', 'INVESTASI', false,
     array['beli alat','mesin','laptop','komputer','motor','kompresor','peralatan','perkakas'], 90),
  ('JASA',  9, null,   'Ambil untuk rumah',    'Uang usaha yang dipakai untuk keperluan pribadi atau rumah', 'expense',
     '3200', 'CASH_STAR', 'PENDANAAN', false,
     array['rumah','anak','sekolah','spp','dapur','pribadi','belanja rumah','arisan','kondangan'], 100),
  ('JASA', 10, null,   'Pekerjaan belum dibayar','Pekerjaan sudah selesai tapi pelanggan belum membayar', 'income',
     '1300', '4100', 'NON_KAS', true,
     array['ngutang','bon','kasbon','belum bayar','utang pelanggan','termin'], 110)
on conflict (sector, category_code, coalesce(subtype, ''), version) do update set
  label_umkm = excluded.label_umkm,
  description_umkm = excluded.description_umkm,
  direction = excluded.direction,
  debit_rule = excluded.debit_rule,
  credit_rule = excluded.credit_rule,
  cash_flow_section = excluded.cash_flow_section,
  affects_pnl = excluded.affects_pnl,
  trigger_keywords = excluded.trigger_keywords,
  sort_order = excluded.sort_order,
  is_active = true;

-- Kedua set wajib menutup sepuluh kategori yang sama. Sektor yang punya lubang
-- akan menggagalkan pencatatan pemiliknya di tengah jalan, dan pesan errornya
-- tidak akan menjelaskan bahwa penyebabnya sektor.
do $$
declare
  v_sector text;
  v_missing integer;
begin
  foreach v_sector in array array['PERDAGANGAN_KULINER', 'JASA'] loop
    select count(*) into v_missing
    from generate_series(1, 10) as needed(category_code)
    where not exists (
      select 1 from public.category_templates as template
      where template.sector = v_sector
        and template.category_code = needed.category_code
        and template.version = 'coa-emkm-v1'
        and template.is_active
    );
    if v_missing > 0 then
      raise exception using errcode = 'P0001',
        message = 'SECTOR_TEMPLATE_INCOMPLETE: ' || v_sector || ' kurang ' || v_missing || ' kategori';
    end if;
  end loop;
end;
$$;

commit;
