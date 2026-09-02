-- ---------------------------------------------------------------------------
-- 0044 — Rak E: arsip laporan yang pernah diterbitkan
-- ---------------------------------------------------------------------------
-- Jejak "apa yang pernah dilihat bank". `0041` sudah menyiapkan tabelnya;
-- berkas ini menambahkan jalur tulisnya dan jenis dokumennya.
--
-- KENAPA BERKASNYA DISIMPAN, BUKAN DIBUAT ULANG.
--
-- Menyimpan PDF terasa boros: angkanya toh bisa dihitung ulang kapan saja dari
-- jurnal yang sama. Tetapi laporan yang dibuat ulang bulan depan TIDAK akan
-- sama dengan yang dikirim bulan ini -- transaksi baru masuk, penyusutan
-- bertambah, hitungan stok mengoreksi periode sebelumnya. Begitu sebuah berkas
-- terkirim ke koperasi, satu-satunya cara mengetahui angka apa yang ada di
-- dalamnya adalah menyimpan berkasnya. Murah dilakukan sekarang, mustahil
-- direkonstruksi nanti.
--
-- Karena itu unduh ulang menyajikan bita yang sama persis, bukan hasil render
-- baru.

begin;

-- ---------------------------------------------------------------------------
-- Jenis dokumen keluaran
-- ---------------------------------------------------------------------------
-- `0043` sempat memetakan 'laporan' dan 'ringkasan' ke rak arsip padahal
-- keduanya bukan jenis dokumen yang berlaku. Nama yang dipakai sekarang sama
-- dengan `report_issues.report_kind`, supaya baris arsip dan dokumennya tidak
-- pernah menyebut hal yang sama dengan dua nama.

create or replace function private.known_document_types()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array[
    -- Identitas dan legalitas
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    -- Bukti transaksi
    'nota', 'kuitansi', 'bukti_transfer', 'rekening_koran', 'qris', 'utilitas',
    -- Alat dan perjanjian
    'sewa', 'perjanjian_pinjaman',
    -- Arsip keluaran (rak E)
    'pdf_sak_emkm', 'snapshot_dossier',
    -- Pendukung lain
    'foto_tempat_usaha', 'laporan_keuangan'
  ]::text[];
$fn$;

create or replace function private.document_shelf_for_type(p_doc_type text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_doc_type in ('ktp', 'npwp') then 'identitas'
    when p_doc_type in (
      'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
      'bpom', 'haki', 'sertifikat', 'training'
    ) then 'legalitas'
    when p_doc_type in (
      'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran'
    ) then 'bukti_transaksi'
    when p_doc_type in (
      'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman'
    ) then 'aset_kontrak'
    when p_doc_type in ('pdf_sak_emkm', 'snapshot_dossier') then 'arsip_keluaran'
    else 'legalitas'
  end;
$fn$;

create or replace function private.document_shelf_is_certain(p_doc_type text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_doc_type in (
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran',
    'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman',
    'pdf_sak_emkm', 'snapshot_dossier'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Mencatat satu penerbitan
-- ---------------------------------------------------------------------------
-- Baris dokumen dan baris arsip dibuat bersama dalam satu transaksi. Kalau
-- salah satunya bisa gagal sendiri, arsipnya menunjuk berkas yang tidak ada
-- atau berkasnya tidak pernah muncul di lemari.
--
-- Bita berkasnya sudah diunggah SEBELUM fungsi ini dipanggil. Urutan itu
-- disengaja: kegagalan mencatat hanya meninggalkan objek yatim yang tidak
-- terlihat siapa pun, sedangkan urutan sebaliknya meninggalkan baris arsip
-- yang menjanjikan berkas yang tidak pernah ada.

create or replace function public.record_report_issue(
  p_document_id uuid,
  p_document_uid text,
  p_report_kind text,
  p_storage_path text,
  p_file_size bigint,
  p_checksum_sha256 text,
  p_name text,
  p_period_from date default null,
  p_period_to date default null,
  p_audience text default 'self',
  p_institution_id uuid default null,
  p_formula_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_issue_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_document_id is null
    or p_report_kind not in ('pdf_sak_emkm', 'snapshot_dossier')
    or char_length(trim(coalesce(p_document_uid, ''))) not between 8 and 64
    or char_length(trim(coalesce(p_name, ''))) not between 1 and 240
    or p_file_size is null or p_file_size <= 0
    or lower(coalesce(p_checksum_sha256, '')) !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Jalur simpan harus berada di dalam ruang pemilik sendiri. Tanpa
  -- pemeriksaan ini, satu baris arsip bisa dibuat menunjuk berkas usaha lain.
  if p_storage_path is distinct from (
    v_user_id::text || '/' || v_business_id::text || '/' || p_document_id::text || '/' ||
    p_document_id::text || '.pdf'
  ) then
    raise exception using errcode = '22023', message = 'REPORT_STORAGE_PATH_INVALID';
  end if;

  insert into public.documents (
    id, business_id, user_id, name, doc_type, status,
    storage_path, mime_type, file_size, checksum_sha256
  ) values (
    p_document_id, v_business_id, v_user_id, trim(p_name), p_report_kind, 'verified',
    p_storage_path, 'application/pdf', p_file_size, lower(p_checksum_sha256)
  );

  insert into public.report_issues (
    business_id, document_id, report_kind, period_from, period_to,
    document_uid, audience, institution_id, formula_version, created_by
  ) values (
    v_business_id, p_document_id, p_report_kind, p_period_from, p_period_to,
    trim(p_document_uid), p_audience, p_institution_id, p_formula_version, v_user_id
  ) returning id into v_issue_id;

  return jsonb_build_object(
    'ok', true,
    'issueId', v_issue_id,
    'documentId', p_document_id,
    'documentUid', trim(p_document_uid)
  );
end;
$$;

revoke execute on function public.record_report_issue(
  uuid, text, text, text, bigint, text, text, date, date, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_report_issue(
  uuid, text, text, text, bigint, text, text, date, date, text, uuid, text
) to authenticated;

commit;
