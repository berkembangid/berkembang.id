-- ---------------------------------------------------------------------------
-- 0098 — Rekening usaha terpisah dari rekening pribadi (komponen B5)
-- ---------------------------------------------------------------------------
-- Keputusan produk: memisahkan uang usaha dari uang rumah bukan lagi sekadar
-- anjuran di dalam panduan, melainkan satu langkah yang bisa dikerjakan dan
-- terlihat kemajuannya di Perjalanan.
--
-- KENAPA IA KOMPONEN BARU, BUKAN BAGIAN DARI B2.
--
-- B2 menilai apakah pengambilan uang untuk rumah DICATAT. B5 menilai apakah
-- wadahnya memang terpisah. Keduanya sering disangka satu hal, padahal sebuah
-- warung bisa mencatat prive dengan rapi dari satu rekening yang dipakai
-- bersama belanja dapur -- dan bisa pula punya rekening usaha sendiri tanpa
-- pernah mencatat satu pun pengambilan. Menggabungkannya membuat salah satu
-- dari dua kenyataan itu tidak bisa dibedakan dari yang lain.
--
-- TIGA ANAK TANGGA, BUKAN YA/TIDAK.
--
--   0  belum ada apa-apa
--   1  pemilik mencatat rekening usahanya            -> SEBAGIAN
--   2  ada berkas bukti, dan pemilik menyatakan
--      berkas itu memang rekening usahanya           -> TERPENUHI
--
-- Anak tangga tengah itu yang membuat langkah ini tidak terasa seperti tembok.
-- Pemilik yang rekeningnya baru dibuka minggu ini belum punya mutasi untuk
-- diunggah; tanpa tingkat SEBAGIAN ia mengerjakan sesuatu yang benar dan
-- layarnya tetap menjawab "belum".
--
-- KENAPA BUKTINYA TIDAK DISEBUT "TERVERIFIKASI".
--
-- Kita tidak menghubungi bank dan tidak memeriksa keaslian berkas. Yang kita
-- catat adalah derajat pemeriksaan: ada berkasnya, dan pemiliknya menyatakan
-- berkas itu benar miliknya. Itu persis bahasa tingkat keyakinan di lemari
-- dokumen, dan janji yang lebih besar dari itu tidak bisa kita tepati.
--
-- NOMOR REKENING PENUH TIDAK DISIMPAN.
--
-- Empat digit terakhir sudah cukup untuk pemilik mengenali rekeningnya sendiri
-- dan cukup bagi lembaga menilai pemisahannya. Nomor penuhnya tetap ada di
-- dalam berkas rekening koran, di private storage, di balik consent -- tempat
-- yang memang sudah dijaga. Menyalinnya ke kolom biasa berarti menambah PII
-- bernilai tinggi ke tabel yang dibaca banyak jalur, demi kegunaan yang belum
-- ada permintaannya.
--
-- TINGKAT EMAS, BUKAN PERAK.
--
-- Ambang silver sengaja null dan gold diisi -- pola yang sama dengan B4 dan
-- D3. Menjadikannya syarat Perak akan MENURUNKAN setiap usaha yang hari ini
-- sudah Perak, pada pembacaan halaman berikutnya, karena sesuatu yang belum
-- pernah diminta dari mereka. Tangga yang bisa menurunkan orang tanpa mereka
-- berubah adalah tangga yang berhenti dipercaya.

begin;

-- ---------------------------------------------------------------------------
-- 1. Catatan rekening usaha
-- ---------------------------------------------------------------------------
-- Satu baris per usaha. Bukan daftar: yang dinilai adalah "apakah ada wadah
-- terpisah", dan sebuah daftar mengundang pertanyaan yang belum ada jawabannya
-- (mana yang utama? apakah dua rekening lebih baik dari satu?).

create table if not exists public.business_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  bank_name text not null,
  account_holder_name text not null,
  account_last4 text not null,
  evidence_document_id uuid references public.documents(id) on delete set null,
  owner_confirmed_at timestamptz,
  declared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_bank_accounts_shape_check') then
    alter table public.business_bank_accounts add constraint business_bank_accounts_shape_check check (
      char_length(btrim(bank_name)) between 2 and 80
      and char_length(btrim(account_holder_name)) between 2 and 120
      and account_last4 ~ '^[0-9]{4}$'
      -- Pernyataan pemilik tidak bisa berdiri tanpa berkas yang dinyatakannya.
      -- Tanpa batasan ini, satu jalur tulis yang lupa urutannya akan
      -- menghasilkan baris yang mengaku berbukti tanpa bukti.
      and (owner_confirmed_at is null or evidence_document_id is not null)
    );
  end if;
end $$;

create index if not exists business_bank_accounts_evidence_idx
  on public.business_bank_accounts(evidence_document_id)
  where evidence_document_id is not null;

-- ---------------------------------------------------------------------------
-- 2. RLS: baca bagi pemiliknya, tulis hanya lewat fungsi beralasan
-- ---------------------------------------------------------------------------
-- Mengikuti 0092. Tabel ini tidak masuk daftar "boleh ditulis langsung", jadi
-- hak tulisnya dicabut dan setiap perubahan melewati RPC yang menuliskan jejak
-- auditnya sekalian.

alter table public.business_bank_accounts enable row level security;

drop policy if exists business_bank_accounts_select on public.business_bank_accounts;
create policy business_bank_accounts_select on public.business_bank_accounts for select to authenticated
using (private.accounting_business_access(business_id));

revoke all on public.business_bank_accounts from public, anon, authenticated;
grant select on public.business_bank_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Anak tangga — satu-satunya tempat aturannya ditulis
-- ---------------------------------------------------------------------------
-- Dibaca fn_readiness_facts untuk B5, dan dibaca layar Rekening untuk memilih
-- kalimat yang ditampilkan. Kalau masing-masing menghitung sendiri, suatu hari
-- kartunya hijau di Perjalanan dan abu-abu di Profil, dan tidak ada yang bisa
-- menunjukkan mana yang benar.

create or replace function private.business_bank_account_stage(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when account.owner_confirmed_at is not null and exists (
        select 1 from public.documents doc
        where doc.id = account.evidence_document_id
          and doc.business_id = p_business_id
          and doc.status not in ('rejected', 'superseded')
          and doc.storage_path is not null
      ) then 2
      else 1
    end
    from public.business_bank_accounts account
    where account.business_id = p_business_id
  ), 0);
$$;

revoke all on function private.business_bank_account_stage(uuid) from public, anon, authenticated;
grant execute on function private.business_bank_account_stage(uuid) to authenticated;

-- Bentuk yang dibaca aplikasi. Angka anak tangganya ikut dikirim supaya layar
-- tidak menyusunnya ulang dari kolom mentah.
create or replace function private.business_bank_account_json(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', account.id,
    'bankName', account.bank_name,
    'accountHolderName', account.account_holder_name,
    'accountLast4', account.account_last4,
    'evidenceDocumentId', account.evidence_document_id,
    'ownerConfirmedAt', account.owner_confirmed_at,
    'stage', private.business_bank_account_stage(p_business_id),
    'updatedAt', account.updated_at
  )
  from public.business_bank_accounts account
  where account.business_id = p_business_id;
$$;

revoke all on function private.business_bank_account_json(uuid) from public, anon, authenticated;
grant execute on function private.business_bank_account_json(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membaca
-- ---------------------------------------------------------------------------

create or replace function public.get_business_bank_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  -- Tidak memakai get_or_create_user_business: membaca sebuah layar tidak
  -- boleh membuat baris usaha sebagai efek samping. Fungsi ini stable, dan
  -- yang stable memang tidak boleh menulis.
  select business.id into v_business_id
  from public.businesses business
  where business.legacy_profile_id = v_user_id
  limit 1;
  if v_business_id is null then
    select member.business_id into v_business_id
    from public.business_members member
    where member.user_id = v_user_id and member.status = 'active'
    limit 1;
  end if;

  -- Usaha yang belum ada bukan galat: pemilik yang baru mendaftar berhak
  -- membuka layar ini dan melihat keadaan kosongnya, bukan pesan gagal.
  if v_business_id is null then return null; end if;
  return private.business_bank_account_json(v_business_id);
end;
$$;

revoke all on function public.get_business_bank_account() from public, anon, authenticated;
grant execute on function public.get_business_bank_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mencatat rekening
-- ---------------------------------------------------------------------------

create or replace function public.save_business_bank_account(
  p_bank_name text,
  p_account_holder_name text,
  p_account_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_bank text;
  v_holder text;
  v_last4 text;
  v_lama public.business_bank_accounts%rowtype;
  v_ulang boolean := false;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  v_bank := btrim(coalesce(p_bank_name, ''));
  v_holder := btrim(coalesce(p_account_holder_name, ''));
  -- Pemilik mengetik apa saja: "1234", "**** 1234", "xxxx-1234", atau nomor
  -- rekeningnya utuh. Yang diambil angkanya, lalu empat terakhir. Menolak
  -- format bukan pelayanan; menolak karena benar-benar tidak ada empat angka,
  -- itu baru pelayanan.
  v_last4 := regexp_replace(coalesce(p_account_last4, ''), '[^0-9]', '', 'g');
  if char_length(v_last4) > 4 then
    v_last4 := right(v_last4, 4);
  end if;

  if char_length(v_bank) < 2 then
    raise exception using errcode = '22023', message = 'REKENING_BANK_KOSONG';
  end if;
  if char_length(v_holder) < 2 then
    raise exception using errcode = '22023', message = 'REKENING_NAMA_KOSONG';
  end if;
  if v_last4 !~ '^[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'REKENING_DIGIT_KURANG';
  end if;

  select * into v_lama from public.business_bank_accounts where business_id = v_business_id;

  -- Bank atau nomornya berubah berarti berkas lama membuktikan rekening yang
  -- lain. Buktinya dilepas, dan pemilik diminta melampirkan yang baru -- bukan
  -- karena curiga, melainkan karena membiarkannya menempel akan membuat layar
  -- berkata "berbukti" tentang rekening yang tidak pernah dibuktikan.
  v_ulang := v_lama.id is not null
    and (v_lama.bank_name is distinct from v_bank or v_lama.account_last4 is distinct from v_last4);

  insert into public.business_bank_accounts as akun (
    business_id, bank_name, account_holder_name, account_last4, declared_by
  ) values (
    v_business_id, v_bank, v_holder, v_last4, v_user_id
  )
  on conflict (business_id) do update set
    bank_name = excluded.bank_name,
    account_holder_name = excluded.account_holder_name,
    account_last4 = excluded.account_last4,
    evidence_document_id = case when v_ulang then null else akun.evidence_document_id end,
    owner_confirmed_at = case when v_ulang then null else akun.owner_confirmed_at end,
    updated_at = now();

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id,
    'user',
    v_business_id,
    case when v_lama.id is null then 'BUSINESS_BANK_ACCOUNT_DECLARED' else 'BUSINESS_BANK_ACCOUNT_UPDATED' end,
    'business_bank_account',
    v_business_id::text,
    -- Empat digit ikut dicatat, nama pemilik rekening tidak. Yang pertama
    -- membuat jejak ini berguna saat ada sengketa; yang kedua tidak menambah
    -- apa pun selain menyalin nama orang ke satu tabel lagi.
    jsonb_build_object('bankName', v_bank, 'accountLast4', v_last4, 'evidenceReset', v_ulang)
  );

  return private.business_bank_account_json(v_business_id);
end;
$$;

revoke all on function public.save_business_bank_account(text, text, text) from public, anon, authenticated;
grant execute on function public.save_business_bank_account(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Melampirkan bukti, sekaligus menyatakannya benar
-- ---------------------------------------------------------------------------
-- Satu langkah, bukan dua. Memisahkan "lampirkan berkas" dari "tandai sudah
-- saya cek" menghasilkan keadaan antara yang tidak bisa dijelaskan kepada
-- pemilik: berkasnya ada, kartunya masih abu-abu, dan tidak ada yang
-- memberitahu apa lagi yang kurang.

create or replace function public.attach_business_bank_account_evidence(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_doc public.documents%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if not exists (select 1 from public.business_bank_accounts where business_id = v_business_id) then
    raise exception using errcode = '22023', message = 'REKENING_BELUM_DICATAT';
  end if;

  select * into v_doc from public.documents
  where id = p_document_id and business_id = v_business_id;
  if not found then
    raise exception using errcode = '42501', message = 'DOKUMEN_BUKAN_MILIK_USAHA';
  end if;
  if v_doc.storage_path is null or v_doc.status in ('rejected', 'superseded') then
    raise exception using errcode = '22023', message = 'DOKUMEN_TIDAK_BERLAKU';
  end if;
  if v_doc.doc_type <> 'rekening_koran' then
    raise exception using errcode = '22023', message = 'DOKUMEN_BUKAN_REKENING';
  end if;

  update public.business_bank_accounts set
    evidence_document_id = v_doc.id,
    owner_confirmed_at = now(),
    updated_at = now()
  where business_id = v_business_id;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_business_id,
    'BUSINESS_BANK_ACCOUNT_EVIDENCE_CONFIRMED',
    'business_bank_account', v_business_id::text,
    jsonb_build_object('documentId', v_doc.id)
  );

  return private.business_bank_account_json(v_business_id);
end;
$$;

revoke all on function public.attach_business_bank_account_evidence(uuid) from public, anon, authenticated;
grant execute on function public.attach_business_bank_account_evidence(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Menghapus catatannya
-- ---------------------------------------------------------------------------
-- Pemilik yang salah mencatat harus bisa menariknya kembali. Tanpa jalan ini,
-- satu-satunya cara memperbaiki kesalahan adalah menimpanya dengan data yang
-- juga tidak benar.

create or replace function public.forget_business_bank_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_terhapus integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  delete from public.business_bank_accounts where business_id = v_business_id;
  get diagnostics v_terhapus = row_count;

  if v_terhapus > 0 then
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
    ) values (
      v_user_id, 'user', v_business_id,
      'BUSINESS_BANK_ACCOUNT_FORGOTTEN',
      'business_bank_account', v_business_id::text,
      '{}'::jsonb
    );
  end if;

  -- Berkas buktinya TIDAK ikut terhapus. Ia milik lemari dokumen, dan pemilik
  -- yang menghapus catatan rekening belum tentu ingin kehilangan rekening
  -- korannya.
  return jsonb_build_object('deleted', v_terhapus > 0);
end;
$$;

revoke all on function public.forget_business_bank_account() from public, anon, authenticated;
grant execute on function public.forget_business_bank_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fakta kesiapan, dengan B5 di dalamnya
-- ---------------------------------------------------------------------------
-- Ditulis ulang utuh karena PostgreSQL tidak punya cara menambahkan satu kunci
-- ke fungsi yang sudah ada. Tanda tangannya tidak berubah, jadi hak akses dari
-- 0047 tetap berlaku dan tidak ada pemanggil yang perlu menyesuaikan diri.

create or replace function public.fn_readiness_facts(
  p_as_of date default null,
  p_habit_days integer default 30,
  p_quality_days integer default 90,
  p_evidence_days integer default 90,
  p_big_spend_idr bigint default 500000,
  p_full_month_lookback integer default 3,
  p_full_month_min_days integer default 8
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_as_of date;
  v_a1 integer; v_a2 integer; v_a3 integer;
  v_b1_total integer; v_b1_bad integer;
  v_b2 integer; v_b4 integer;
  v_b3_total bigint; v_b3_covered bigint; v_b3_count integer;
  v_c1_required integer; v_c1_confirmed integer;
  v_full_months date[];
  v_c2_filled integer;
  v_d1 boolean; v_d2 integer; v_d3 integer;
  v_b5 integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  v_as_of := coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date);

  -- Bulan penuh: bulan kalender Asia/Jakarta dengan >= 1 transaksi terkonfirmasi
  -- pada >= N hari berbeda. Dihitung sekali sebagai larik, dipakai B2, B4, D2.
  --
  -- Larik, bukan tabel sementara: fungsi ini `stable` supaya perencana boleh
  -- memakainya bebas, dan fungsi non-volatile tidak boleh membuat tabel.
  select coalesce(array_agg(month), array[]::date[]) into v_full_months
  from (
    select date_trunc('month', transaction_date)::date as month
    from public.transactions
    where business_id = v_business_id
      and ledger_status = 'confirmed'
      and transaction_date <= v_as_of
    group by 1
    having count(distinct transaction_date) >= p_full_month_min_days
  ) as months;

  -- A1 hari mencatat
  select count(distinct transaction_date) into v_a1
  from public.transactions
  where business_id = v_business_id and ledger_status = 'confirmed'
    and transaction_date > v_as_of - p_habit_days and transaction_date <= v_as_of;

  -- A2 tutup kas
  select count(*) into v_a2
  from public.daily_closings
  where business_id = v_business_id and status = 'closed'
    and closing_date > v_as_of - p_habit_days and closing_date <= v_as_of;

  -- A3 umur catatan
  select coalesce(v_as_of - min(transaction_date), 0) into v_a3
  from public.transactions
  where business_id = v_business_id and ledger_status = 'confirmed';

  -- B1 catatan yang sudah diperiksa pemilik
  select count(*) into v_b1_total
  from public.transactions
  where business_id = v_business_id
    and transaction_date > v_as_of - p_quality_days and transaction_date <= v_as_of;
  select count(*) into v_b1_bad
  from public.transactions
  where business_id = v_business_id
    and transaction_date > v_as_of - p_quality_days and transaction_date <= v_as_of
    and needs_reclass;
  v_b1_bad := v_b1_bad + coalesce((
    select count(*) from public.transaction_captures
    where business_id = v_business_id
      and status in ('needs_review', 'failed')
      and created_at < (now() - interval '48 hours')
      and created_at >= (v_as_of - p_quality_days)::timestamptz
  ), 0);

  -- B2 pisah uang pribadi: bulan penuh dengan >= 1 entry akun 3200
  select count(*) into v_b2 from (
    select m.month from unnest(v_full_months) as m(month)
    where m.month > (date_trunc('month', v_as_of)::date - (p_full_month_lookback || ' months')::interval)
      and exists (
        select 1 from public.journal_lines line
        join public.journal_entries entry on entry.id = line.entry_id
        where line.business_id = v_business_id and line.account_code = '3200'
          and date_trunc('month', entry.entry_date)::date = m.month
      )
  ) as prive_months;

  -- B3 bukti belanja besar, dihitung dari NILAI rupiah, bukan jumlah transaksi
  select
    coalesce(sum(t.amount_idr), 0),
    coalesce(sum(t.amount_idr) filter (where exists (
      select 1 from public.document_attachments a
      where a.target_type = 'transaction' and a.target_id = t.id and a.removed_at is null
    )), 0),
    count(*)
  into v_b3_total, v_b3_covered, v_b3_count
  from public.transactions t
  where t.business_id = v_business_id
    and t.ledger_status = 'confirmed'
    and coalesce(t.direction, case when t.type = 'keluar' then 'expense' else 'income' end) = 'expense'
    and t.amount_idr >= p_big_spend_idr
    and t.transaction_date > v_as_of - p_evidence_days and t.transaction_date <= v_as_of;

  -- B4 hitung stok
  select count(*) into v_b4 from (
    select m.month from unnest(v_full_months) as m(month)
    where m.month > (date_trunc('month', v_as_of)::date - (p_full_month_lookback || ' months')::interval)
      and exists (
        select 1 from public.inventory_counts c
        where c.business_id = v_business_id and c.period_month = m.month
      )
  ) as stock_months;

  -- B5 rekening usaha terpisah, sebagai angka 0/1/2.
  --
  -- Aturannya TIDAK ditulis di sini. Ia ada di
  -- `private.business_bank_account_stage`, dan layar Rekening membaca angka
  -- yang sama lewat fungsi yang sama. Menyalinnya ke sini berarti dua tempat
  -- memutuskan "apakah rekening ini sudah berbukti", dan keduanya bisa
  -- berselisih tanpa ada yang tahu sampai seorang pemilik melihat kartunya
  -- hijau di satu layar dan abu-abu di layar lain.
  v_b5 := private.business_bank_account_stage(v_business_id);

  -- C1 fondasi izin sektor: dokumen WAJIB sektor yang tingkat keyakinannya
  -- sudah minimal 'confirmed' -- bukti, bukan klaim.
  select count(*) into v_c1_required
  from public.document_requirements r
  where r.sector = private.emkm_sector_for_business(v_business_id) and r.requirement = 'wajib';
  select count(*) into v_c1_confirmed
  from public.document_requirements r
  where r.sector = private.emkm_sector_for_business(v_business_id) and r.requirement = 'wajib'
    and exists (
      select 1 from public.documents d
      where d.business_id = v_business_id and d.doc_type = r.doc_type
        and d.status not in ('rejected', 'superseded')
        and d.storage_path is not null
        and d.assurance_level in ('confirmed', 'attested')
    );

  -- C2 profil inti
  select
    (case when p.tahun_mulai_usaha is not null then 1 else 0 end)
    + (case when coalesce(nullif(trim(p.alamat), ''), null) is not null then 1 else 0 end)
    + (case when coalesce(nullif(trim(p.phone), ''), null) is not null then 1 else 0 end)
    + (case when coalesce(array_length(p.kanal_penjualan, 1), 0) > 0 then 1 else 0 end)
  into v_c2_filled
  from public.profiles p
  where p.auth_user_id = v_user_id;
  v_c2_filled := coalesce(v_c2_filled, 0);

  -- D1 saldo awal
  select exists (select 1 from public.opening_balances where business_id = v_business_id) into v_d1;

  -- D2 rentang data
  v_d2 := coalesce(array_length(v_full_months, 1), 0);

  -- D3 laporan terbit
  select count(*) into v_d3
  from public.report_issues
  where business_id = v_business_id and report_kind = 'pdf_sak_emkm';

  return jsonb_build_object(
    'asOf', v_as_of,
    'a1RecordingDays', v_a1,
    'a2Closings', v_a2,
    'a3AgeDays', v_a3,
    'b1Total', v_b1_total,
    'b1Unchecked', least(v_b1_bad, v_b1_total),
    'b2PriveMonths', v_b2,
    'b3TotalIdr', v_b3_total,
    'b3CoveredIdr', v_b3_covered,
    'b3Count', v_b3_count,
    'b4StockMonths', v_b4,
    'b5BusinessAccount', v_b5,
    'c1Required', v_c1_required,
    'c1Confirmed', v_c1_confirmed,
    'c2Filled', v_c2_filled,
    'c2Total', 4,
    'd1OpeningBalance', v_d1,
    'd2FullMonths', v_d2,
    'd3Reports', v_d3
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. Konfigurasi wp08-pilot-v3
-- ---------------------------------------------------------------------------
-- VERSI BARU, BUKAN SUNTINGAN. Trigger pembeku di 0047 menolak perubahan isi
-- pada versi yang sudah terbit, dan alasannya masih berlaku hari ini: riwayat
-- tingkat yang tersimpan menyebut nama versinya, jadi menggeser isi versi lama
-- akan mengubah arti setiap potret yang pernah ditulis tanpa meninggalkan
-- jejak.
--
-- Isinya sama persis dengan wp08-pilot-v2 kecuali tiga hal:
--
--   1. komponen B5 ditambahkan;
--   2. B5 masuk urutan usaha, tepat setelah D1;
--   3. tidak ada yang lain yang berubah -- ambang Tembaga, Perak, dan Emas
--      untuk dua belas komponen lama tetap angka yang sama, supaya tidak ada
--      seorang pun turun tingkat karena migrasi ini.
--
-- KENAPA B5 DITARUH DI URUTAN KETIGA USAHA.
--
-- Urutan ini menjawab "mana yang paling cepat selesai", dan bagi kebanyakan
-- pemilik rekening usahanya SUDAH ADA -- yang kurang hanya mencatatnya, satu
-- menit. Yang belum punya akan melihat panduan membukanya, dan bagi mereka
-- langkah ini memang berat; tetapi menaruhnya di belakang berarti yang tinggal
-- mencatat tidak pernah disodori pekerjaan satu menit itu.

insert into public.readiness_rule_sets(version, status, rules, weights, thresholds, published_at, effective_at)
values (
  'wp08-pilot-v3',
  'published',
  jsonb_build_object(
    'disclaimer',
      'Tingkat kesiapan menggambarkan kelengkapan dan kebiasaan pencatatan usaha Anda, '
      || 'dihitung otomatis dengan aturan terbuka. Ini bukan penilaian resmi, bukan skor kredit, '
      || 'dan bukan jaminan pembiayaan.',
    'windows', jsonb_build_object(
      'habitDays', 30,
      'qualityDays', 90,
      'evidenceDays', 90,
      'fullMonthLookback', 3,
      'fullMonthMinDays', 8
    ),
    'bigSpendIdr', 500000,
    'levels', jsonb_build_array('MULAI', 'TEMBAGA', 'PERAK', 'EMAS'),
    'effortOrder', jsonb_build_array('C2', 'D1', 'B5', 'C1_NIB', 'A2', 'A1', 'B3', 'C1_HALAL', 'D2'),
    'components', jsonb_build_object(
      'A1', jsonb_build_object('pillar', 'A', 'partial', 8,  'silver', 20, 'gold', 24),
      'A2', jsonb_build_object('pillar', 'A', 'partial', 4,  'silver', 12, 'gold', 20),
      'A3', jsonb_build_object('pillar', 'A', 'partial', 14, 'silver', 60, 'gold', 90),
      'B1', jsonb_build_object('pillar', 'B', 'partial', 0.70, 'silver', 0.90, 'gold', 0.95),
      'B2', jsonb_build_object('pillar', 'B', 'partial', 1, 'silver', 2, 'gold', 3),
      'B3', jsonb_build_object('pillar', 'B', 'partial', 0.20, 'silver', 0.40, 'gold', 0.70),
      'B4', jsonb_build_object('pillar', 'B', 'partial', 1, 'silver', null, 'gold', 2),
      -- Anak tangga 1 (tercatat) = SEBAGIAN, anak tangga 2 (berbukti) =
      -- TERPENUHI lewat ambang Emas. Tanpa ambang Perak, persis seperti B4.
      'B5', jsonb_build_object('pillar', 'B', 'partial', 1, 'silver', null, 'gold', 2),
      'C1', jsonb_build_object('pillar', 'C', 'partial', 1, 'silver', 3, 'gold', 4),
      'C2', jsonb_build_object('pillar', 'C', 'partial', 1, 'silver', 4, 'gold', 4),
      'D1', jsonb_build_object('pillar', 'D', 'partial', null, 'silver', 1, 'gold', 1),
      'D2', jsonb_build_object('pillar', 'D', 'partial', 1, 'silver', 3, 'gold', 6),
      'D3', jsonb_build_object('pillar', 'D', 'partial', null, 'silver', null, 'gold', 1)
    ),
    -- Tembaga tidak disentuh. Tingkat pertama harus tetap bisa dicapai dalam
    -- dua minggu tanpa meninggalkan rumah.
    'bronze', jsonb_build_object('A1', 8, 'A3', 14, 'D1', 1, 'B1', 0.70),
    'graceDays', 7
  ),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (version) do update set
  status = 'published',
  rules = excluded.rules,
  published_at = coalesce(public.readiness_rule_sets.published_at, excluded.published_at),
  effective_at = coalesce(public.readiness_rule_sets.effective_at, excluded.effective_at),
  updated_at = now();

-- v2 dipensiunkan, bukan dihapus. Barisnya tetap ada karena potret lama
-- menyebut namanya, dan orang yang kelak bertanya "aturan apa yang berlaku
-- bulan lalu" harus bisa membacanya utuh.
--
-- Hanya statusnya yang berubah; trigger pembeku memang hanya melarang isinya
-- berubah.
update public.readiness_rule_sets
set status = 'retired', updated_at = now()
where version = 'wp08-pilot-v2' and status = 'published';

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------
-- Migrasi yang menerbitkan konfigurasi bisa berhasil dan tetap salah: satu
-- kunci yang salah eja akan membuat evaluator membaca undefined dan
-- memperlakukan komponen itu seperti tidak punya ambang sama sekali.

do $$
declare
  v_rules jsonb;
begin
  select rules into v_rules from public.readiness_rule_sets where version = 'wp08-pilot-v3';

  if v_rules -> 'components' -> 'B5' is null then
    raise exception 'B5_TIDAK_TERBIT: konfigurasi wp08-pilot-v3 tidak memuat komponen B5.';
  end if;
  if (v_rules -> 'components' -> 'B5' ->> 'pillar') <> 'B' then
    raise exception 'B5_SALAH_PILAR: B5 harus berada di pilar B.';
  end if;
  if (v_rules -> 'components' -> 'B5' ->> 'gold')::numeric <> 2 then
    raise exception 'B5_SALAH_AMBANG: anak tangga berbukti bernilai 2.';
  end if;
  if v_rules -> 'components' -> 'B5' ->> 'silver' is not null then
    raise exception 'B5_MENAHAN_PERAK: ambang Perak harus kosong supaya tidak ada yang turun tingkat.';
  end if;
  if not (v_rules -> 'effortOrder') ? 'B5' then
    raise exception 'B5_TANPA_URUTAN: B5 tidak akan pernah terpilih sebagai langkah berikutnya.';
  end if;

  -- Dua belas komponen lama harus identik dengan v2. Ini yang benar-benar
  -- menjaga janji "tidak ada yang turun tingkat karena migrasi ini".
  if exists (
    select 1
    from public.readiness_rule_sets lama,
      lateral jsonb_each(lama.rules -> 'components') as komponen(id, aturan)
    where lama.version = 'wp08-pilot-v2'
      and komponen.aturan is distinct from (v_rules -> 'components' -> komponen.id)
  ) then
    raise exception 'AMBANG_LAMA_BERGESER: ada komponen v2 yang ambangnya berubah di v3.';
  end if;
end;
$$;

commit;
