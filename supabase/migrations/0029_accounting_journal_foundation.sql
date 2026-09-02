-- ============================================================================
-- 0029: FONDASI JURNAL GANDA SAK EMKM (Tahap A)
--
-- "Satu engine, dua wajah": UMKM tetap menjawab "uang masuk atau keluar,
-- berapa, untuk apa" (10 kategori bahasa warung). Sistem menyusun jurnal ganda
-- dari template deterministik di belakang layar.
--
-- Isi migrasi ini (Tahap A saja):
--   1. coa_accounts        : bagan akun SAK EMKM versi mikro (kode 4 digit)
--   2. category_templates  : pemetaan (sektor, kategori 1..10, subtype) -> akun
--   3. counterparties      : pelanggan / supplier / pemberi pinjaman
--   4. journal_entries     : satu entry per peristiwa, immutable
--   5. journal_lines       : baris debit/kredit, dijaga trigger seimbang
--   6. kolom baru di transactions + backfill transaksi lama
--   7. fn_post_transaction_journal / fn_reverse_journal_entry
--   8. v_general_ledger / fn_trial_balance / fn_income_statement
--   9. penulisan ulang RPC ledger + capture agar memposting jurnal
--      dalam transaksi database yang sama
--
-- KEPUTUSAN YANG MENYIMPANG DARI SPEK (dicatat sesuai aturan handoff):
--   a. Spek meminta kolom `category_code smallint (1..10)` pada transactions,
--      tetapi kolom `category_code text` sudah dipakai sejak 0015 untuk daftar
--      kategori capture ('sales_food', dst). Kolom baru dinamai
--      `emkm_category_code` / `emkm_category_subtype` agar tidak bentrok.
--   b. Spek menulis nilai enum huruf besar (BELUM_DIBAYAR, OPERASI, ...).
--      Untuk payment_method repo memakai huruf kecil bahasa Inggris, jadi
--      nilai barunya `unpaid`. Nilai domain akuntansi yang murni internal
--      (source, cash_flow_section, dst) memakai huruf besar seperti spek.
--   c. Repo tidak pernah memakai `create type ... as enum`; semua enum di sini
--      diwujudkan sebagai `text` + CHECK, mengikuti pola 0021.
--   d. `journal_lines` menyimpan `business_id` (denormalisasi) supaya RLS dan
--      indeks laporan tidak perlu join ke journal_entries di setiap baris.
--   e. Tabel akuntansi TIDAK memakai `private.business_role()`. Fungsi itu
--      (0027) berakhir dengan `coalesce(..., 'owner')` tanpa syarat sehingga
--      setiap akun dianggap owner atas bisnis mana pun. Untuk menjaga invarian
--      isolasi (spek Bagian 11 nomor 8), migrasi ini memakai helper ketat
--      `private.accounting_business_access()`.
--   f. `confirm_transaction_capture` ditulis ulang: versi 0027 menulis kolom
--      `profile_id` dan `capture_item_index` yang tidak ada di skema (error
--      42703 saat runtime) dan menolak categoryCode yang dikirim aplikasi.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Helper akses (ketat, tanpa fallback 'owner')
-- ---------------------------------------------------------------------------

create or replace function private.accounting_business_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business_id is not null and (
    exists (
      select 1 from public.businesses as business
      where business.id = p_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    )
    or exists (
      select 1 from public.business_members as member
      where member.business_id = p_business_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    )
    or (select private.is_platform_admin())
  );
$$;

revoke all on function private.accounting_business_access(uuid) from public, anon, authenticated;
grant execute on function private.accounting_business_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Bagan akun SAK EMKM (referensi, tanpa business_id)
-- ---------------------------------------------------------------------------

create table if not exists public.coa_accounts (
  code text primary key,
  name text not null,
  account_type text not null,
  normal_balance text not null,
  is_contra boolean not null default false,
  report_line text not null,
  parent_code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'coa_accounts_code_check') then
    alter table public.coa_accounts add constraint coa_accounts_code_check
      check (code ~ '^[1-5][0-9]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coa_accounts_type_check') then
    alter table public.coa_accounts add constraint coa_accounts_type_check
      check (account_type in ('ASET', 'LIABILITAS', 'EKUITAS', 'PENDAPATAN', 'BEBAN'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coa_accounts_normal_balance_check') then
    alter table public.coa_accounts add constraint coa_accounts_normal_balance_check
      check (normal_balance in ('DEBIT', 'KREDIT'));
  end if;
end $$;

insert into public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order) values
  ('1100', 'Kas',                                    'ASET',       'DEBIT',  false, 'BS_KAS',                 null,   10),
  ('1200', 'Bank / Giro',                            'ASET',       'DEBIT',  false, 'BS_GIRO',                null,   20),
  ('1300', 'Piutang Usaha',                          'ASET',       'DEBIT',  false, 'BS_PIUTANG_USAHA',       null,   30),
  ('1400', 'Persediaan',                             'ASET',       'DEBIT',  false, 'BS_PERSEDIAAN',          null,   40),
  ('1500', 'Beban Dibayar di Muka',                  'ASET',       'DEBIT',  false, 'BS_BEBAN_DIBAYAR_DIMUKA',null,   50),
  ('1600', 'Aset Tetap',                             'ASET',       'DEBIT',  false, 'BS_ASET_TETAP',          null,   60),
  ('1690', 'Akumulasi Penyusutan',                   'ASET',       'KREDIT', true,  'BS_AKUMULASI_PENYUSUTAN',null,   70),
  ('2100', 'Utang Usaha',                            'LIABILITAS', 'KREDIT', false, 'BS_UTANG_USAHA',         null,  110),
  ('2200', 'Utang Bank',                             'LIABILITAS', 'KREDIT', false, 'BS_UTANG_BANK',          null,  120),
  ('2300', 'Utang Pinjaman Lain',                    'LIABILITAS', 'KREDIT', false, 'BS_UTANG_BANK',          null,  130),
  ('2400', 'Utang Pajak',                            'LIABILITAS', 'KREDIT', false, 'BS_UTANG_PAJAK',         null,  140),
  ('3100', 'Modal Pemilik',                          'EKUITAS',    'KREDIT', false, 'BS_MODAL',               null,  210),
  ('3200', 'Prive',                                  'EKUITAS',    'DEBIT',  true,  'BS_MODAL',               null,  220),
  ('3300', 'Saldo Laba',                             'EKUITAS',    'KREDIT', false, 'BS_SALDO_LABA',          null,  230),
  ('4100', 'Pendapatan Usaha',                       'PENDAPATAN', 'KREDIT', false, 'IS_PENDAPATAN_USAHA',    null,  310),
  ('4200', 'Pendapatan Lain-lain',                   'PENDAPATAN', 'KREDIT', false, 'IS_PENDAPATAN_LAIN',     null,  320),
  ('5100', 'Beban Pokok Penjualan',                  'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         null,  410),
  ('5210', 'Beban Bahan Bakar & Energi',             'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 421),
  ('5220', 'Beban Utilitas',                         'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 422),
  ('5230', 'Beban Gaji & Upah',                      'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 423),
  ('5240', 'Beban Sewa',                             'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 424),
  ('5250', 'Beban Kemasan & Label',                  'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 425),
  ('5260', 'Beban Transport & Ongkir',               'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 426),
  ('5270', 'Beban Promosi & Komisi Platform',        'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 427),
  ('5280', 'Beban Penyusutan',                       'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 428),
  ('5290', 'Beban Usaha Lain-lain',                  'BEBAN',      'DEBIT',  false, 'IS_BEBAN_USAHA',         '5200', 429),
  ('5310', 'Beban Bunga Pinjaman',                   'BEBAN',      'DEBIT',  false, 'IS_BEBAN_LAIN',          null,  510),
  ('5400', 'Beban Pajak Penghasilan',                'BEBAN',      'DEBIT',  false, 'IS_BEBAN_PAJAK',         null,  520)
on conflict (code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  is_contra = excluded.is_contra,
  report_line = excluded.report_line,
  parent_code = excluded.parent_code,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 2. Template kategori (kategori bahasa warung -> aturan akun)
-- ---------------------------------------------------------------------------
--
-- Token aturan akun:
--   CASH_STAR        kas/bank sesuai metode bayar (tunai -> 1100, selain itu 1200)
--   CASH_OR_PAYABLE  CASH_STAR, kecuali metode bayar 'unpaid'/'credit' -> 2100
--   LIABILITY_STAR   utang sesuai jenis lawan transaksi
--                    (SUPPLIER -> 2100, BANK -> 2200, selain itu -> 2300)
--   '1100'..'5400'   kode akun tetap
--
create table if not exists public.category_templates (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  category_code smallint not null,
  subtype text,
  label_umkm text not null,
  description_umkm text,
  direction text not null,
  debit_rule text not null,
  credit_rule text not null,
  cash_flow_section text not null,
  affects_pnl boolean not null default false,
  trigger_keywords text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  version text not null default 'coa-emkm-v1',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists category_templates_lookup_key
  on public.category_templates (sector, category_code, coalesce(subtype, ''), version);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'category_templates_sector_check') then
    alter table public.category_templates add constraint category_templates_sector_check
      check (sector in (
        'PERDAGANGAN_KULINER', 'PERDAGANGAN_UMUM', 'INDUSTRI_PENGOLAHAN', 'JASA',
        'PERTANIAN', 'PETERNAKAN', 'PERIKANAN', 'LAINNYA'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_templates_category_code_check') then
    alter table public.category_templates add constraint category_templates_category_code_check
      check (category_code between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_templates_direction_check') then
    alter table public.category_templates add constraint category_templates_direction_check
      check (direction in ('income', 'expense'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_templates_cash_flow_check') then
    alter table public.category_templates add constraint category_templates_cash_flow_check
      check (cash_flow_section in ('OPERASI', 'INVESTASI', 'PENDANAAN', 'NON_KAS'));
  end if;
end $$;

insert into public.category_templates (
  sector, category_code, subtype, label_umkm, description_umkm, direction,
  debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order
) values
  ('PERDAGANGAN_KULINER',  1, null,   'Laku / Jualan',        'Uang masuk dari barang atau makanan yang terjual', 'income',
     'CASH_STAR', '4100', 'OPERASI', true,
     array['laku','jual','jualan','terjual','masuk','omzet','penjualan','laris'], 10),
  ('PERDAGANGAN_KULINER',  2, null,   'Pemasukan lain',       'Uang masuk di luar jualan, misalnya sewa etalase atau komisi titip jual', 'income',
     'CASH_STAR', '4200', 'OPERASI', true,
     array['sewa etalase','komisi','titip jual','bonus','hadiah','cashback'], 20),
  ('PERDAGANGAN_KULINER',  3, null,   'Piutang dibayar',      'Pelanggan melunasi utangnya', 'income',
     'CASH_STAR', '1300', 'OPERASI', false,
     array['bayar utang','lunas','pelunasan','nyaur','dibayar'], 30),
  ('PERDAGANGAN_KULINER',  4, '4a',   'Modal masuk',          'Tambahan modal dari pemilik atau keluarga', 'income',
     'CASH_STAR', '3100', 'PENDANAAN', false,
     array['modal','tambah modal','suntik modal','setoran modal'], 40),
  ('PERDAGANGAN_KULINER',  4, '4b',   'Pinjaman masuk',       'Uang pinjaman yang cair', 'income',
     'CASH_STAR', 'LIABILITY_STAR', 'PENDANAAN', false,
     array['pinjaman','pinjam','kredit cair','cair','koperasi','utang bank'], 50),
  ('PERDAGANGAN_KULINER',  5, null,   'Belanja bahan / barang','Beli bahan baku atau stok dagangan', 'expense',
     '5100', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['belanja','kulak','beli bahan','stok','bahan baku','pasar','grosir'], 60),
  ('PERDAGANGAN_KULINER',  6, '5210', 'Bahan bakar & energi', 'Gas, bensin, solar, minyak tanah', 'expense',
     '5210', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['gas','elpiji','bensin','solar','minyak tanah','bbm'], 71),
  ('PERDAGANGAN_KULINER',  6, '5220', 'Listrik, air, internet','Tagihan utilitas usaha', 'expense',
     '5220', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['listrik','token','air','pdam','internet','wifi','pulsa data'], 72),
  ('PERDAGANGAN_KULINER',  6, '5230', 'Gaji / upah',          'Upah karyawan atau pembantu', 'expense',
     '5230', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['gaji','upah','karyawan','pegawai','bayar orang','borongan'], 73),
  ('PERDAGANGAN_KULINER',  6, '5240', 'Sewa tempat',          'Sewa kios, lapak, atau dapur', 'expense',
     '5240', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['sewa','kontrakan','kios','lapak','ruko'], 74),
  ('PERDAGANGAN_KULINER',  6, '5250', 'Kemasan & label',      'Plastik, kardus, stiker, label produk', 'expense',
     '5250', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['kemasan','plastik','kardus','stiker','label','box','cup'], 75),
  ('PERDAGANGAN_KULINER',  6, '5260', 'Transport & ongkir',   'Ongkos jalan, bensin kirim, ongkir ekspedisi', 'expense',
     '5260', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['ongkir','transport','kirim','ekspedisi','angkut','parkir','tol'], 76),
  ('PERDAGANGAN_KULINER',  6, '5270', 'Promosi & komisi aplikasi','Iklan, endorse, potongan aplikasi pesan antar', 'expense',
     '5270', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['promosi','iklan','endorse','komisi aplikasi','potongan aplikasi','gofood','grabfood','shopeefood'], 77),
  ('PERDAGANGAN_KULINER',  6, '5280', 'Penyusutan alat',      'Nilai alat usaha yang menyusut (dihitung sistem)', 'expense',
     '5280', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['penyusutan','susut'], 78),
  ('PERDAGANGAN_KULINER',  6, '5290', 'Biaya usaha lainnya',  'Biaya usaha yang tidak masuk kelompok lain', 'expense',
     '5290', 'CASH_OR_PAYABLE', 'OPERASI', true,
     array['lain','serba serbi','biaya lain','iuran','retribusi','sampah','keamanan'], 79),
  ('PERDAGANGAN_KULINER',  7, null,   'Bayar utang / cicilan','Membayar cicilan atau melunasi utang usaha', 'expense',
     'LIABILITY_STAR', 'CASH_STAR', 'PENDANAAN', false,
     array['cicilan','nyicil','angsuran','bayar utang','setor koperasi','bayar pinjaman'], 80),
  ('PERDAGANGAN_KULINER',  8, null,   'Beli alat / aset',     'Beli peralatan usaha yang dipakai lama', 'expense',
     '1600', 'CASH_OR_PAYABLE', 'INVESTASI', false,
     array['beli kulkas','etalase','mesin','kompor','freezer','gerobak','alat','motor'], 90),
  ('PERDAGANGAN_KULINER',  9, null,   'Ambil untuk rumah',    'Uang usaha yang dipakai untuk keperluan pribadi atau rumah', 'expense',
     '3200', 'CASH_STAR', 'PENDANAAN', false,
     array['rumah','anak','sekolah','spp','dapur','pribadi','belanja rumah','arisan','kondangan'], 100),
  ('PERDAGANGAN_KULINER', 10, null,   'Ngutangin pelanggan',  'Barang sudah diberikan tapi pelanggan belum bayar', 'income',
     '1300', '4100', 'NON_KAS', true,
     array['ngutang','bon','kasbon','belum bayar','utang pelanggan'], 110)
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

-- ---------------------------------------------------------------------------
-- 3. Lawan transaksi
-- ---------------------------------------------------------------------------

create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  type text not null default 'PELANGGAN',
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'counterparties_type_check') then
    alter table public.counterparties add constraint counterparties_type_check
      check (type in ('PELANGGAN', 'SUPPLIER', 'BANK', 'KOPERASI', 'KELUARGA', 'LAIN'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'counterparties_name_check') then
    alter table public.counterparties add constraint counterparties_name_check
      check (char_length(trim(name)) between 1 and 120);
  end if;
end $$;

create unique index if not exists counterparties_business_name_key
  on public.counterparties (business_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- 4. Jurnal umum
-- ---------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  entry_date date not null,
  posted_at timestamptz not null default now(),
  source text not null,
  source_id uuid,
  reverses_entry_id uuid references public.journal_entries(id) on delete restrict,
  memo text,
  reason text,
  template_version text not null default 'coa-emkm-v1',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  account_code text not null references public.coa_accounts(code),
  debit bigint not null default 0,
  credit bigint not null default 0,
  line_order smallint not null default 1,
  memo text,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_source_check') then
    alter table public.journal_entries add constraint journal_entries_source_check
      check (source in ('TRANSACTION', 'OPENING', 'DEPRECIATION', 'INVENTORY_ADJ', 'REVERSAL', 'TAX_ESTIMATE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_date_check') then
    alter table public.journal_entries add constraint journal_entries_date_check
      check (entry_date between date '2000-01-01' and date '2100-01-01');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journal_lines_amount_check') then
    alter table public.journal_lines add constraint journal_lines_amount_check
      check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0) and (debit + credit) > 0);
  end if;
end $$;

create index if not exists journal_entries_business_date_idx
  on public.journal_entries (business_id, entry_date desc, posted_at desc);
create index if not exists journal_entries_source_idx
  on public.journal_entries (source, source_id);
create index if not exists journal_lines_entry_idx
  on public.journal_lines (entry_id, line_order);
create index if not exists journal_lines_account_idx
  on public.journal_lines (business_id, account_code);

-- Invarian: setiap entry seimbang dan punya minimal 2 baris.
-- Constraint trigger deferrable supaya entry + baris boleh ditulis bertahap
-- di dalam satu transaksi, tetapi tetap wajib seimbang saat commit.
create or replace function private.assert_journal_entry_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Trigger ini hanya dipasang untuk INSERT dan UPDATE, jadi NEW selalu ada.
  -- Menyebut OLD di sini akan gagal (55000) pada INSERT.
  v_entry_id uuid := new.entry_id;
  v_debit bigint;
  v_credit bigint;
  v_lines int;
begin
  select coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0), count(*)
  into v_debit, v_credit, v_lines
  from public.journal_lines as line
  where line.entry_id = v_entry_id;

  if v_lines < 2 then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_TOO_FEW_LINES';
  end if;
  if v_debit <> v_credit then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_UNBALANCED';
  end if;
  return null;
end;
$$;

drop trigger if exists journal_lines_balanced on public.journal_lines;
create constraint trigger journal_lines_balanced
  after insert or update on public.journal_lines
  deferrable initially deferred
  for each row execute function private.assert_journal_entry_balanced();

-- Trigger di atas hanya berjalan kalau ada baris. Entry tanpa baris sama sekali
-- akan lolos begitu saja, jadi entry-nya sendiri juga diperiksa saat commit.
create or replace function private.assert_journal_entry_has_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_debit bigint;
  v_credit bigint;
  v_lines int;
begin
  select coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0), count(*)
  into v_debit, v_credit, v_lines
  from public.journal_lines as line
  where line.entry_id = new.id;

  if v_lines < 2 then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_TOO_FEW_LINES';
  end if;
  if v_debit <> v_credit then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_UNBALANCED';
  end if;
  return null;
end;
$$;

drop trigger if exists journal_entries_balanced on public.journal_entries;
create constraint trigger journal_entries_balanced
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function private.assert_journal_entry_has_lines();

-- Invarian: jurnal tidak pernah diubah atau dihapus. Koreksi = jurnal pembalik.
create or replace function private.reject_journal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'JOURNAL_IS_IMMUTABLE';
end;
$$;

drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function private.reject_journal_mutation();

drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function private.reject_journal_mutation();

-- ---------------------------------------------------------------------------
-- 5. Kolom baru pada transactions
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists emkm_category_code smallint,
  add column if not exists emkm_category_subtype text,
  add column if not exists counterparty_id uuid references public.counterparties(id) on delete set null,
  add column if not exists interest_amount_idr bigint not null default 0,
  add column if not exists needs_reclass boolean not null default false,
  add column if not exists journal_entry_id uuid references public.journal_entries(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_emkm_category_check') then
    alter table public.transactions add constraint transactions_emkm_category_check
      check (emkm_category_code is null or emkm_category_code between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_interest_amount_check') then
    alter table public.transactions add constraint transactions_interest_amount_check
      check (interest_amount_idr >= 0);
  end if;
end $$;

create index if not exists transactions_needs_reclass_idx
  on public.transactions (business_id, needs_reclass)
  where needs_reclass;
create index if not exists transactions_journal_entry_idx
  on public.transactions (journal_entry_id);

-- Metode bayar baru: 'unpaid' (spek: BELUM_DIBAYAR). Ditulis ulang agar aman
-- untuk replay: constraint lama dibuang lalu dipasang dengan daftar penuh.
alter table public.transactions drop constraint if exists transactions_capture_details_check;
alter table public.transactions add constraint transactions_capture_details_check check (
  (quantity is null or quantity > 0)
  and (unit_price_idr is null or unit_price_idr > 0)
  and (category_code is null or category_code in (
    'sales', 'materials', 'operations', 'payroll', 'other',
    'sales_direct', 'sales_delivery', 'sales_catering', 'raw_material', 'packaging',
    'utilities', 'wage', 'rent', 'platform_fee', 'transport', 'equipment', 'promotion',
    'sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other',
    'raw_ingredients', 'inventory', 'marketing', 'maintenance', 'supplies',
    'wages', 'salary', 'bonus', 'tax', 'loan_repayment',
    'capital_in', 'loan_in', 'receivable_paid', 'owner_draw', 'asset_purchase', 'receivable_new'
  ))
  and (payment_method is null or payment_method in (
    'cash', 'qris', 'bank_transfer', 'ewallet', 'edc', 'credit', 'unpaid', 'other'
  ))
);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.coa_accounts enable row level security;
alter table public.category_templates enable row level security;
alter table public.counterparties enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

drop policy if exists coa_accounts_select on public.coa_accounts;
create policy coa_accounts_select on public.coa_accounts for select to authenticated using (is_active);

drop policy if exists category_templates_select on public.category_templates;
create policy category_templates_select on public.category_templates for select to authenticated using (is_active);

drop policy if exists counterparties_select on public.counterparties;
create policy counterparties_select on public.counterparties for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists journal_lines_select on public.journal_lines;
create policy journal_lines_select on public.journal_lines for select to authenticated
using (private.accounting_business_access(business_id));

revoke all on public.coa_accounts from public, anon, authenticated;
revoke all on public.category_templates from public, anon, authenticated;
revoke all on public.counterparties from public, anon, authenticated;
revoke all on public.journal_entries from public, anon, authenticated;
revoke all on public.journal_lines from public, anon, authenticated;
grant select on public.coa_accounts to authenticated;
grant select on public.category_templates to authenticated;
grant select on public.counterparties to authenticated;
grant select on public.journal_entries to authenticated;
grant select on public.journal_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Resolver akun dan mesin posting
-- ---------------------------------------------------------------------------

create or replace function private.resolve_account_rule(
  p_rule text,
  p_payment_method text,
  p_counterparty_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_rule
    when 'CASH_STAR' then
      case when coalesce(p_payment_method, 'cash') in ('cash', 'other') then '1100' else '1200' end
    when 'CASH_OR_PAYABLE' then
      case
        when p_payment_method in ('unpaid', 'credit') then '2100'
        when coalesce(p_payment_method, 'cash') in ('cash', 'other') then '1100'
        else '1200'
      end
    when 'LIABILITY_STAR' then
      case coalesce(p_counterparty_type, 'LAIN')
        when 'SUPPLIER' then '2100'
        when 'BANK' then '2200'
        else '2300'
      end
    else p_rule
  end;
$$;

revoke all on function private.resolve_account_rule(text, text, text) from public, anon, authenticated;

-- Sektor usaha -> sektor template. Pilot hanya punya PERDAGANGAN_KULINER;
-- sektor lain jatuh ke template pilot sampai Tahap C menambahkan seed sendiri.
create or replace function private.emkm_sector_for_business(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'PERDAGANGAN_KULINER'::text from public.businesses where id = p_business_id;
$$;

-- Menyusun jurnal ganda untuk satu transaksi terkonfirmasi.
-- Gagal keras bila template tidak ditemukan (tidak ada fallback diam-diam).
create or replace function public.fn_post_transaction_journal(p_transaction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.transactions%rowtype;
  v_sector text;
  v_template public.category_templates%rowtype;
  v_counterparty_type text;
  v_debit_account text;
  v_credit_account text;
  v_entry_id uuid;
  v_amount bigint;
  v_interest bigint;
  v_principal bigint;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.journal_entry_id is not null then
    return v_tx.journal_entry_id;
  end if;
  if v_tx.emkm_category_code is null then
    return null;
  end if;
  if v_tx.business_id is null then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_WITHOUT_BUSINESS';
  end if;

  v_amount := coalesce(v_tx.amount_idr, v_tx.nominal);
  if v_amount is null or v_amount <= 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_sector := private.emkm_sector_for_business(v_tx.business_id);

  select * into v_template
  from public.category_templates
  where sector = v_sector
    and category_code = v_tx.emkm_category_code
    and coalesce(subtype, '') = coalesce(v_tx.emkm_category_subtype, '')
    and version = 'coa-emkm-v1'
    and is_active
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'CATEGORY_TEMPLATE_NOT_FOUND';
  end if;

  select party.type into v_counterparty_type
  from public.counterparties as party
  where party.id = v_tx.counterparty_id;

  v_debit_account := private.resolve_account_rule(v_template.debit_rule, v_tx.payment_method, v_counterparty_type);
  v_credit_account := private.resolve_account_rule(v_template.credit_rule, v_tx.payment_method, v_counterparty_type);

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by
  ) values (
    v_tx.business_id,
    coalesce(v_tx.transaction_date, v_tx.tanggal, (now() at time zone 'Asia/Jakarta')::date),
    'TRANSACTION', v_tx.id, left(coalesce(v_tx.item, ''), 240), 'coa-emkm-v1', v_tx.user_id
  ) returning id into v_entry_id;

  -- Kategori 7 memecah cicilan menjadi pokok (utang) dan bunga (beban 5310).
  v_interest := least(greatest(coalesce(v_tx.interest_amount_idr, 0), 0), v_amount);
  if v_tx.emkm_category_code = 7 and v_interest > 0 then
    v_principal := v_amount - v_interest;
    if v_principal > 0 then
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_tx.business_id, v_debit_account, v_principal, 0, 1);
    end if;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, '5310', v_interest, 0, 2);
  else
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, v_debit_account, v_amount, 0, 1);
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, v_tx.business_id, v_credit_account, 0, v_amount, 9);

  update public.transactions
  set journal_entry_id = v_entry_id, updated_at = now()
  where id = v_tx.id;

  return v_entry_id;
end;
$$;

create or replace function public.fn_reverse_journal_entry(p_entry_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_reversal_id uuid;
  v_existing uuid;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_NOT_FOUND';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;

  -- Idempoten: satu entry hanya boleh dibalik sekali.
  select id into v_existing from public.journal_entries where reverses_entry_id = p_entry_id limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, reverses_entry_id, memo, reason, template_version, created_by
  ) values (
    v_entry.business_id,
    (now() at time zone 'Asia/Jakarta')::date,
    'REVERSAL', v_entry.source_id, v_entry.id,
    left('Pembalikan: ' || coalesce(v_entry.memo, ''), 240),
    trim(p_reason), v_entry.template_version, (select auth.uid())
  ) returning id into v_reversal_id;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  select v_reversal_id, line.business_id, line.account_code, line.credit, line.debit, line.line_order
  from public.journal_lines as line
  where line.entry_id = v_entry.id;

  return v_reversal_id;
end;
$$;

revoke all on function public.fn_post_transaction_journal(uuid) from public, anon, authenticated;
revoke all on function public.fn_reverse_journal_entry(uuid, text) from public, anon, authenticated;
revoke all on function private.emkm_sector_for_business(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Buku besar, neraca saldo, laba rugi (security invoker, tunduk RLS)
-- ---------------------------------------------------------------------------

drop view if exists public.v_general_ledger;
create view public.v_general_ledger
with (security_invoker = true) as
select
  line.business_id,
  line.account_code,
  account.name as account_name,
  account.account_type,
  account.normal_balance,
  entry.entry_date,
  entry.id as entry_id,
  entry.source,
  entry.memo,
  line.debit,
  line.credit,
  sum(
    case when account.normal_balance = 'DEBIT' then line.debit - line.credit else line.credit - line.debit end
  ) over (
    partition by line.business_id, line.account_code
    order by entry.entry_date, entry.posted_at, line.line_order, line.id
    rows between unbounded preceding and current row
  ) as running_balance
from public.journal_lines as line
join public.journal_entries as entry on entry.id = line.entry_id
join public.coa_accounts as account on account.code = line.account_code;

grant select on public.v_general_ledger to authenticated;

create or replace function public.fn_trial_balance(p_business_id uuid, p_as_of date)
returns table (
  account_code text,
  account_name text,
  account_type text,
  normal_balance text,
  total_debit bigint,
  total_credit bigint,
  balance bigint
)
language sql
stable
set search_path = ''
as $$
  select
    account.code,
    account.name,
    account.account_type,
    account.normal_balance,
    coalesce(sum(line.debit), 0)::bigint,
    coalesce(sum(line.credit), 0)::bigint,
    case when account.normal_balance = 'DEBIT'
      then coalesce(sum(line.debit) - sum(line.credit), 0)
      else coalesce(sum(line.credit) - sum(line.debit), 0)
    end::bigint
  from public.coa_accounts as account
  join public.journal_lines as line on line.account_code = account.code
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date <= p_as_of
  group by account.code, account.name, account.account_type, account.normal_balance, account.sort_order
  having coalesce(sum(line.debit), 0) <> 0 or coalesce(sum(line.credit), 0) <> 0
  order by account.sort_order;
$$;

create or replace function public.fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date)
returns table (
  report_line text,
  account_code text,
  account_name text,
  amount bigint
)
language sql
stable
set search_path = ''
as $$
  select
    account.report_line,
    account.code,
    account.name,
    case when account.normal_balance = 'KREDIT'
      then coalesce(sum(line.credit) - sum(line.debit), 0)
      else coalesce(sum(line.debit) - sum(line.credit), 0)
    end::bigint
  from public.coa_accounts as account
  join public.journal_lines as line on line.account_code = account.code
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date between p_date_from and p_date_to
    and account.account_type in ('PENDAPATAN', 'BEBAN')
  group by account.report_line, account.code, account.name, account.normal_balance, account.sort_order
  order by account.sort_order;
$$;

-- Agregat bulanan bahasa warung: 4 kotak + grafik 6 bulan.
-- Prive (3200) sengaja dipisah dan tidak pernah masuk beban.
create or replace function public.fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date)
returns table (
  period_month date,
  revenue bigint,
  cogs bigint,
  opex bigint,
  interest bigint,
  net_income bigint,
  prive bigint,
  capital_in bigint,
  receivable_new bigint,
  days_recorded integer
)
language sql
stable
set search_path = ''
as $$
  select
    date_trunc('month', entry.entry_date)::date as period_month,
    coalesce(sum(case when line.account_code in ('4100', '4200') then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5100' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code like '52%' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5310' then line.debit - line.credit end), 0)::bigint,
    (
      coalesce(sum(case when line.account_code like '4%' then line.credit - line.debit end), 0)
      - coalesce(sum(case when line.account_code like '5%' then line.debit - line.credit end), 0)
    )::bigint,
    coalesce(sum(case when line.account_code = '3200' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '3100' then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '1300' then line.debit - line.credit end), 0)::bigint,
    count(distinct entry.entry_date)::integer
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date between p_date_from and p_date_to
  group by 1
  order by 1;
$$;

revoke all on function public.fn_trial_balance(uuid, date) from public, anon, authenticated;
revoke all on function public.fn_income_statement(uuid, date, date) from public, anon, authenticated;
revoke all on function public.fn_warung_monthly(uuid, date, date) from public, anon, authenticated;
grant execute on function public.fn_trial_balance(uuid, date) to authenticated;
grant execute on function public.fn_income_statement(uuid, date, date) to authenticated;
grant execute on function public.fn_warung_monthly(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Lawan transaksi: pencarian / pembuatan idempoten
-- ---------------------------------------------------------------------------

create or replace function public.upsert_counterparty(p_name text, p_type text default 'PELANGGAN')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(v_name) not between 1 and 120
    or coalesce(p_type, 'PELANGGAN') not in ('PELANGGAN', 'SUPPLIER', 'BANK', 'KOPERASI', 'KELUARGA', 'LAIN') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  insert into public.counterparties (business_id, name, type, created_by)
  values (v_business_id, v_name, coalesce(p_type, 'PELANGGAN'), v_user_id)
  on conflict (business_id, lower(trim(name))) do update set
    type = case when counterparties.type = 'PELANGGAN' then excluded.type else counterparties.type end,
    is_active = true,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('counterpartyId', v_id, 'name', v_name);
end;
$$;

revoke all on function public.upsert_counterparty(text, text) from public, anon, authenticated;
grant execute on function public.upsert_counterparty(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Validasi kategori EMKM (dipakai semua jalur tulis)
-- ---------------------------------------------------------------------------

create or replace function private.normalize_emkm_category(
  inout p_category_code smallint,
  inout p_subtype text,
  inout p_payment_method text,
  out o_direction text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_category_code is null then
    o_direction := null;
    return;
  end if;
  if p_category_code not between 1 and 10 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Kategori 4 wajib bersubtype; default 4a (modal masuk).
  if p_category_code = 4 then
    p_subtype := coalesce(nullif(trim(coalesce(p_subtype, '')), ''), '4a');
    if p_subtype not in ('4a', '4b') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
  elsif p_category_code = 6 then
    p_subtype := coalesce(nullif(trim(coalesce(p_subtype, '')), ''), '5290');
    if p_subtype not in ('5210', '5220', '5230', '5240', '5250', '5260', '5270', '5280', '5290') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
  else
    p_subtype := null;
  end if;

  -- Jualan yang belum dibayar bukan uang masuk: jadikan piutang (kategori 10).
  if p_category_code = 1 and p_payment_method in ('unpaid', 'credit') then
    p_category_code := 10;
  end if;
  if p_category_code = 10 then
    p_payment_method := 'unpaid';
  end if;

  o_direction := case when p_category_code in (1, 2, 3, 4, 10) then 'income' else 'expense' end;
end;
$$;

revoke all on function private.normalize_emkm_category(smallint, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Jembatan kategori lama <-> kategori EMKM
-- ---------------------------------------------------------------------------
-- Antarmuka lama (buku kas manual) tetap mengirim category_group/category_code
-- versi WP-05. Supaya setiap transaksi baru tetap punya jurnal, pasangan lama
-- diterjemahkan ke kategori EMKM 1..10 di sini, bukan di prompt AI.

create or replace function private.emkm_category_from_legacy(
  p_direction text,
  p_category_group text,
  p_category_code text,
  out o_category_code smallint,
  out o_subtype text
)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_direction = 'income' and (p_category_group = 'sales' or p_category_code like 'sales%') then 1::smallint
      when p_direction = 'income' then 2::smallint
      when p_category_group = 'asset' or p_category_code = 'equipment' then 8::smallint
      when p_category_code in ('raw_material', 'raw_ingredients', 'inventory', 'materials') then 5::smallint
      else 6::smallint
    end,
    case
      when p_direction = 'income' then null
      when p_category_group = 'asset' or p_category_code = 'equipment' then null
      when p_category_code in ('raw_material', 'raw_ingredients', 'inventory', 'materials') then null
      when p_category_code in ('utilities') then '5220'
      when p_category_code in ('wage', 'wages', 'salary', 'bonus', 'payroll') then '5230'
      when p_category_code in ('rent') then '5240'
      when p_category_code in ('packaging') then '5250'
      when p_category_code in ('transport') then '5260'
      when p_category_code in ('promotion', 'marketing', 'platform_fee') then '5270'
      else '5290'
    end;
$$;

create or replace function private.legacy_category_for_emkm(
  p_category_code smallint,
  p_subtype text,
  out o_group text,
  out o_code text
)
language sql
immutable
set search_path = ''
as $$
  select
    case p_category_code
      when 1 then 'sales'
      when 10 then 'sales'
      when 5 then 'cost_of_goods'
      when 8 then 'asset'
      when 6 then case when p_subtype = '5250' then 'cost_of_goods' else 'operating_expense' end
      else 'other'
    end,
    case p_category_code
      when 1 then 'sales_direct'
      when 10 then 'sales_direct'
      when 5 then 'raw_material'
      when 8 then 'equipment'
      when 6 then case p_subtype
        when '5210' then 'utilities'
        when '5220' then 'utilities'
        when '5230' then 'wage'
        when '5240' then 'rent'
        when '5250' then 'packaging'
        when '5260' then 'transport'
        when '5270' then 'promotion'
        else 'other'
      end
      else 'other'
    end;
$$;

revoke all on function private.emkm_category_from_legacy(text, text, text) from public, anon, authenticated;
revoke all on function private.legacy_category_for_emkm(smallint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. RPC buku kas: memposting jurnal dalam transaksi database yang sama
-- ---------------------------------------------------------------------------

drop function if exists public.create_ledger_transaction(text, text, bigint, date, text, text, text, numeric, text, bigint, text, text, text);

create or replace function public.create_ledger_transaction(
  p_idempotency_key text,
  p_transaction_type text,
  p_amount_idr bigint,
  p_transaction_date date,
  p_category_group text,
  p_category_code text,
  p_description text,
  p_quantity numeric default null,
  p_unit text default null,
  p_unit_price_idr bigint default null,
  p_payment_method text default null,
  p_sales_channel text default null,
  p_counterparty text default null,
  p_emkm_category_code smallint default null,
  p_emkm_category_subtype text default null,
  p_counterparty_id uuid default null,
  p_interest_amount_idr bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_category_label text;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text := p_payment_method;
  v_direction text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or p_transaction_type not in ('income', 'expense')
    or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description, ''))) not between 1 and 160
    or (p_quantity is not null and p_quantity <= 0)
    or (p_unit_price_idr is not null and p_unit_price_idr <= 0)
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','edc','credit','unpaid','other'))
    or char_length(coalesce(p_unit, '')) > 40
    or char_length(coalesce(p_sales_channel, '')) > 80
    or char_length(coalesce(p_counterparty, '')) > 120
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > p_amount_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if v_emkm is null then
    select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
    from private.emkm_category_from_legacy(p_transaction_type, p_category_group, p_category_code) as legacy;
  end if;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_existing from public.transactions
  where business_id = v_business_id and idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object('transactionId', v_existing.id, 'idempotent', true);
  end if;

  v_category_label := case p_category_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  insert into public.transactions (
    business_id, user_id, idempotency_key, item, qty, direction, type, amount_idr, nominal,
    category, kategori, category_group, category_code, transaction_date, tanggal, quantity, unit,
    unit_price_idr, payment_method, sales_channel, counterparty, ledger_status,
    emkm_category_code, emkm_category_subtype, counterparty_id, interest_amount_idr, needs_reclass
  ) values (
    v_business_id, v_user_id, trim(p_idempotency_key), trim(p_description),
    coalesce(p_quantity::text || coalesce(' ' || nullif(trim(p_unit), ''), ''), '1'),
    coalesce(v_direction, p_transaction_type),
    case coalesce(v_direction, p_transaction_type) when 'income' then 'masuk' else 'keluar' end,
    p_amount_idr, p_amount_idr, v_category_label, v_category_label, p_category_group, p_category_code,
    p_transaction_date, p_transaction_date, p_quantity, nullif(trim(p_unit), ''), p_unit_price_idr,
    v_payment, nullif(trim(p_sales_channel), ''), nullif(trim(p_counterparty), ''), 'confirmed',
    v_emkm, v_subtype, p_counterparty_id, coalesce(p_interest_amount_idr, 0), false
  ) returning * into v_transaction;

  v_entry_id := public.fn_post_transaction_journal(v_transaction.id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, new_values)
  values (v_transaction.id, v_business_id, v_user_id, 'created', jsonb_build_object(
    'amountIdr', p_amount_idr, 'type', p_transaction_type, 'date', p_transaction_date,
    'categoryCode', p_category_code, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', v_transaction.id, 'idempotent', false, 'journalEntryId', v_entry_id);
end;
$$;

drop function if exists public.update_ledger_transaction(uuid, text, bigint, date, text, text, text, text, numeric, text, bigint, text, text, text);

create or replace function public.update_ledger_transaction(
  p_transaction_id uuid,
  p_transaction_type text,
  p_amount_idr bigint,
  p_transaction_date date,
  p_category_group text,
  p_category_code text,
  p_description text,
  p_reason text,
  p_quantity numeric default null,
  p_unit text default null,
  p_unit_price_idr bigint default null,
  p_payment_method text default null,
  p_sales_channel text default null,
  p_counterparty text default null,
  p_emkm_category_code smallint default null,
  p_emkm_category_subtype text default null,
  p_counterparty_id uuid default null,
  p_interest_amount_idr bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
  v_previous jsonb;
  v_label text;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text := p_payment_method;
  v_direction text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if v_tx.ledger_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_CANCELLED';
  end if;
  if exists (select 1 from public.daily_closings c
             where c.business_id = v_tx.business_id and c.closing_date = v_tx.transaction_date and c.status = 'closed') then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_DATE_CLOSED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;
  if p_transaction_type not in ('income', 'expense')
    or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description, ''))) not between 1 and 160
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','edc','credit','unpaid','other'))
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > p_amount_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_transaction_date <> v_tx.transaction_date and exists (
      select 1 from public.daily_closings c
      where c.business_id = v_tx.business_id and c.closing_date = p_transaction_date and c.status = 'closed') then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_DATE_CLOSED';
  end if;
  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_tx.business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if v_emkm is null then
    select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
    from private.emkm_category_from_legacy(p_transaction_type, p_category_group, p_category_code) as legacy;
  end if;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;

  v_previous := jsonb_build_object('amountIdr', v_tx.amount_idr, 'type', v_tx.direction,
    'date', v_tx.transaction_date, 'categoryCode', v_tx.category_code, 'emkmCategoryCode', v_tx.emkm_category_code);
  v_label := case p_category_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  -- Jurnal tidak pernah diubah: entry lama dibalik, entry baru disusun ulang.
  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, trim(p_reason));
  end if;

  update public.transactions set
    item = trim(p_description),
    direction = coalesce(v_direction, p_transaction_type),
    type = case coalesce(v_direction, p_transaction_type) when 'income' then 'masuk' else 'keluar' end,
    amount_idr = p_amount_idr,
    nominal = p_amount_idr,
    transaction_date = p_transaction_date,
    tanggal = p_transaction_date,
    category_group = p_category_group,
    category_code = p_category_code,
    category = v_label,
    kategori = v_label,
    quantity = p_quantity,
    qty = coalesce(p_quantity::text || coalesce(' ' || nullif(trim(p_unit), ''), ''), '1'),
    unit = nullif(trim(p_unit), ''),
    unit_price_idr = p_unit_price_idr,
    payment_method = v_payment,
    sales_channel = nullif(trim(p_sales_channel), ''),
    counterparty = nullif(trim(p_counterparty), ''),
    emkm_category_code = v_emkm,
    emkm_category_subtype = v_subtype,
    counterparty_id = p_counterparty_id,
    interest_amount_idr = coalesce(p_interest_amount_idr, 0),
    needs_reclass = false,
    journal_entry_id = null,
    updated_at = now()
  where id = p_transaction_id;

  v_entry_id := public.fn_post_transaction_journal(p_transaction_id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, previous_values, new_values)
  values (p_transaction_id, v_tx.business_id, v_user_id, 'updated', trim(p_reason), v_previous,
    jsonb_build_object('amountIdr', p_amount_idr, 'type', p_transaction_type, 'date', p_transaction_date,
      'categoryCode', p_category_code, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', p_transaction_id, 'status', 'confirmed', 'journalEntryId', v_entry_id);
end;
$$;

create or replace function public.cancel_ledger_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;
  if v_tx.ledger_status = 'cancelled' then
    return jsonb_build_object('transactionId', v_tx.id, 'status', 'cancelled', 'idempotent', true);
  end if;

  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, trim(p_reason));
  end if;

  update public.transactions
  set ledger_status = 'cancelled', cancelled_at = now(), cancelled_by = v_user_id, updated_at = now()
  where id = v_tx.id;

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, previous_values)
  values (v_tx.id, v_tx.business_id, v_user_id, 'cancelled', trim(p_reason), jsonb_build_object(
    'amountIdr', v_tx.amount_idr, 'type', v_tx.direction, 'date', v_tx.transaction_date,
    'categoryCode', v_tx.category_code, 'emkmCategoryCode', v_tx.emkm_category_code));

  return jsonb_build_object('transactionId', v_tx.id, 'status', 'cancelled', 'idempotent', false);
end;
$$;

-- Alias roleless dari 0027 diarahkan ke implementasi yang sama.
create or replace function public.cancel_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.cancel_ledger_transaction(p_transaction_id, p_reason);
$$;

-- Menetapkan kategori untuk catatan lama (needs_reclass) lalu memposting jurnal.
create or replace function public.set_transaction_category(
  p_transaction_id uuid,
  p_emkm_category_code smallint,
  p_emkm_category_subtype text default null,
  p_counterparty_id uuid default null,
  p_interest_amount_idr bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text;
  v_direction text;
  v_group text;
  v_code text;
  v_label text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if v_tx.ledger_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_CANCELLED';
  end if;
  if v_emkm is null or v_emkm not between 1 and 10
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > coalesce(v_tx.amount_idr, v_tx.nominal, 0) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_tx.business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_payment := v_tx.payment_method;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;
  select legacy.o_group, legacy.o_code into v_group, v_code
  from private.legacy_category_for_emkm(v_emkm, v_subtype) as legacy;
  v_label := case v_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, 'Perbaikan kategori catatan lama');
  end if;

  update public.transactions set
    emkm_category_code = v_emkm,
    emkm_category_subtype = v_subtype,
    counterparty_id = coalesce(p_counterparty_id, counterparty_id),
    interest_amount_idr = coalesce(p_interest_amount_idr, 0),
    payment_method = v_payment,
    direction = coalesce(v_direction, direction),
    type = case coalesce(v_direction, direction) when 'income' then 'masuk' else 'keluar' end,
    category_group = v_group,
    category_code = v_code,
    category = v_label,
    kategori = v_label,
    needs_reclass = false,
    journal_entry_id = null,
    updated_at = now()
  where id = p_transaction_id;

  v_entry_id := public.fn_post_transaction_journal(p_transaction_id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, new_values)
  values (p_transaction_id, v_tx.business_id, v_user_id, 'adjusted', 'Kategori catatan lama diperbarui pemilik',
    jsonb_build_object('emkmCategoryCode', v_emkm, 'emkmCategorySubtype', v_subtype, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', p_transaction_id, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id);
end;
$$;

revoke all on function public.confirm_transaction_capture(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_transaction_capture(uuid, text, jsonb) to authenticated;
revoke all on function public.create_ledger_transaction(text,text,bigint,date,text,text,text,numeric,text,bigint,text,text,text,smallint,text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.update_ledger_transaction(uuid,text,bigint,date,text,text,text,text,numeric,text,bigint,text,text,text,smallint,text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.cancel_ledger_transaction(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_transaction(uuid, text) from public, anon, authenticated;
revoke all on function public.set_transaction_category(uuid, smallint, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_ledger_transaction(text,text,bigint,date,text,text,text,numeric,text,bigint,text,text,text,smallint,text,uuid,bigint) to authenticated;
grant execute on function public.update_ledger_transaction(uuid,text,bigint,date,text,text,text,text,numeric,text,bigint,text,text,text,smallint,text,uuid,bigint) to authenticated;
grant execute on function public.cancel_ledger_transaction(uuid, text) to authenticated;
grant execute on function public.cancel_transaction(uuid, text) to authenticated;
grant execute on function public.set_transaction_category(uuid, smallint, text, uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Konfirmasi capture: satu transaksi database, sekalian jurnalnya
-- ---------------------------------------------------------------------------
-- Menggantikan versi 0027 yang menulis kolom tidak ada (`profile_id`,
-- `capture_item_index` -> 42703), memakai category_group di luar CHECK
-- (`cogs`/`operations`/`wages`), dan menolak categoryCode yang dikirim
-- aplikasi (`sales`, `materials`, `payroll`).

-- 0027 menulis ulang fungsi ini dengan URUTAN parameter yang berbeda dari
-- 0015, sehingga `create or replace` justru membuat overload kedua alih-alih
-- mengganti yang lama. Kedua versi punya nama parameter yang sama persis, jadi
-- pemanggilan lewat named argument -- yang dipakai aplikasi -- menjadi ambigu
-- dan PostgREST menolaknya. Urutan 0015 dipertahankan sebagai satu-satunya
-- signature, dan overload dari 0027 dibuang.
drop function if exists public.confirm_transaction_capture(uuid, jsonb, text);

create or replace function public.confirm_transaction_capture(
  p_capture_id uuid,
  p_confirmation_idempotency_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_item jsonb;
  v_transaction_ids jsonb := '[]'::jsonb;
  v_transaction_id uuid;
  v_index int := 0;
  v_amount_idr bigint;
  v_transaction_type text;
  v_category_code text;
  v_category_group text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_unit_price_idr bigint;
  v_payment_method text;
  v_sales_channel text;
  v_transaction_date date;
  v_client_item_id text;
  v_emkm smallint;
  v_subtype text;
  v_direction text;
  v_counterparty_name text;
  v_counterparty_id uuid;
  v_counterparty_type text;
  v_interest bigint;
  v_label text;
  v_ai_job_id uuid;
  v_ai_run_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_confirmation_idempotency_key is null or char_length(trim(p_confirmation_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  if v_capture.user_id <> v_user_id and not private.accounting_business_access(v_capture.business_id) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    if v_capture.confirmation_idempotency_key = trim(p_confirmation_idempotency_key) then
      select coalesce(jsonb_agg(transaction_record.id order by transaction_record.created_at, transaction_record.id), '[]'::jsonb)
      into v_transaction_ids
      from public.transactions as transaction_record
      where transaction_record.capture_id = v_capture.id;
      return jsonb_build_object(
        'captureId', v_capture.id,
        'status', 'confirmed',
        'transactionIds', v_transaction_ids,
        'idempotent', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;

  if v_capture.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_CANCELLED';
  end if;
  if v_capture.status not in ('needs_review', 'failed') then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_READY';
  end if;

  for v_item in select jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_client_item_id := nullif(trim(coalesce(v_item->>'clientItemId', '')), '');
    v_transaction_type := lower(trim(coalesce(v_item->>'transactionType', '')));
    v_category_code := lower(trim(coalesce(v_item->>'categoryCode', '')));
    v_description := trim(coalesce(v_item->>'description', ''));
    v_payment_method := nullif(lower(trim(coalesce(v_item->>'paymentMethod', ''))), '');
    v_sales_channel := nullif(trim(coalesce(v_item->>'salesChannel', '')), '');
    v_counterparty_name := nullif(trim(coalesce(v_item->>'counterpartyName', '')), '');

    begin
      v_amount_idr := (v_item->>'amountIdr')::bigint;
      v_transaction_date := (v_item->>'transactionDate')::date;
      v_emkm := nullif(trim(coalesce(v_item->>'emkmCategoryCode', '')), '')::smallint;
      v_interest := coalesce(nullif(trim(coalesce(v_item->>'interestAmountIdr', '')), '')::bigint, 0);
    exception when others then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end;
    v_subtype := nullif(trim(coalesce(v_item->>'emkmCategorySubtype', '')), '');

    if v_transaction_type not in ('income', 'expense')
      or v_amount_idr is null
      or v_amount_idr <= 0
      or v_amount_idr > 100000000000
      or v_transaction_date is null
      or v_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date + interval '1 day'
      or char_length(v_description) not between 1 and 255
      or v_interest < 0
      or v_interest > v_amount_idr
      or v_category_code not in (
        'sales', 'materials', 'operations', 'payroll', 'other',
        'sales_direct', 'sales_delivery', 'sales_catering', 'raw_material', 'packaging',
        'utilities', 'wage', 'rent', 'platform_fee', 'transport', 'equipment', 'promotion',
        'sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other',
        'raw_ingredients', 'inventory', 'marketing', 'maintenance', 'supplies',
        'wages', 'salary', 'bonus', 'tax', 'loan_repayment'
      ) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_quantity := null;
    if v_item ? 'quantity' and (v_item->>'quantity') is not null and trim(v_item->>'quantity') <> '' then
      begin
        v_quantity := (v_item->>'quantity')::numeric;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_quantity <= 0 or v_quantity > 1000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    v_unit := nullif(trim(coalesce(v_item->>'unit', '')), '');
    if v_unit is not null and char_length(v_unit) > 40 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_unit_price_idr := null;
    if v_item ? 'unitPriceIdr' and (v_item->>'unitPriceIdr') is not null and trim(v_item->>'unitPriceIdr') <> '' then
      begin
        v_unit_price_idr := (v_item->>'unitPriceIdr')::bigint;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_unit_price_idr <= 0 or v_unit_price_idr > 100000000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    if v_payment_method is not null and v_payment_method not in ('cash', 'qris', 'bank_transfer', 'ewallet', 'edc', 'credit', 'unpaid', 'other') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_sales_channel is not null and char_length(v_sales_channel) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_counterparty_name is not null and char_length(v_counterparty_name) > 120 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Kategori EMKM adalah sumber kebenaran akun. Bila aplikasi belum
    -- mengirimnya (klien lama), diturunkan dari kategori capture lama.
    if v_emkm is null then
      select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
      from private.emkm_category_from_legacy(v_transaction_type, null::text, v_category_code) as legacy;
    end if;
    select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
    into v_emkm, v_subtype, v_payment_method, v_direction
    from private.normalize_emkm_category(v_emkm, v_subtype, v_payment_method) as normalized;
    select legacy.o_group, legacy.o_code into v_category_group, v_category_code
    from private.legacy_category_for_emkm(v_emkm, v_subtype) as legacy;
    v_label := case v_category_group
      when 'sales' then 'Penjualan'
      when 'cost_of_goods' then 'Bahan & Produksi'
      when 'operating_expense' then 'Operasional'
      when 'asset' then 'Aset'
      else 'Lainnya'
    end;

    v_counterparty_id := null;
    if v_counterparty_name is not null then
      v_counterparty_type := case
        when v_emkm in (3, 10) then 'PELANGGAN'
        when v_emkm = 5 then 'SUPPLIER'
        else 'LAIN'
      end;
      insert into public.counterparties (business_id, name, type, created_by)
      values (v_capture.business_id, v_counterparty_name, v_counterparty_type, v_user_id)
      on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
      returning id into v_counterparty_id;
    end if;

    v_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id, business_id, user_id, capture_id, client_item_id, direction, type,
      amount_idr, nominal, transaction_date, tanggal, category_group, category_code,
      category, kategori, item, qty, quantity, unit, unit_price_idr, payment_method,
      sales_channel, ledger_status, emkm_category_code, emkm_category_subtype,
      counterparty_id, counterparty, interest_amount_idr, needs_reclass, created_at, updated_at
    ) values (
      v_transaction_id, v_capture.business_id, v_user_id, v_capture.id, v_client_item_id,
      v_direction, case v_direction when 'income' then 'masuk' else 'keluar' end,
      v_amount_idr, v_amount_idr, v_transaction_date, v_transaction_date,
      v_category_group, v_category_code, v_label, v_label, v_description,
      coalesce(v_quantity::text || coalesce(' ' || v_unit, ''), '1'),
      v_quantity, v_unit, v_unit_price_idr, v_payment_method, v_sales_channel, 'confirmed',
      v_emkm, v_subtype, v_counterparty_id, v_counterparty_name, v_interest, false, now(), now()
    );

    perform public.fn_post_transaction_journal(v_transaction_id);

    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_transaction_id);
  end loop;

  update public.transaction_captures
  set status = 'confirmed',
      draft_payload = p_items,
      confirmation_idempotency_key = trim(p_confirmation_idempotency_key),
      confirmed_by = v_user_id,
      confirmed_at = now(),
      completed_at = now(),
      updated_at = now()
  where id = v_capture.id;

  -- `ai_jobs` tidak punya kolom `result`, dan status yang sah adalah
  -- queued/running/succeeded/failed/cancelled -- bukan 'completed' seperti
  -- yang ditulis 0027.
  update public.ai_jobs
  set status = 'succeeded',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where capture_id = v_capture.id
    and job_type = 'voice_to_ledger'
    and status not in ('succeeded', 'cancelled');

  -- Seberapa banyak pemilik mengoreksi tebakan AI adalah umpan balik yang
  -- dipakai untuk menilai kualitas ekstraksi (pola 0015).
  select job.id into v_ai_job_id
  from public.ai_jobs as job
  where job.capture_id = v_capture.id and job.job_type = 'voice_to_ledger'
  limit 1;

  if v_ai_job_id is not null then
    select run.id into v_ai_run_id
    from public.ai_runs as run
    where run.job_id = v_ai_job_id
    order by run.attempt_number desc
    limit 1;

    insert into public.ai_feedback (job_id, run_id, user_id, helpful, correction)
    values (
      v_ai_job_id, v_ai_run_id, v_user_id,
      v_capture.draft_payload = p_items,
      jsonb_build_object(
        'changed', v_capture.draft_payload is distinct from p_items,
        'originalItemCount', coalesce(jsonb_array_length(v_capture.draft_payload), 0),
        'reviewedItemCount', jsonb_array_length(v_transaction_ids)
      )
    );
  end if;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_capture.business_id, 'TRANSACTION_CAPTURE_CONFIRMED',
    'transaction_capture', v_capture.id::text,
    jsonb_build_object('transactionIds', v_transaction_ids, 'transactionCount', jsonb_array_length(v_transaction_ids))
  );

  -- Catatan baru mengubah bukti usaha, jadi kesiapan dihitung ulang. 0027
  -- menghilangkan antrean ini; dikembalikan sesuai 0015.
  insert into public.ai_jobs (
    business_id, requested_by, capture_id, job_type, status,
    idempotency_key, input_payload, max_attempts
  ) values (
    v_capture.business_id, v_user_id, v_capture.id,
    'readiness_recalculation', 'queued',
    'capture:' || v_capture.id::text,
    jsonb_build_object('reason', 'ledger_confirmed', 'captureId', v_capture.id),
    3
  )
  on conflict (business_id, job_type, idempotency_key) where business_id is not null
  do nothing;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'confirmed',
    'transactionIds', v_transaction_ids,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Tutup kas: uang yang belum diterima bukan uang di laci
-- ---------------------------------------------------------------------------
-- Perubahan minimal dari 0027: transaksi non-kas baru (kategori 10 dan metode
-- bayar 'unpaid') tidak lagi ikut menghitung kas masuk/keluar harian.

create or replace function public.close_ledger_day(
  p_closing_date date,
  p_opening_cash_idr bigint default null,
  p_physical_cash_idr bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.daily_closings%rowtype;
  v_in bigint;
  v_out bigint;
  v_count int;
  v_expected bigint;
  v_difference bigint;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_closing_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or (p_opening_cash_idr is not null and p_opening_cash_idr < 0)
    or (p_physical_cash_idr is not null and p_physical_cash_idr < 0)
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_closing_date::text, 0));
  select * into v_existing from public.daily_closings
  where business_id = v_business_id and closing_date = p_closing_date for update;
  if found and v_existing.status = 'closed' then
    return jsonb_build_object('closingId', v_existing.id, 'status', 'closed', 'idempotent', true);
  end if;

  select
    coalesce(sum(amount_idr) filter (where direction = 'income' and coalesce(emkm_category_code, 0) <> 10 and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    coalesce(sum(amount_idr) filter (where direction = 'expense' and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    count(*)
  into v_in, v_out, v_count
  from public.transactions
  where business_id = v_business_id and transaction_date = p_closing_date and ledger_status = 'confirmed';

  v_expected := case when p_opening_cash_idr is null then null else p_opening_cash_idr + v_in - v_out end;
  v_difference := case when v_expected is null or p_physical_cash_idr is null then null else p_physical_cash_idr - v_expected end;

  insert into public.daily_closings (
    business_id, closing_date, income_amount_idr, expense_amount_idr, transaction_count, status,
    closed_by, closed_at, opening_cash_idr, system_cash_in_idr, system_cash_out_idr,
    expected_cash_idr, physical_cash_idr, difference_idr, note
  ) values (
    v_business_id, p_closing_date, v_in, v_out, v_count, 'closed', v_user_id, now(),
    p_opening_cash_idr, v_in, v_out, v_expected, p_physical_cash_idr, v_difference, nullif(trim(p_note), '')
  )
  on conflict (business_id, closing_date) do update set
    income_amount_idr = excluded.income_amount_idr,
    expense_amount_idr = excluded.expense_amount_idr,
    transaction_count = excluded.transaction_count,
    status = 'closed',
    closed_by = excluded.closed_by,
    closed_at = now(),
    opening_cash_idr = excluded.opening_cash_idr,
    system_cash_in_idr = excluded.system_cash_in_idr,
    system_cash_out_idr = excluded.system_cash_out_idr,
    expected_cash_idr = excluded.expected_cash_idr,
    physical_cash_idr = excluded.physical_cash_idr,
    difference_idr = excluded.difference_idr,
    note = excluded.note,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'DAILY_CLOSING_COMPLETED', 'daily_closing', v_id::text,
    jsonb_build_object('date', p_closing_date, 'transactionCount', v_count,
      'hasOpeningCash', p_opening_cash_idr is not null, 'hasPhysicalCash', p_physical_cash_idr is not null));

  return jsonb_build_object('closingId', v_id, 'status', 'closed', 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Backfill transaksi lama + jurnalnya
-- ---------------------------------------------------------------------------
-- Spek Bagian 5.2: MASUK -> kategori 1, KELUAR -> kategori 6 subtype 5290,
-- needs_reclass = true. Beranda menampilkan ajakan mengecek kategorinya.

do $$
declare
  v_before_income bigint;
  v_before_expense bigint;
  v_after_income bigint;
  v_after_expense bigint;
  v_unposted int;
  v_unbalanced int;
  v_row record;
begin
  select
    coalesce(sum(amount_idr) filter (where direction = 'income'), 0),
    coalesce(sum(amount_idr) filter (where direction = 'expense'), 0)
  into v_before_income, v_before_expense
  from public.transactions where ledger_status = 'confirmed';

  update public.transactions set
    emkm_category_code = case when direction = 'income' then 1::smallint else 6::smallint end,
    emkm_category_subtype = case when direction = 'income' then null else '5290' end,
    needs_reclass = true
  where emkm_category_code is null
    and business_id is not null
    and coalesce(amount_idr, nominal) > 0
    and direction in ('income', 'expense');

  for v_row in
    select id from public.transactions
    where journal_entry_id is null
      and emkm_category_code is not null
      and business_id is not null
      and ledger_status = 'confirmed'
      and coalesce(amount_idr, nominal) > 0
    order by transaction_date, created_at
  loop
    perform public.fn_post_transaction_journal(v_row.id);
  end loop;

  select
    coalesce(sum(amount_idr) filter (where direction = 'income'), 0),
    coalesce(sum(amount_idr) filter (where direction = 'expense'), 0)
  into v_after_income, v_after_expense
  from public.transactions where ledger_status = 'confirmed';

  if v_before_income <> v_after_income or v_before_expense <> v_after_expense then
    raise exception using errcode = 'P0001',
      message = format('BACKFILL_TOTAL_DRIFT: masuk %s -> %s, keluar %s -> %s',
        v_before_income, v_after_income, v_before_expense, v_after_expense);
  end if;

  select count(*) into v_unposted
  from public.transactions
  where ledger_status = 'confirmed' and business_id is not null
    and emkm_category_code is not null and journal_entry_id is null
    and coalesce(amount_idr, nominal) > 0;
  if v_unposted > 0 then
    raise exception using errcode = 'P0001',
      message = format('BACKFILL_UNPOSTED_TRANSACTIONS: %s', v_unposted);
  end if;

  select count(*) into v_unbalanced from (
    select entry_id from public.journal_lines
    group by entry_id
    having sum(debit) <> sum(credit) or count(*) < 2
  ) as unbalanced;
  if v_unbalanced > 0 then
    raise exception using errcode = 'P0001',
      message = format('BACKFILL_UNBALANCED_ENTRIES: %s', v_unbalanced);
  end if;
end $$;

commit;
