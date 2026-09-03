-- ============================================================================
-- 0040: KATA BENDA ALAT USAHA YANG SELAMA INI LOLOS
--
-- Spek Lemari Dokumen menomorinya `0031`; repo sudah di `0039` ketika migrasi
-- ini ditulis, jadi nomornya menyesuaikan. Isinya sama.
--
-- MASALAH YANG DITUTUP
--
-- "beli meja 800 ribu" mendarat di kategori 6 (biaya usaha), bukan kategori 8
-- (beli alat). Akibatnya meja itu habis dibebankan bulan itu juga: tidak masuk
-- daftar alat, tidak pernah disusutkan, dan tidak pernah muncul di Posisi
-- Keuangan sebagai harta yang dimiliki usaha.
--
-- Sebabnya sederhana. `trigger_keywords` kategori 8 hanya memuat delapan kata:
-- beli kulkas, etalase, mesin, kompor, freezer, gerobak, alat, motor. Meja
-- tidak ada di sana, dan begitu pula sebagian besar perabot warung.
--
-- KENAPA MENAMBAH KATA DI SINI AMAN
--
-- Ambang Rp500.000 dari migrasi `0033` tetap berlaku sesudahnya. Baskom
-- Rp40.000 yang menyebut kata "rak" pun tidak akan menjadi alat usaha — ia
-- jatuh ke biaya bulan berjalan seperti seharusnya. Jadi daftar ini boleh
-- murah hati: yang menyaring nilainya adalah ambang, bukan kosakata.
--
-- Kata kunci ditambahkan untuk KEDUA sektor. Meja dan rak sama-sama alat usaha
-- bagi warung maupun bengkel.
-- ============================================================================

begin;

-- Perabot dan peralatan yang lazim dibeli warung dan usaha jasa. Ditulis
-- sebagai satu daftar supaya penambahan berikutnya cukup menyunting satu baris.
update public.category_templates
set trigger_keywords = (
  select array_agg(distinct keyword order by keyword)
  from unnest(
    trigger_keywords || array[
      'meja', 'kursi', 'rak', 'lemari', 'etalase', 'showcase', 'vitrin',
      'blender', 'mixer', 'oven', 'timbangan', 'kipas', 'dispenser',
      'kulkas', 'freezer', 'chiller', 'penggorengan', 'wajan besar',
      'laptop', 'komputer', 'printer', 'motor', 'gerobak', 'tenda',
      'mesin jahit', 'kompresor', 'bor', 'gerinda'
    ]
  ) as keyword
)
where category_code = 8
  and version = 'coa-emkm-v1'
  and sector in ('PERDAGANGAN_KULINER', 'JASA');

-- Kata benda alat tidak boleh sekaligus memicu kategori lain. "meja" pernah
-- tertangkap kategori 6 justru karena tidak ada di mana pun; kalau kelak ia
-- ditambahkan ke dua kategori, yang menang menjadi urutan baris di tabel --
-- dan itu tebakan, bukan aturan.
do $$
declare
  v_conflict text;
begin
  select string_agg(distinct keyword, ', ') into v_conflict
  from (
    select unnest(trigger_keywords) as keyword, category_code, sector
    from public.category_templates
    where version = 'coa-emkm-v1' and is_active
  ) as spread
  where keyword in ('meja', 'kursi', 'rak', 'lemari', 'kulkas', 'oven', 'blender')
  group by keyword, sector
  having count(distinct category_code) > 1;

  if v_conflict is not null then
    raise exception using errcode = 'P0001',
      message = 'ASSET_KEYWORD_CONFLICT: ' || v_conflict;
  end if;
end;
$$;

commit;
