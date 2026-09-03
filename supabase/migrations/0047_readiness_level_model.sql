-- ---------------------------------------------------------------------------
-- 0047 — Tingkat Kesiapan: satu model, empat pilar (`wp08-pilot-v2`)
-- ---------------------------------------------------------------------------
-- Angka tunggal 0-100 berhenti dipakai. Yang menggantikannya adalah tingkat
-- berbasis aturan (Mulai / Tembaga / Perak / Emas) di atas sebelas komponen
-- yang masing-masing bisa dijelaskan baris per baris.
--
-- Alasannya bukan selera tampilan. Angka tunggal berbobot tidak bisa dijawab
-- ketika pemilik bertanya "kenapa 62, bukan 63" -- jawabannya selalu berupa
-- rumus yang tidak bisa ia periksa. Aturan terbuka bisa dibacakan: "A1 belum
-- 20 hari, NIB belum ada". Selain itu, satu angka yang menilai sebuah usaha
-- terlalu mudah terbaca sebagai skor kredit, dan itu wilayah yang tidak boleh
-- kita masuki.
--
-- TIGA KEPUTUSAN DI BERKAS INI
--
--   a. **Agregasi di SQL, penilaian di TypeScript.** `fn_readiness_facts`
--      mengembalikan angka mentah -- sebelas fakta, satu perjalanan ke basis
--      data. Yang mengubah fakta menjadi status dan tingkat adalah evaluator
--      murni di TypeScript, yang bisa diuji tanpa basis data sama sekali.
--      Memindahkan aturannya ke SQL akan membuatnya hanya bisa diuji lewat
--      basis data hidup; memindahkan agregasinya ke aplikasi akan membuat satu
--      layar menjadi belasan kueri.
--
--   b. **Ambang ada di konfigurasi, bukan di fungsi ini.** Jendela waktu dan
--      batas rupiah masuk sebagai parameter. Kalau ditanam di sini, mengubah
--      ambang berarti migrasi baru, dan riwayat penilaian lama ikut berubah
--      arti tanpa jejak.
--
--   c. **Konfigurasi terbit tidak bisa diubah diam-diam.** Trigger menolak
--      perubahan isi pada baris berstatus `published`. Tanpa itu, seseorang
--      bisa menggeser ambang dan seluruh riwayat tingkat berubah makna tanpa
--      ada yang bisa menunjukkan kapan.

begin;

-- ---------------------------------------------------------------------------
-- c. Konfigurasi terbit terkunci
-- ---------------------------------------------------------------------------

create or replace function private.readiness_rule_set_is_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Menerbitkan ulang isi yang sama dibiarkan: migrasi yang diputar dua kali
  -- harus tetap bisa berjalan. Yang dilarang adalah isinya berubah.
  if old.status = 'published'
    and (new.rules is distinct from old.rules
      or new.weights is distinct from old.weights
      or new.thresholds is distinct from old.thresholds) then
    raise exception using errcode = 'P0001',
      message = 'READINESS_RULE_SET_FROZEN: terbitkan versi baru, jangan ubah versi yang sudah dipakai';
  end if;
  return new;
end;
$$;

drop trigger if exists readiness_rule_sets_frozen on public.readiness_rule_sets;
create trigger readiness_rule_sets_frozen
  before update on public.readiness_rule_sets
  for each row execute function private.readiness_rule_set_is_frozen();

-- ---------------------------------------------------------------------------
-- Konfigurasi `wp08-pilot-v2`
-- ---------------------------------------------------------------------------
-- Seluruh ambang, jendela, urutan usaha, dan syarat tingkat ada di satu jsonb.
-- Evaluator membacanya; tidak ada satu angka pun yang ditanam di kode.

insert into public.readiness_rule_sets(version, status, rules, weights, thresholds, published_at, effective_at)
values (
  'wp08-pilot-v2',
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
    -- Urutan usaha untuk "langkah paling berdampak": yang paling ringan lebih
    -- dulu. Pemilik yang disodori pekerjaan terberat akan menutup halamannya.
    'effortOrder', jsonb_build_array('C2', 'D1', 'C1_NIB', 'A2', 'A1', 'B3', 'C1_HALAL', 'D2'),
    'components', jsonb_build_object(
      'A1', jsonb_build_object('pillar', 'A', 'partial', 8,  'silver', 20, 'gold', 24),
      'A2', jsonb_build_object('pillar', 'A', 'partial', 4,  'silver', 12, 'gold', 20),
      'A3', jsonb_build_object('pillar', 'A', 'partial', 14, 'silver', 60, 'gold', 90),
      'B1', jsonb_build_object('pillar', 'B', 'partial', 0.70, 'silver', 0.90, 'gold', 0.95),
      'B2', jsonb_build_object('pillar', 'B', 'partial', 1, 'silver', 2, 'gold', 3),
      'B3', jsonb_build_object('pillar', 'B', 'partial', 0.20, 'silver', 0.40, 'gold', 0.70),
      'B4', jsonb_build_object('pillar', 'B', 'partial', 1, 'silver', null, 'gold', 2),
      'C1', jsonb_build_object('pillar', 'C', 'partial', 1, 'silver', 3, 'gold', 4),
      'C2', jsonb_build_object('pillar', 'C', 'partial', 1, 'silver', 4, 'gold', 4),
      'D1', jsonb_build_object('pillar', 'D', 'partial', null, 'silver', 1, 'gold', 1),
      'D2', jsonb_build_object('pillar', 'D', 'partial', 1, 'silver', 3, 'gold', 6),
      'D3', jsonb_build_object('pillar', 'D', 'partial', null, 'silver', null, 'gold', 1)
    ),
    -- Tembaga sengaja hanya empat syarat ringan: tingkat pertama harus bisa
    -- dicapai dalam dua minggu, atau ia berhenti menjadi ajakan.
    'bronze', jsonb_build_object('A1', 8, 'A3', 14, 'D1', 1, 'B1', 0.70),
    'graceDays', 7
  ),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
-- Diterbitkan ulang, bukan dilewati. `0022` mempensiunkan setiap versi selain
-- `wp08-pilot-v1`, jadi memutar ulang migrasi akan meninggalkan v2 berstatus
-- `retired` dan aplikasi kehilangan konfigurasinya. Isinya sama persis, jadi
-- trigger pembeku di atas membiarkannya.
on conflict (version) do update set
  status = 'published',
  rules = excluded.rules,
  published_at = coalesce(public.readiness_rule_sets.published_at, excluded.published_at),
  effective_at = coalesce(public.readiness_rule_sets.effective_at, excluded.effective_at),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Riwayat dan keadaan
-- ---------------------------------------------------------------------------
-- `grace_until` sudah ada sejak sekarang meski masa tenggang baru dikerjakan
-- di R-B; menambah kolom ke tabel yang sudah berisi riwayat jauh lebih mahal
-- daripada menyiapkannya kosong hari ini.

create table if not exists public.readiness_daily (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  snapshot_date date not null,
  level text not null,
  level_since date,
  grace_until date,
  components jsonb not null default '[]'::jsonb,
  formula_version text not null,
  created_at timestamptz not null default now(),
  constraint readiness_daily_level_check check (level in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS')),
  constraint readiness_daily_unique unique (business_id, snapshot_date)
);

create index if not exists readiness_daily_business_idx
  on public.readiness_daily(business_id, snapshot_date desc);

create table if not exists public.business_readiness_state (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  level text not null default 'MULAI',
  level_since date,
  grace_until date,
  formula_version text not null,
  updated_at timestamptz not null default now(),
  constraint business_readiness_state_level_check check (level in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS'))
);

alter table public.readiness_daily enable row level security;
alter table public.business_readiness_state enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'readiness_daily' and policyname = 'readiness_daily_select') then
    create policy readiness_daily_select on public.readiness_daily for select to authenticated
      using (private.accounting_business_access(business_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'business_readiness_state' and policyname = 'business_readiness_state_select') then
    create policy business_readiness_state_select on public.business_readiness_state for select to authenticated
      using (private.accounting_business_access(business_id));
  end if;
end;
$$;

revoke all on public.readiness_daily from anon, authenticated;
revoke all on public.business_readiness_state from anon, authenticated;
grant select on public.readiness_daily to authenticated;
grant select on public.business_readiness_state to authenticated;

-- ---------------------------------------------------------------------------
-- a. Fakta mentah — satu perjalanan ke basis data
-- ---------------------------------------------------------------------------

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
-- Menyimpan hasil
-- ---------------------------------------------------------------------------
-- Tidak ada penjadwal di repo ini, jadi tidak ada job harian. Potretnya
-- ditulis saat halaman dibaca -- idempoten per tanggal. Untuk pemilik yang
-- membuka aplikasinya, hasilnya sama persis dengan job harian; untuk yang
-- tidak membuka, tidak ada seorang pun yang dirugikan oleh potret yang absen.
--
-- Ini juga yang menyelesaikan evaluasi retroaktif: akun lama mendapat tingkat
-- sesuai datanya pada pembacaan pertama, tanpa perlu proses massal.

create or replace function public.save_readiness_snapshot(
  p_level text,
  p_components jsonb,
  p_formula_version text,
  p_snapshot_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_date date;
  v_state public.business_readiness_state%rowtype;
  v_level_since date;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;
  if p_level not in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_date := coalesce(p_snapshot_date, (now() at time zone 'Asia/Jakarta')::date);
  select * into v_state from public.business_readiness_state where business_id = v_business_id for update;

  -- Tanggal naik tingkat dipertahankan selama tingkatnya tidak berubah, supaya
  -- "Perak sejak 12 Agustus" tidak berubah setiap hari.
  v_level_since := case
    when found and v_state.level = p_level then coalesce(v_state.level_since, v_date)
    else v_date
  end;

  insert into public.readiness_daily (
    business_id, snapshot_date, level, level_since, grace_until, components, formula_version
  ) values (
    v_business_id, v_date, p_level, v_level_since,
    case when found then v_state.grace_until else null end,
    coalesce(p_components, '[]'::jsonb), p_formula_version
  )
  on conflict (business_id, snapshot_date) do update set
    level = excluded.level,
    level_since = excluded.level_since,
    components = excluded.components,
    formula_version = excluded.formula_version;

  insert into public.business_readiness_state (
    business_id, level, level_since, formula_version, updated_at
  ) values (v_business_id, p_level, v_level_since, p_formula_version, now())
  on conflict (business_id) do update set
    level = excluded.level,
    level_since = excluded.level_since,
    formula_version = excluded.formula_version,
    updated_at = now();

  return jsonb_build_object('ok', true, 'level', p_level, 'levelSince', v_level_since);
end;
$$;

revoke execute on function public.fn_readiness_facts(date, integer, integer, integer, bigint, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.save_readiness_snapshot(text, jsonb, text, date)
  from public, anon, authenticated;
grant execute on function public.fn_readiness_facts(date, integer, integer, integer, bigint, integer, integer)
  to authenticated;
grant execute on function public.save_readiness_snapshot(text, jsonb, text, date) to authenticated;

commit;
