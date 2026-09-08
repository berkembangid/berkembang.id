-- ---------------------------------------------------------------------------
-- 0064 — Kondisi awal usaha diisi sekali
-- ---------------------------------------------------------------------------
-- Kondisi awal adalah titik mulai usaha, bukan angka yang dipelihara. Salah
-- ketik uang tunai di laci tidak diperbaiki dengan menulis ulang sejarah; ia
-- diperbaiki dengan mencatat transaksi pemasukan atau pengeluaran, persis
-- seperti selisih kas mana pun yang ditemukan kemudian. Cara itu meninggalkan
-- jejak: kapan selisihnya ketahuan dan berapa besarnya, bukan seolah-olah
-- angka awalnya memang selalu begitu.
--
-- Tiga jalan tulis dicabut, dan alasan ketiganya berbeda:
--
--   * `correct_opening_balances` -- menulis ulang titik mulai. Inilah yang
--     digantikan oleh transaksi koreksi.
--   * `update_loan` -- sisa pinjaman adalah HASIL pembayaran, bukan angka yang
--     diketik. Mengubahnya langsung membuat sisa utang dan riwayat cicilan
--     bercerita hal yang berbeda.
--   * `update_fixed_asset` -- nilai alat mengikuti catatan belanjanya. Alat
--     tetap bisa ditandai sudah dijual lewat `dispose_fixed_asset`, dan alat
--     baru tetap masuk lewat catatan belanja; yang tidak bisa adalah menyunting
--     alat yang sudah tercatat.
--
-- Fungsinya TIDAK dijatuhkan, hanya dicabut haknya. Menjatuhkannya membuat
-- migrasi ini satu arah seperti `0063`, padahal keputusan ini soal kebijakan
-- produk dan bisa berubah; mengembalikan satu baris `grant` jauh lebih murah
-- daripada menyusun ulang fungsi yang sudah dihapus.

begin;

revoke execute on function public.correct_opening_balances(text, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text) from authenticated;
revoke execute on function public.update_fixed_asset(uuid, text, text, integer) from authenticated;
revoke execute on function public.update_loan(uuid, text, bigint, numeric) from authenticated;

-- Penjaga: ketiganya harus benar-benar tertutup bagi pemilik usaha, dan
-- `dispose_fixed_asset` harus tetap terbuka -- alat yang dijual wajib bisa
-- ditandai supaya penyusutannya berhenti.
do $$
declare
  v_terbuka text;
begin
  select string_agg(proc.proname, ', ')
  into v_terbuka
  from pg_proc as proc
  join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
  where namespace_record.nspname = 'public'
    and proc.proname in ('correct_opening_balances', 'update_fixed_asset', 'update_loan')
    and has_function_privilege('authenticated', proc.oid, 'execute');

  if v_terbuka is not null then
    raise exception 'MASIH_TERBUKA: % masih bisa dipanggil pemilik usaha.', v_terbuka;
  end if;

  if not exists (
    select 1 from pg_proc as proc
    join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
    where namespace_record.nspname = 'public'
      and proc.proname = 'dispose_fixed_asset'
      and has_function_privilege('authenticated', proc.oid, 'execute')
  ) then
    raise exception 'TERLALU_JAUH: menandai alat sudah dijual ikut tertutup.';
  end if;
end;
$$;

commit;
