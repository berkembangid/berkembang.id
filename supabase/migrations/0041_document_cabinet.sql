-- ============================================================================
-- 0041: LEMARI LIMA RAK
--
-- Spek Lemari Dokumen menomorinya `0031`; repo sudah di `0040` ketika migrasi
-- ini ditulis. Isinya sama.
--
-- Dokumen selama ini satu tumpukan: `documents.doc_type` menyebut jenisnya,
-- tetapi tidak ada yang membedakan KTP dari nota gorengan. Padahal keduanya
-- menuntut kebijakan yang berlawanan -- KTP tidak boleh pernah keluar dalam
-- bentuk apa pun, nota justru harus bisa ditunjuk dari jurnal dan bertahan
-- selamanya. Satu kebijakan seragam pasti salah di salah satu ujungnya.
--
-- LIMA KEPUTUSAN YANG PERLU DICATAT
--
--   a. `doc_class` menyimpan raknya; `doc_type` yang sudah ada tetap menyimpan
--      jenisnya. Nilai baru mengikuti konvensi huruf kecil yang sudah dipakai
--      dua belas jenis lama ('ktp', 'nib', ...), bukan HURUF BESAR seperti di
--      spek. Mencampur dua konvensi dalam satu kolom akan menghasilkan
--      perbandingan yang diam-diam meleset seumur hidup tabel ini.
--
--   b. `document_attachments` adalah SATU-SATUNYA cara dokumen menunjuk data
--      akuntansi. Tidak ada kolom dokumen di `transactions`, `fixed_assets`,
--      atau `loans`. Satu dokumen boleh menunjuk banyak sasaran: nota kulkas
--      menempel ke transaksinya sekaligus ke alatnya.
--
--   c. Attachment TIDAK BISA DIPERBARUI, hanya ditandai lepas beserta
--      alasannya. Jurnal immutable menuntut bukti yang immutable pula;
--      membalikkan transaksi tidak boleh menghapus notanya, karena nota itu
--      tetap bukti bahwa uangnya pernah keluar.
--
--   d. Isolasi memakai `private.accounting_business_access`, bukan
--      `private.business_role`. Yang kedua pernah mengembalikan 'owner' tanpa
--      syarat (diperbaiki `0030`), dan tabel-tabel di sini menunjuk langsung
--      ke jurnal.
--
--   e. `report_issues` diisi generator laporan, bukan pengguna. Karena itu
--      tabelnya select-only bagi pemilik: ia membaca riwayat apa yang pernah
--      diterbitkan, tidak pernah mengarangnya.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Rak, metadata izin, dan tingkat keyakinan
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists doc_class text,
  add column if not exists doc_number text,
  add column if not exists issuer text,
  add column if not exists issued_on date,
  add column if not exists valid_until date,
  add column if not exists name_on_doc text,
  add column if not exists assurance_level text not null default 'self_declared',
  add column if not exists attested_by uuid references auth.users(id) on delete set null,
  add column if not exists attested_at timestamptz,
  add column if not exists needs_class_review boolean not null default false,
  add column if not exists content_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_doc_class_check') then
    alter table public.documents add constraint documents_doc_class_check
      check (doc_class is null or doc_class in (
        'identitas', 'legalitas', 'bukti_transaksi', 'aset_kontrak', 'arsip_keluaran'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_assurance_check') then
    alter table public.documents add constraint documents_assurance_check
      check (assurance_level in ('self_declared', 'checked', 'confirmed', 'attested'));
  end if;
  -- Tingkat 'attested' menuntut jejak siapa dan kapan. Tanpa itu, kata
  -- "diperiksa pendamping" tidak berarti apa-apa.
  if not exists (select 1 from pg_constraint where conname = 'documents_attested_trace_check') then
    alter table public.documents add constraint documents_attested_trace_check
      check (assurance_level <> 'attested' or (attested_by is not null and attested_at is not null));
  end if;
end;
$$;

create index if not exists documents_class_idx on public.documents(business_id, doc_class);
create index if not exists documents_valid_until_idx on public.documents(valid_until)
  where valid_until is not null;

-- ---------------------------------------------------------------------------
-- Backfill rak dokumen lama
-- ---------------------------------------------------------------------------
-- Yang tidak terpetakan dengan yakin TIDAK ditebak. Ia masuk rak legalitas
-- dengan penanda `needs_class_review`, dan pemilik memilahnya sendiri satu
-- ketuk per dokumen. Menebak rak berarti menebak kebijakan berbaginya -- dan
-- salah tebak di sini berarti KTP ikut terkirim ke institusi.

-- Pemetaannya sebuah fungsi, bukan sekali jalan. Backfill hanya mengurus
-- dokumen yang sudah ada; unggahan berikutnya lewat `create_private_document`,
-- penyeret berkas admin, dan seeder juga harus mendarat di rak. Kalau setiap
-- jalur tulis harus ingat mengisinya sendiri, satu yang lupa menghasilkan
-- dokumen tanpa rak -- dan layar lemari terpaksa menebak raknya.

create or replace function private.document_shelf_for_type(p_doc_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_doc_type in ('ktp', 'npwp') then 'identitas'
    when p_doc_type in ('nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian') then 'legalitas'
    when p_doc_type in ('nota', 'struk', 'invoice', 'kuitansi') then 'bukti_transaksi'
    when p_doc_type in ('kontrak', 'sewa', 'faktur_alat') then 'aset_kontrak'
    when p_doc_type in ('laporan', 'ringkasan') then 'arsip_keluaran'
    else 'legalitas'
  end;
$$;

create or replace function private.document_shelf_is_certain(p_doc_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_doc_type in (
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'nota', 'struk', 'invoice', 'kuitansi', 'kontrak', 'sewa', 'faktur_alat',
    'laporan', 'ringkasan'
  );
$$;

update public.documents set
  doc_class = private.document_shelf_for_type(doc_type),
  needs_class_review = not private.document_shelf_is_certain(doc_type)
where doc_class is null;

-- Rak terisi sendiri saat dokumen masuk, apa pun jalur tulisnya.
create or replace function private.document_shelf_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.doc_class is null then
    new.doc_class := private.document_shelf_for_type(new.doc_type);
    new.needs_class_review := not private.document_shelf_is_certain(new.doc_type);
  end if;
  return new;
end;
$$;

drop trigger if exists documents_shelf_default on public.documents;
create trigger documents_shelf_default
  before insert on public.documents
  for each row execute function private.document_shelf_default();

do $$
declare
  v_without_class integer;
begin
  select count(*) into v_without_class from public.documents where doc_class is null;
  if v_without_class > 0 then
    raise exception using errcode = 'P0001',
      message = 'DOCUMENT_BACKFILL_INCOMPLETE: ' || v_without_class || ' dokumen tanpa rak';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bukti yang menempel
-- ---------------------------------------------------------------------------

create table if not exists public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Lepas, bukan hapus. Bukti yang pernah menempel adalah bagian dari riwayat.
  removed_at timestamptz,
  removed_reason text,
  constraint document_attachments_target_check check (target_type in (
    'transaction', 'journal_entry', 'fixed_asset', 'loan', 'inventory_count'
  )),
  constraint document_attachments_removal_check check (
    (removed_at is null and removed_reason is null)
    or (removed_at is not null and char_length(trim(removed_reason)) between 3 and 240)
  ),
  constraint document_attachments_unique unique (document_id, target_type, target_id)
);

create index if not exists document_attachments_target_idx
  on public.document_attachments(business_id, target_type, target_id)
  where removed_at is null;
create index if not exists document_attachments_document_idx
  on public.document_attachments(document_id);

alter table public.document_attachments enable row level security;

-- ---------------------------------------------------------------------------
-- Kelengkapan per sektor
-- ---------------------------------------------------------------------------

create table if not exists public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  doc_type text not null,
  requirement text not null,
  order_index smallint not null default 0,
  mission_key text,
  note text,
  created_at timestamptz not null default now(),
  constraint document_requirements_level_check check (requirement in ('wajib', 'disarankan')),
  constraint document_requirements_unique unique (sector, doc_type)
);

alter table public.document_requirements enable row level security;

-- Sektor pangan olahan, spek Bagian 6. Bahasanya tangga, bukan rapor.
insert into public.document_requirements (sector, doc_type, requirement, order_index, mission_key, note) values
  ('PERDAGANGAN_KULINER', 'ktp',   'wajib',      1, 'dokumen-ktp',   'Fondasi identitas pemilik usaha.'),
  ('PERDAGANGAN_KULINER', 'nib',   'wajib',      2, 'dokumen-nib',   'Bisa diurus sendiri di OSS, gratis, sekitar 30 menit.'),
  ('PERDAGANGAN_KULINER', 'pirt',  'wajib',      3, 'dokumen-pirt',  'Syarat edar pangan olahan rumah produksi.'),
  ('PERDAGANGAN_KULINER', 'halal', 'wajib',      4, 'dokumen-halal', 'Wajib bagi usaha mikro dan kecil mulai 17 Oktober 2026 (PP 42/2024).'),
  ('PERDAGANGAN_KULINER', 'npwp',  'disarankan', 5, 'dokumen-npwp',  'Diperlukan saat penjualan setahun mendekati Rp500 juta.'),
  ('PERDAGANGAN_KULINER', 'izin_edar', 'disarankan', 6, 'dokumen-bpom', 'Saat produk masuk ritel modern.'),
  ('PERDAGANGAN_KULINER', 'akta_pendirian', 'disarankan', 7, 'dokumen-merek', 'Perlindungan nama usaha untuk jangka panjang.'),
  ('JASA', 'ktp', 'wajib', 1, 'dokumen-ktp', 'Fondasi identitas pemilik usaha.'),
  ('JASA', 'nib', 'wajib', 2, 'dokumen-nib', 'Bisa diurus sendiri di OSS, gratis, sekitar 30 menit.'),
  ('JASA', 'npwp', 'disarankan', 3, 'dokumen-npwp', 'Diperlukan saat penjualan setahun mendekati Rp500 juta.')
on conflict (sector, doc_type) do update set
  requirement = excluded.requirement,
  order_index = excluded.order_index,
  mission_key = excluded.mission_key,
  note = excluded.note;

-- ---------------------------------------------------------------------------
-- Pengingat masa berlaku (skema saja; mesinnya Tahap D-B)
-- ---------------------------------------------------------------------------

create table if not exists public.document_reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  remind_on date not null,
  kind text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_reminders_kind_check check (kind in ('h90', 'h30', 'h7', 'expired', 'halal_deadline')),
  constraint document_reminders_status_check check (status in ('pending', 'sent', 'dismissed', 'done')),
  constraint document_reminders_unique unique (document_id, kind)
);

create index if not exists document_reminders_due_idx
  on public.document_reminders(business_id, remind_on)
  where status = 'pending';

alter table public.document_reminders enable row level security;

-- ---------------------------------------------------------------------------
-- Rak E: arsip keluaran
-- ---------------------------------------------------------------------------
-- Jejak "apa yang pernah dilihat bank". Murah dibangun sekarang, mustahil
-- direkonstruksi nanti: begitu sebuah PDF terkirim keluar, tidak ada cara
-- mengetahui angka apa yang ada di dalamnya kecuali berkasnya disimpan.

create table if not exists public.report_issues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  report_kind text not null,
  period_from date,
  period_to date,
  document_uid text not null unique,
  audience text not null default 'self',
  institution_id uuid references public.institutions(id) on delete set null,
  formula_version text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint report_issues_kind_check check (report_kind in ('pdf_sak_emkm', 'snapshot_dossier')),
  constraint report_issues_audience_check check (audience in ('self', 'institution')),
  constraint report_issues_institution_check check (
    audience <> 'institution' or institution_id is not null
  )
);

create index if not exists report_issues_business_idx
  on public.report_issues(business_id, created_at desc);

alter table public.report_issues enable row level security;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Semua tabel select-only bagi pemilik. Penulisan lewat RPC `security definer`,
-- pola yang sama dengan seluruh tabel akuntansi.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'document_attachments' and policyname = 'document_attachments_select') then
    create policy document_attachments_select on public.document_attachments
      for select to authenticated using (private.accounting_business_access(business_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'document_reminders' and policyname = 'document_reminders_select') then
    create policy document_reminders_select on public.document_reminders
      for select to authenticated using (private.accounting_business_access(business_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'report_issues' and policyname = 'report_issues_select') then
    create policy report_issues_select on public.report_issues
      for select to authenticated using (private.accounting_business_access(business_id));
  end if;
  -- Tabel referensi: sama untuk semua usaha, tidak memuat data siapa pun.
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'document_requirements' and policyname = 'document_requirements_select') then
    create policy document_requirements_select on public.document_requirements
      for select to authenticated using (true);
  end if;
end;
$$;

revoke insert, update, delete on public.document_attachments from authenticated;
revoke insert, update, delete on public.document_reminders from authenticated;
revoke insert, update, delete on public.report_issues from authenticated;
revoke insert, update, delete on public.document_requirements from authenticated;
grant select on public.document_attachments to authenticated;
grant select on public.document_reminders to authenticated;
grant select on public.report_issues to authenticated;
grant select on public.document_requirements to authenticated;

-- Bukti yang sudah menempel tidak pernah disunting. Yang boleh berubah hanya
-- penanda lepas beserta alasannya -- dan itu pun lewat RPC, bukan UPDATE
-- langsung. Trigger ini menjaga jalur tulis yang ditambahkan kemudian pun
-- tidak bisa melanggarnya tanpa sengaja.
create or replace function private.document_attachment_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_IS_IMMUTABLE';
  end if;
  if new.document_id is distinct from old.document_id
    or new.target_type is distinct from old.target_type
    or new.target_id is distinct from old.target_id
    or new.business_id is distinct from old.business_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_IS_IMMUTABLE';
  end if;
  if old.removed_at is not null then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_ALREADY_REMOVED';
  end if;
  return new;
end;
$$;

drop trigger if exists document_attachments_immutable on public.document_attachments;
create trigger document_attachments_immutable
  before update or delete on public.document_attachments
  for each row execute function private.document_attachment_is_immutable();

commit;
