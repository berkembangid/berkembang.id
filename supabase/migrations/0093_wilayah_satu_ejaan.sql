-- ---------------------------------------------------------------------------
-- 0093 — Satu wilayah, satu ejaan
-- ---------------------------------------------------------------------------
-- Wilayah bukan sekadar isi dropdown. Nilainya tersimpan apa adanya ke
-- `businesses.location` dan `institutions.location`, lalu dibandingkan sebagai
-- teks yang sama persis oleh ringkasan wilayah dinas:
--
--   lower(btrim(coalesce(business.location, ''))) = viewer_region_value
--
-- Jadi dua ejaan untuk satu kota memecah kohortnya, dan kegagalannya SENYAP.
-- Dinas melihat angka yang lebih kecil daripada kenyataan; usaha yang ejaannya
-- menyimpang tidak pernah terlihat oleh pembinanya; tidak ada satu pun galat
-- yang bisa dibaca siapa pun.
--
-- APA YANG DITEMUKAN DI PRODUKSI.
--
-- Daftar pilihan hidup di dalam `components/CitySelect.tsx`, sementara
-- `scripts/seed-40-umkm.mjs` menulis nama kota sebagai teks inline. Tidak ada
-- yang membandingkan keduanya. Hasilnya: 11 dari 29 nilai wilayah di produksi
-- tidak ada di daftar pilihan.
--
-- Sembilan di antaranya kota dan kabupaten yang memang sungguhan tetapi belum
-- pernah dimasukkan ke daftar -- itu diperbaiki di sisi kode, dengan
-- memindahkan daftarnya ke `config/kota-indonesia.json` dan menambahkannya di
-- sana. Dua sisanya salah, dan itu yang dibetulkan migrasi ini:
--
--   'Depok'         → 'Kota Depok'          satu kota, dua ejaan. Yang menulis
--                                           'Depok' tidak pernah masuk
--                                           ringkasan Dinas Kota Depok, yang
--                                           berwilayah 'Kota Depok'.
--
--   'Kota Sidoarjo' → 'Kabupaten Sidoarjo'  BUKAN wilayah administratif mana
--                                           pun. Sidoarjo adalah kabupaten;
--                                           tidak ada kota otonom bernama
--                                           Sidoarjo. Nilai ini tidak akan
--                                           pernah cocok dengan lembaga mana
--                                           pun, sekarang atau nanti.
--
-- KENAPA SEKARANG, PADAHAL BELUM ADA YANG DIRUGIKAN.
--
-- Belum ada satu lembaga pun yang punya kewenangan wilayah
-- (`region_wide_visibility` = false pada keempatnya), jadi hari ini tidak ada
-- yang melihat angka yang salah. Justru itu alasannya: membetulkan ejaan
-- SEBELUM ada yang membaca angkanya berarti tidak ada satu pun laporan dinas
-- yang pernah terbit dengan jumlah yang kurang.
--
-- CAKUPANNYA SENGAJA SEMPIT.
--
-- Migrasi ini hanya menyentuh dua nilai yang sudah diperiksa satu per satu --
-- dua baris di produksi. Ia TIDAK mencoba menormalkan wilayah secara umum
-- (misalnya membuang awalan "Kota "/"Kabupaten " saat membandingkan), karena
-- 'Kota Bandung' dan 'Kabupaten Bandung' adalah dua wilayah yang berbeda
-- dengan dua dinas yang berbeda: menyamakannya akan menggabungkan dua kohort
-- yang tidak boleh digabung.
--
-- Pencegahan jangka panjangnya ada di sisi kode, bukan di sini:
-- `tests/unit/wilayah-kota.test.ts` menolak setiap nilai wilayah yang ditulis
-- kode ini di luar daftar bersama.

begin;

-- ---------------------------------------------------------------------------
-- Pembetulan
-- ---------------------------------------------------------------------------
-- Ditulis dengan `btrim`/`lower` pada sisi pembanding supaya varian berspasi
-- atau berbeda huruf besar ikut terjaring, dan idempoten: menjalankannya dua
-- kali tidak mengubah apa pun pada kali kedua.

do $$
declare
  v_pasangan text[][] := array[
    array['depok', 'Kota Depok'],
    array['kota sidoarjo', 'Kabupaten Sidoarjo']
  ];
  v_baris text[];
  v_usaha integer;
  v_lembaga integer;
begin
  foreach v_baris slice 1 in array v_pasangan
  loop
    update public.businesses
    set location = v_baris[2]
    where lower(btrim(coalesce(location, ''))) = v_baris[1]
      and location <> v_baris[2];
    get diagnostics v_usaha = row_count;

    update public.institutions
    set location = v_baris[2]
    where lower(btrim(coalesce(location, ''))) = v_baris[1]
      and location <> v_baris[2];
    get diagnostics v_lembaga = row_count;

    raise notice '0093: "%" -> "%": % usaha, % lembaga.',
      v_baris[1], v_baris[2], v_usaha, v_lembaga;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------
-- Menuntut kedua ejaan yang salah benar-benar hilang. Bukan "kira-kira sudah":
-- kalau satu baris tertinggal, satu usaha tetap tidak terlihat pembinanya.

do $$
declare
  v_sisa integer;
begin
  select count(*)
  into v_sisa
  from (
    select location from public.businesses
    union all
    select location from public.institutions
  ) as semua
  where lower(btrim(coalesce(semua.location, ''))) in ('depok', 'kota sidoarjo');

  if v_sisa > 0 then
    raise exception 'WILAYAH_EJAAN_LAMA_MASIH_ADA: % baris masih memakai ejaan yang tidak cocok dengan lembaga mana pun.', v_sisa;
  end if;
end;
$$;

commit;
