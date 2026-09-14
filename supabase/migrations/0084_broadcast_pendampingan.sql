-- ---------------------------------------------------------------------------
-- 0084 — Broadcast pendampingan: kolom pesan bebas, penyaring keadaan,
--        persetujuan admin, dan daftar peserta yang lahir dari izin
-- ---------------------------------------------------------------------------
-- Langkah 5, dan ini bagian yang mengubah privasi menjadi fitur alih-alih
-- hambatan: dinas tidak butuh identitas untuk menolong. Yang ia butuh adalah
-- UMKM itu datang.
--
--   1. Dinas memilih kohort berdasarkan KEADAAN, bukan nama
--   2. Dinas menulis tawarannya sendiri -- teks bebas, bukan templat
--   3. Admin platform meninjau
--   4. Platform mengantarkannya sebagai pemberitahuan di beranda UMKM
--   5. UMKM menekan "Saya ikut" -> SAAT ITU identitasnya terbuka, dan tercatat
--   6. Dinas melihat: 34 diundang · 11 ikut · 11 nama
--
-- KOHORT DIPUTUSKAN SAAT DISETUJUI, BUKAN SAAT DIMINTA.
--
-- Antara permintaan dan persetujuan bisa lewat beberapa hari, dan selama itu
-- ada usaha yang mulai mencatat atau mengunggah izin. Angka yang dilihat dinas
-- saat menulis pesannya karena itu disimpan sebagai POTRET (`audience_estimate`)
-- dan tidak dipakai untuk mengirim. Yang dipakai mengirim adalah kohort saat
-- disetujui. Bedanya jujur: mengirim ke daftar basi berarti mengundang orang ke
-- pendampingan yang sudah tidak ia butuhkan.
--
-- PINTU KETIGA UNTUK SEL MINIMUM, DAN INI YANG PALING MUDAH TERLEWAT.
--
-- `0082` menjaga angka; `0083` menjaga baris. Jumlah penerima broadcast adalah
-- BACAAN KETIGA atas sel yang sama. Kalau dinas bisa mengirim broadcast ke satu
-- sel lalu membaca "6 diundang", ia mendapat angka yang ringkasan sembunyikan
-- -- lalu 8 dikurangi 6 tetap 2, persis lubang yang `0083` tutup.
--
-- Jadi jumlah penerima memakai keputusan yang SAMA: `private.dinas_region_cells`.
-- Tersembunyi berarti dinas tetap bisa mengirim -- pesannya sampai, dan itu
-- gunanya -- tetapi jumlah yang diundang tidak dilaporkan kepadanya.
--
-- YANG TIDAK DIBATASI SEL MINIMUM: JUMLAH DAN NAMA PESERTA.
--
-- Peserta menekan "Saya ikut". Itu izin yang diberikan orangnya sendiri, jadi
-- namanya memang terbuka dan menyembunyikan jumlahnya tidak melindungi apa pun.
-- Prinsipnya sama dengan usaha berafiliasi di `0080`: pengungkapan atas izin
-- tidak pernah tunduk pada aturan yang melindungi orang yang belum mengizinkan.
--
-- BROADCAST TERBUKA JUGA UNTUK DINAS PENGAMAT.
--
-- Ini satu-satunya jalan Dinas Penanaman Modal pernah melihat sebuah nama, dan
-- jalan itu dibuka UMKM-nya sendiri. Karena itu syaratnya
-- `region_wide_visibility`, BUKAN `can_see_affiliated_identity`.

begin;

-- ---------------------------------------------------------------------------
-- Kuota
-- ---------------------------------------------------------------------------
-- Tanpa kuota, saluran ini akan dipakai sampai kartunya berhenti dibuka. Empat
-- per bulan adalah tebakan awal yang harus dikoreksi setelah sebulan dipakai;
-- angkanya per lembaga supaya bisa dinaikkan tanpa migrasi.

alter table public.institution_entitlements
  add column if not exists broadcast_quota_monthly integer not null default 4;

comment on column public.institution_entitlements.broadcast_quota_monthly is
  'Berapa broadcast per bulan kalender yang boleh diajukan lembaga ini. Dihitung atas permintaan yang menunggu dan yang disetujui.';

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table if not exists public.dinas_broadcasts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  -- Potret wilayah saat diminta. Kalau lembaganya dipindah wilayah setelah
  -- broadcast dikirim, riwayatnya tetap menyebut wilayah yang benar.
  region text not null,
  filter_recording_band text
    check (filter_recording_band is null or filter_recording_band in
      ('Rutin mencatat', 'Mulai rutin', 'Jarang mencatat', 'Belum mulai')),
  filter_legal_complete boolean,
  message text not null,
  event_date date,
  event_place text,
  event_link text,
  -- Potret, bukan dasar pengiriman. Lihat catatan di kepala berkas.
  audience_estimate integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  delivered_at timestamptz,
  delivered_count integer,
  created_at timestamptz not null default now(),
  constraint dinas_broadcasts_message_check
    check (length(btrim(message)) between 20 and 1000)
);

comment on table public.dinas_broadcasts is
  'Tawaran pendampingan dari dinas. Pesannya ditulis dinas sendiri; kohortnya dipilih dari keadaan, bukan dari nama.';

create index if not exists dinas_broadcasts_institution_idx
  on public.dinas_broadcasts (institution_id, created_at desc);
create index if not exists dinas_broadcasts_pending_idx
  on public.dinas_broadcasts (created_at) where status = 'pending';

/**
 * Siapa yang benar-benar diundang, dibekukan saat disetujui.
 *
 * Ada tabel ini supaya "Saya ikut" bisa diperiksa tanpa menghitung ulang
 * keadaan usahanya. Menghitung ulang akan menolak orang yang keadaannya
 * berubah setelah diundang -- ia menerima undangan, menekan ikut, lalu ditolak
 * karena minggu itu ia mulai rajin mencatat. Undangan yang sudah dikirim tidak
 * bisa ditarik diam-diam.
 */
create table if not exists public.dinas_broadcast_recipients (
  broadcast_id uuid not null references public.dinas_broadcasts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  primary key (broadcast_id, business_id)
);

create index if not exists dinas_broadcast_recipients_business_idx
  on public.dinas_broadcast_recipients (business_id);

/**
 * Peristiwa izin, bukan pendaftaran acara.
 *
 * Barisnya tidak pernah dihapus. "Batal ikut" mengisi `left_at`, dan indeks
 * parsial di bawah yang menjaga satu keikutsertaan aktif -- pola yang sama
 * dengan `business_dinas_affiliations` di `0080`, dan alasannya sama: pemilik
 * yang bertanya "siapa yang pernah melihat nama saya" harus tetap mendapat
 * jawaban.
 */
create table if not exists public.dinas_broadcast_participants (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.dinas_broadcasts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index if not exists dinas_broadcast_participants_one_active
  on public.dinas_broadcast_participants (broadcast_id, business_id)
  where left_at is null;

comment on table public.dinas_broadcast_participants is
  'Menekan "Saya ikut" adalah izin: pada detik itu nama pemilik dan nama usahanya terbuka bagi dinas pengundang.';

-- ---------------------------------------------------------------------------
-- RLS: baca sesuai kepentingan, tulis hanya lewat fungsi beralasan
-- ---------------------------------------------------------------------------

alter table public.dinas_broadcasts enable row level security;
alter table public.dinas_broadcast_recipients enable row level security;
alter table public.dinas_broadcast_participants enable row level security;

drop policy if exists dinas_broadcasts_select on public.dinas_broadcasts;
create policy dinas_broadcasts_select on public.dinas_broadcasts
for select to authenticated
using (
  private.institution_role(institution_id) is not null
  or (select private.is_platform_admin())
  or exists (
    select 1 from public.dinas_broadcast_recipients as recipient
    where recipient.broadcast_id = dinas_broadcasts.id
      and private.business_access(recipient.business_id)
  )
);

drop policy if exists dinas_broadcast_recipients_select on public.dinas_broadcast_recipients;
create policy dinas_broadcast_recipients_select on public.dinas_broadcast_recipients
for select to authenticated
using (
  private.business_access(business_id)
  or (select private.is_platform_admin())
);

drop policy if exists dinas_broadcast_participants_select on public.dinas_broadcast_participants;
create policy dinas_broadcast_participants_select on public.dinas_broadcast_participants
for select to authenticated
using (
  private.business_access(business_id)
  or (select private.is_platform_admin())
  or exists (
    select 1 from public.dinas_broadcasts as broadcast
    where broadcast.id = dinas_broadcast_participants.broadcast_id
      and private.institution_role(broadcast.institution_id) is not null
  )
);

grant select on public.dinas_broadcasts to authenticated;
grant select on public.dinas_broadcast_recipients to authenticated;
grant select on public.dinas_broadcast_participants to authenticated;

-- ---------------------------------------------------------------------------
-- Menegakkan, bukan cuma memeriksa
-- ---------------------------------------------------------------------------
-- Penjaga di bawah memeriksa bahwa tabelnya tidak bisa ditulis langsung.
-- Sampai sekarang ia hanya MEMERIKSA, dan berhasil karena kebetulan: proyek
-- Supabase yang lama tidak punya `alter default privileges` yang memberi hak
-- tulis kepada `anon` dan `authenticated` atas setiap tabel baru di `public`.
--
-- Proyek Supabase yang BARU punya itu. Pada proyek demo yang baru dibuat ada
-- 131 hak tulis bawaan seperti itu, sementara di produksi nol -- dan penjaga
-- ini langsung menolak migrasinya, tepat seperti seharusnya.
--
-- Yang salah bukan penjaganya, melainkan bahwa tidak ada yang pernah
-- mencabutnya. Migrasi yang menyatakan sebuah invarian harus IKUT
-- MENEGAKKANNYA; kalau ia hanya memeriksa, ia bergantung pada keadaan
-- lingkungan yang tidak pernah ia atur -- dan lingkungan berikutnya akan
-- berbeda.
--
-- `select` tidak dicabut: tabelnya memang boleh dibaca sesuai kebijakan RLS.
-- Yang dicabut hanya jalan menulis yang melewati fungsi beralasan.
--
-- Catatan tentang dampaknya: RLS sudah menutup penulisan ini walau haknya ada,
-- karena tidak ada satu pun kebijakan tulis pada tabel-tabel itu. Jadi ini
-- pertahanan berlapis, bukan lubang yang sedang bocor -- tetapi lapisan yang
-- diperiksa penjaga harus benar-benar ada, bukan diasumsikan.

revoke insert, update, delete on public.dinas_broadcasts, public.dinas_broadcast_recipients, public.dinas_broadcast_participants
  from public, anon, authenticated;

-- Penting: kebijakan di atas TIDAK memberi jalan tulis. Perhatikan bahwa
-- `dinas_broadcast_recipients` sengaja tidak bisa dibaca lembaga -- lembaga
-- membacanya lewat fungsi yang menerapkan sel minimum. Membaca tabelnya
-- langsung akan melewati aturan itu.

-- ---------------------------------------------------------------------------
-- Koreksi `0083`: penyembunyian pelengkap yang merambat terlalu jauh
-- ---------------------------------------------------------------------------
-- `0083` menerapkan penyembunyian pelengkap pada SETIAP baris dan kolom yang
-- punya satu sel tersembunyi. Itu terlalu kasar, dan uji `db:test` di migrasi
-- ini yang menemukannya: begitu satu pemilik memberi izin afiliasi, aturan itu
-- merambat -- kolom yang jumlahnya sendiri sudah disembunyikan tetap memaksa
-- sel kedua ditutup, lalu barisnya, lalu sel berisi LIMA yang seharusnya
-- terlihat pun tertutup. Dinas kehilangan angka yang tidak melindungi siapa
-- pun.
--
-- Kenapa itu salah, dalam satu kalimat: penyembunyian pelengkap hanya
-- diperlukan ketika jumlah baris atau kolomnya DITERBITKAN. Serangannya adalah
-- "jumlah dikurangi sel-sel yang terlihat"; kalau jumlahnya sendiri tidak
-- pernah keluar, tidak ada yang bisa dikurangkan, dan menutup sel kedua tidak
-- menambah perlindungan apa pun -- ia hanya membuang kegunaan.
--
-- Satu penjaga baru ikut masuk di sini, yang `0083` lewatkan: TOTAL KOTA selalu
-- diterbitkan. Jadi kalau di seluruh tabel hanya ada SATU sel tersembunyi, ia
-- bisa dihitung dari total dikurangi tujuh sel lainnya. Karena itu tidak boleh
-- pernah ada tepat satu sel tersembunyi.
--
-- Perhatikan juga akibatnya pada kata-kata di layar. Sel yang tersembunyi
-- sebagai PELENGKAP bisa bernilai apa saja -- nol, atau enam. Jadi layar tidak
-- boleh menuliskannya "kurang dari 5": itu benar untuk penyembunyian utama dan
-- salah untuk pelengkap. Yang benar adalah "tidak ditampilkan", tanpa
-- menyebutkan besarannya. Membedakan keduanya di layar justru membocorkan:
-- tahu bahwa sebuah sel disembunyikan "karena utama" sama dengan tahu isinya
-- 1 sampai 4.

create or replace function private.dinas_region_cells(
  p_institution_id uuid,
  p_region text
)
returns table (
  urutan_rekam integer,
  urutan_legal integer,
  jumlah integer,
  anonim integer,
  hide boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_min integer := private.min_cell_size();
  v_count integer[] := array_fill(0, array[8]);
  v_anon integer[] := array_fill(0, array[8]);
  v_hide boolean[] := array_fill(false, array[8]);
  v_changed boolean := true;
  v_hidden_count integer;
  v_marginal_anon integer;
  v_marginal_terbit boolean;
  v_smallest integer;
  v_smallest_idx integer;
  v_idx integer;
  v_row record;
  i integer;
  j integer;
begin
  for v_row in
    select
      case private.recording_band(activity.active_days)
        when 'Rutin mencatat' then 1
        when 'Mulai rutin' then 2
        when 'Jarang mencatat' then 3
        else 4
      end as rekam,
      case when private.legal_is_complete(legal.ready_count) then 1 else 2 end as legal_urutan,
      count(*)::integer as banyak,
      count(*) filter (where not affiliation.is_affiliated)::integer as tanpa_afiliasi
    from public.businesses as business
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days
      from public.transactions as transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 29
    ) as activity on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents as document
      where document.business_id = business.id
        and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
        and document.status not in ('rejected', 'archived', 'superseded')
    ) as legal on true
    left join lateral (
      select private.dinas_affiliation_active(business.id, p_institution_id) as is_affiliated
    ) as affiliation on true
    where business.status = 'active'
      and lower(btrim(coalesce(business.location, ''))) = p_region
      and not private.is_demo_business(business.id)
    group by 1, 2
  loop
    v_idx := (v_row.rekam - 1) * 2 + v_row.legal_urutan;
    v_count[v_idx] := v_row.banyak;
    v_anon[v_idx] := v_row.tanpa_afiliasi;
  end loop;

  -- Penyembunyian utama: sel yang anonimnya menyempit.
  for i in 1..8 loop
    if v_anon[i] between 1 and v_min - 1 then
      v_hide[i] := true;
    end if;
  end loop;

  -- Penyembunyian pelengkap, dan HANYA di mana jumlahnya diterbitkan.
  -- Penyembunyian hanya pernah bertambah dan selnya delapan, jadi berhenti.
  while v_changed loop
    v_changed := false;

    -- Empat baris, dua sel masing-masing.
    for i in 1..4 loop
      v_marginal_anon := v_anon[(i - 1) * 2 + 1] + v_anon[(i - 1) * 2 + 2];
      v_marginal_terbit := not (v_marginal_anon between 1 and v_min - 1);
      if v_marginal_terbit and v_hide[(i - 1) * 2 + 1] <> v_hide[(i - 1) * 2 + 2] then
        v_hide[(i - 1) * 2 + 1] := true;
        v_hide[(i - 1) * 2 + 2] := true;
        v_changed := true;
      end if;
    end loop;

    -- Dua kolom, empat sel masing-masing.
    for j in 1..2 loop
      v_marginal_anon := 0;
      v_hidden_count := 0;
      v_smallest := null;
      v_smallest_idx := null;
      for i in 1..4 loop
        v_idx := (i - 1) * 2 + j;
        v_marginal_anon := v_marginal_anon + v_anon[v_idx];
        if v_hide[v_idx] then
          v_hidden_count := v_hidden_count + 1;
        elsif v_smallest is null or v_anon[v_idx] < v_smallest then
          v_smallest := v_anon[v_idx];
          v_smallest_idx := v_idx;
        end if;
      end loop;
      v_marginal_terbit := not (v_marginal_anon between 1 and v_min - 1);
      if v_marginal_terbit and v_hidden_count = 1 and v_smallest_idx is not null then
        v_hide[v_smallest_idx] := true;
        v_changed := true;
      end if;
    end loop;

    -- Seluruh tabel. Total kota SELALU diterbitkan, jadi satu sel tersembunyi
    -- sendirian bisa dihitung dari total dikurangi tujuh sel lainnya. Penjaga
    -- ini yang `0083` lewatkan.
    v_hidden_count := 0;
    v_smallest := null;
    v_smallest_idx := null;
    for i in 1..8 loop
      if v_hide[i] then
        v_hidden_count := v_hidden_count + 1;
      elsif v_smallest is null or v_anon[i] < v_smallest then
        v_smallest := v_anon[i];
        v_smallest_idx := i;
      end if;
    end loop;
    if v_hidden_count = 1 and v_smallest_idx is not null then
      v_hide[v_smallest_idx] := true;
      v_changed := true;
    end if;
  end loop;

  for i in 1..4 loop
    for j in 1..2 loop
      v_idx := (i - 1) * 2 + j;
      urutan_rekam := i;
      urutan_legal := j;
      jumlah := v_count[v_idx];
      anonim := v_anon[v_idx];
      hide := v_hide[v_idx];
      return next;
    end loop;
  end loop;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Kohort: satu definisi, dipakai pratinjau dan pengiriman
-- ---------------------------------------------------------------------------

/**
 * Usaha di sebuah wilayah yang cocok dengan penyaring keadaan.
 *
 * Dipanggil `dinas_broadcast_audience` (untuk menghitung) DAN
 * `admin_review_dinas_broadcast` (untuk mengirim). Ditulis sekali karena dua
 * kueri kembar akan berselisih: dinas melihat 672, lalu 668 yang menerima, dan
 * tidak ada yang bisa menjelaskan empat yang hilang.
 */
create or replace function private.dinas_cohort(
  p_region text,
  p_recording_band text,
  p_legal_complete boolean
)
returns table (business_id uuid)
language sql
stable
security definer
set search_path = ''
as $fn$
  select business.id
  from public.businesses as business
  left join lateral (
    select count(distinct transaction.transaction_date)::integer as active_days
    from public.transactions as transaction
    where transaction.business_id = business.id
      and transaction.transaction_date >= current_date - 29
  ) as activity on true
  left join lateral (
    select count(distinct document.doc_type)::integer as ready_count
    from public.documents as document
    where document.business_id = business.id
      and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
      and document.status not in ('rejected', 'archived', 'superseded')
  ) as legal on true
  where business.status = 'active'
    and lower(btrim(coalesce(business.location, ''))) = p_region
    and not private.is_demo_business(business.id)
    and (p_recording_band is null or private.recording_band(activity.active_days) = p_recording_band)
    and (p_legal_complete is null or private.legal_is_complete(legal.ready_count) = p_legal_complete);
$fn$;

/**
 * Apakah jumlah sebuah kohort boleh dilaporkan kepada lembaga.
 *
 * Ini penjaga pintu ketiga: jumlah penerima broadcast adalah bacaan lain atas
 * sel yang sama dengan yang dijaga `0082` dan `0083`.
 *
 * ATURANNYA SATU KALIMAT, dan sengaja dirumuskan begitu:
 *
 *   Sebuah himpunan sel boleh dihitung bila ringkasan MEMANG SUDAH
 *   melaporkan angka himpunan itu.
 *
 * Percobaan pertama memakai aturan yang lebih kasar -- "tolak bila ada satu
 * saja sel tersembunyi di dalamnya" -- dan itu salah dengan cara yang langsung
 * terlihat di uji: broadcast ke SELURUH kota menjadi tersembunyi, padahal
 * total kota selalu dilaporkan ringkasan dan justru pilihan bawaannya. Aturan
 * yang menahan angka yang sudah terbuka bukan melindungi apa pun; ia hanya
 * membuat fiturnya terasa rusak, dan fitur yang terasa rusak akan dimatikan
 * orang bersama penjaganya.
 *
 * Jadi tiga bentuk permintaan diperlakukan menurut angka yang dilaporkannya:
 *
 *   satu sel      -> selnya sendiri harus terlihat
 *   satu sumbu    -> jumlah barisnya, yang tunduk pada batas anonimnya sendiri
 *   seluruh kota  -> selalu boleh; angka sebesar itu tidak menunjuk siapa pun
 */
create or replace function private.dinas_cohort_countable(
  p_institution_id uuid,
  p_region text,
  p_recording_band text,
  p_legal_complete boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  with terpilih as (
    select cell.jumlah, cell.anonim, cell.hide
    from private.dinas_region_cells(p_institution_id, p_region) as cell
    where (
      p_recording_band is null
      or cell.urutan_rekam = case p_recording_band
        when 'Rutin mencatat' then 1
        when 'Mulai rutin' then 2
        when 'Jarang mencatat' then 3
        else 4 end
    )
    and (
      p_legal_complete is null
      or cell.urutan_legal = case when p_legal_complete then 1 else 2 end
    )
  )
  select case
    -- Seluruh kota: penyebut yang ringkasan selalu terbitkan.
    when p_recording_band is null and p_legal_complete is null then true
    -- Satu sel: keputusan penyembunyiannya sendiri, termasuk penyembunyian
    -- pelengkap -- karena itulah yang menahan pengurangan 8 - 6 = 2.
    when p_recording_band is not null and p_legal_complete is not null then
      not coalesce((select bool_or(terpilih.hide) from terpilih), false)
    -- Satu sumbu: jumlah baris atau kolom, dengan batas anonimnya sendiri.
    else coalesce((select sum(terpilih.anonim) from terpilih), 0)
      not between 1 and private.min_cell_size() - 1
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- Sisi dinas
-- ---------------------------------------------------------------------------

/** Pembantu: wilayah dan kewenangan lembaga aktif pemanggil. */
create or replace function private.dinas_broadcast_context()
returns table (institution_id uuid, region text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_institution uuid;
  v_region text;
  v_region_wide boolean;
begin
  v_institution := public.resolve_my_institution_id(null);

  select
    coalesce(entitlement.region_wide_visibility, false),
    nullif(lower(btrim(coalesce(institution.location, ''))), '')
  into v_region_wide, v_region
  from public.institutions as institution
  left join public.institution_entitlements as entitlement
    on entitlement.institution_id = institution.id
  where institution.id = v_institution;

  -- Broadcast terbuka untuk dinas pengamat juga: ia satu-satunya jalan Dinas
  -- Penanaman Modal pernah melihat sebuah nama, dan jalan itu dibuka UMKM-nya
  -- sendiri. Karena itu syaratnya wilayah, bukan identitas.
  if not coalesce(v_region_wide, false) then
    raise exception using errcode = '42501', message = 'BUKAN_LEMBAGA_BERWILAYAH';
  end if;
  if v_region is null then
    raise exception using errcode = '22023', message = 'WILAYAH_LEMBAGA_BELUM_DIISI';
  end if;

  institution_id := v_institution;
  region := v_region;
  return next;
end;
$fn$;

/** Berapa usaha yang akan menerima, sebelum pesannya ditulis. */
create or replace function public.dinas_broadcast_audience(
  p_recording_band text default null,
  p_legal_complete boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_context record;
  v_countable boolean;
  v_count integer;
begin
  select * into v_context from private.dinas_broadcast_context();

  if p_recording_band is not null and p_recording_band not in
    ('Rutin mencatat', 'Mulai rutin', 'Jarang mencatat', 'Belum mulai') then
    raise exception 'BAND_TIDAK_DIKENAL';
  end if;

  v_countable := private.dinas_cohort_countable(
    v_context.institution_id, v_context.region, p_recording_band, p_legal_complete);

  select count(*)::integer into v_count
  from private.dinas_cohort(v_context.region, p_recording_band, p_legal_complete);

  return jsonb_build_object(
    'region', initcap(v_context.region),
    -- Tersembunyi berarti dinas tetap boleh mengirim -- pesannya sampai, dan
    -- itu gunanya -- tetapi jumlahnya tidak dilaporkan kepadanya.
    'count', case when v_countable then v_count else null end,
    'suppressed', not v_countable,
    'minCell', private.min_cell_size()
  );
end;
$fn$;

/** Mengajukan broadcast. Belum terkirim: admin platform meninjau lebih dulu. */
create or replace function public.request_dinas_broadcast(
  p_message text,
  p_recording_band text default null,
  p_legal_complete boolean default null,
  p_event_date date default null,
  p_event_place text default null,
  p_event_link text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_context record;
  v_actor uuid := (select auth.uid());
  v_profile uuid;
  v_quota integer;
  v_used integer;
  v_count integer;
  v_id uuid;
begin
  select * into v_context from private.dinas_broadcast_context();

  if length(btrim(coalesce(p_message, ''))) < 20 then
    raise exception using errcode = '22023', message = 'PESAN_TERLALU_PENDEK';
  end if;
  if length(btrim(p_message)) > 1000 then
    raise exception using errcode = '22023', message = 'PESAN_TERLALU_PANJANG';
  end if;
  if p_recording_band is not null and p_recording_band not in
    ('Rutin mencatat', 'Mulai rutin', 'Jarang mencatat', 'Belum mulai') then
    raise exception 'BAND_TIDAK_DIKENAL';
  end if;

  select profile.id into v_profile
  from public.profiles as profile
  where profile.auth_user_id = v_actor
  limit 1;
  if v_profile is null then
    raise exception using errcode = '42501', message = 'PROFIL_TIDAK_DITEMUKAN';
  end if;

  select coalesce(entitlement.broadcast_quota_monthly, 4) into v_quota
  from public.institution_entitlements as entitlement
  where entitlement.institution_id = v_context.institution_id;
  v_quota := coalesce(v_quota, 4);

  select count(*)::integer into v_used
  from public.dinas_broadcasts as broadcast
  where broadcast.institution_id = v_context.institution_id
    and broadcast.status in ('pending', 'approved')
    and broadcast.created_at >= date_trunc('month', now());

  if v_used >= v_quota then
    raise exception using errcode = '22023', message = 'KUOTA_BROADCAST_BULAN_INI_HABIS';
  end if;

  select count(*)::integer into v_count
  from private.dinas_cohort(v_context.region, p_recording_band, p_legal_complete);

  if v_count = 0 then
    raise exception using errcode = '22023', message = 'TIDAK_ADA_PENERIMA';
  end if;

  insert into public.dinas_broadcasts (
    institution_id, requested_by, region, filter_recording_band, filter_legal_complete,
    message, event_date, event_place, event_link, audience_estimate
  ) values (
    v_context.institution_id, v_profile, v_context.region, p_recording_band, p_legal_complete,
    btrim(p_message), p_event_date, nullif(btrim(coalesce(p_event_place, '')), ''),
    nullif(btrim(coalesce(p_event_link, '')), ''), v_count
  )
  returning id into v_id;

  insert into public.audit_events (
    actor_user_id, actor_type, institution_id, action, target_type, target_id, metadata
  ) values (
    v_actor, 'user', v_context.institution_id, 'DINAS_BROADCAST_REQUESTED',
    'dinas_broadcast', v_id::text,
    jsonb_build_object('region', v_context.region, 'audienceEstimate', v_count)
  );

  return jsonb_build_object('broadcastId', v_id, 'status', 'pending', 'quotaLeft', v_quota - v_used - 1);
end;
$fn$;

/** Broadcast milik lembaga pemanggil, dengan jumlah yang sudah disaring aturan. */
create or replace function public.list_institution_broadcasts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_context record;
  v_quota integer;
  v_used integer;
begin
  select * into v_context from private.dinas_broadcast_context();

  select coalesce(entitlement.broadcast_quota_monthly, 4) into v_quota
  from public.institution_entitlements as entitlement
  where entitlement.institution_id = v_context.institution_id;
  v_quota := coalesce(v_quota, 4);

  select count(*)::integer into v_used
  from public.dinas_broadcasts as broadcast
  where broadcast.institution_id = v_context.institution_id
    and broadcast.status in ('pending', 'approved')
    and broadcast.created_at >= date_trunc('month', now());

  return jsonb_build_object(
    'region', initcap(v_context.region),
    'quotaMonthly', v_quota,
    'quotaLeft', greatest(v_quota - v_used, 0),
    'minCell', private.min_cell_size(),
    'broadcasts', coalesce((
      select jsonb_agg(entry order by entry."createdAt" desc)
      from (
        select
          broadcast.id as id,
          broadcast.message as message,
          broadcast.filter_recording_band as "recordingBand",
          broadcast.filter_legal_complete as "legalComplete",
          broadcast.event_date as "eventDate",
          broadcast.event_place as "eventPlace",
          broadcast.event_link as "eventLink",
          broadcast.status as status,
          broadcast.review_reason as "reviewReason",
          broadcast.created_at as "createdAt",
          broadcast.delivered_at as "deliveredAt",
          -- Pintu ketiga: jumlah yang diundang hanya keluar bila selnya
          -- terlihat. Keputusannya dari fungsi yang sama dengan ringkasan.
          case when private.dinas_cohort_countable(
                 broadcast.institution_id, broadcast.region,
                 broadcast.filter_recording_band, broadcast.filter_legal_complete)
               then broadcast.delivered_count else null end as "invited",
          not private.dinas_cohort_countable(
            broadcast.institution_id, broadcast.region,
            broadcast.filter_recording_band, broadcast.filter_legal_complete) as "invitedSuppressed",
          -- Peserta TIDAK disembunyikan: mereka menekan "Saya ikut", dan
          -- pengungkapan atas izin tidak tunduk pada aturan yang melindungi
          -- orang yang belum mengizinkan.
          (
            select count(*)::integer from public.dinas_broadcast_participants as participant
            where participant.broadcast_id = broadcast.id and participant.left_at is null
          ) as "joined"
        from public.dinas_broadcasts as broadcast
        where broadcast.institution_id = v_context.institution_id
        order by broadcast.created_at desc
        limit 100
      ) as entry
    ), '[]'::jsonb)
  );
end;
$fn$;

/**
 * Nama peserta sebuah broadcast. Mereka sendiri yang membukanya.
 *
 * Namanya berawalan `list_` dan itu bukan gaya: ada TABEL bernama
 * `dinas_broadcast_participants`, dan fungsi dengan nama yang sama membuat
 * `public.dinas_broadcast_participants(x)` bisa ditafsirkan sebagai pemilihan
 * bidang atas tipe baris tabel itu alih-alih pemanggilan fungsi.
 */
create or replace function public.list_dinas_broadcast_participants(p_broadcast_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_context record;
begin
  select * into v_context from private.dinas_broadcast_context();

  if not exists (
    select 1 from public.dinas_broadcasts as broadcast
    where broadcast.id = p_broadcast_id
      and broadcast.institution_id = v_context.institution_id
  ) then
    raise exception using errcode = '42501', message = 'BROADCAST_BUKAN_MILIK_LEMBAGA_INI';
  end if;

  return coalesce((
    select jsonb_agg(entry order by entry."businessName")
    from (
      select
        business.name as "businessName",
        nullif(coalesce(profile.name, ''), '') as "ownerName",
        coalesce(business.sector, 'Belum diisi') as sector,
        participant.joined_at as "joinedAt"
      from public.dinas_broadcast_participants as participant
      join public.businesses as business on business.id = participant.business_id
      left join public.profiles as profile on profile.id = business.legacy_profile_id
      where participant.broadcast_id = p_broadcast_id
        and participant.left_at is null
    ) as entry
  ), '[]'::jsonb);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Sisi admin platform
-- ---------------------------------------------------------------------------

/** Antrean tinjauan, dengan umurnya -- karena umurnya yang menjadi masalah. */
create or replace function public.admin_pending_broadcasts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  return coalesce((
    select jsonb_agg(entry order by entry."createdAt")
    from (
      select
        broadcast.id as id,
        institution.name as "institutionName",
        broadcast.region as region,
        broadcast.message as message,
        broadcast.filter_recording_band as "recordingBand",
        broadcast.filter_legal_complete as "legalComplete",
        broadcast.event_date as "eventDate",
        broadcast.event_place as "eventPlace",
        broadcast.event_link as "eventLink",
        broadcast.audience_estimate as "audienceEstimate",
        broadcast.created_at as "createdAt",
        -- Kohort dihitung ulang SEKARANG, bukan dibaca dari potret. Admin perlu
        -- melihat berapa yang benar-benar akan menerima kalau ia menyetujuinya
        -- hari ini, bukan berapa yang cocok minggu lalu.
        (select count(*)::integer from private.dinas_cohort(
           broadcast.region, broadcast.filter_recording_band, broadcast.filter_legal_complete)) as "audienceNow"
      from public.dinas_broadcasts as broadcast
      join public.institutions as institution on institution.id = broadcast.institution_id
      where broadcast.status = 'pending'
      order by broadcast.created_at
      limit 200
    ) as entry
  ), '[]'::jsonb);
end;
$fn$;

/**
 * Menyetujui atau menolak, dan bila disetujui: mengirim.
 *
 * Pengiriman terjadi di dalam fungsi ini, bukan di pekerjaan latar. Broadcast
 * yang "sudah disetujui" tetapi belum sampai adalah keadaan yang tidak bisa
 * dijelaskan kepada siapa pun -- dinas melihat disetujui, UMKM tidak menerima
 * apa-apa, dan tidak ada yang tahu di mana ia tersangkut.
 */
create or replace function public.admin_review_dinas_broadcast(
  p_broadcast_id uuid,
  p_approve boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_profile uuid;
  v_broadcast record;
  v_delivered integer := 0;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN_OPS';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'ALASAN_WAJIB';
  end if;

  select * into v_broadcast from public.dinas_broadcasts where id = p_broadcast_id;
  if v_broadcast.id is null then
    raise exception using errcode = '22023', message = 'BROADCAST_TIDAK_DITEMUKAN';
  end if;
  if v_broadcast.status <> 'pending' then
    raise exception using errcode = '22023', message = 'BROADCAST_SUDAH_DITINJAU';
  end if;

  select profile.id into v_profile
  from public.profiles as profile where profile.auth_user_id = v_actor limit 1;

  if not p_approve then
    update public.dinas_broadcasts
    set status = 'rejected', reviewed_by = v_profile, reviewed_at = now(), review_reason = btrim(p_reason)
    where id = p_broadcast_id;

    perform private.write_admin_log(
      v_role, 'DINAS_BROADCAST_REJECTED', p_reason,
      'dinas_broadcast', p_broadcast_id::text, null,
      jsonb_build_object('institutionId', v_broadcast.institution_id)
    );
    return jsonb_build_object('status', 'rejected', 'delivered', 0);
  end if;

  -- Kohort diputuskan DI SINI, bukan saat diminta. Lihat catatan di kepala
  -- berkas: di antara keduanya ada usaha yang keadaannya berubah.
  insert into public.dinas_broadcast_recipients (broadcast_id, business_id)
  select p_broadcast_id, cohort.business_id
  from private.dinas_cohort(
    v_broadcast.region, v_broadcast.filter_recording_band, v_broadcast.filter_legal_complete
  ) as cohort
  on conflict do nothing;

  select count(*)::integer into v_delivered
  from public.dinas_broadcast_recipients where broadcast_id = p_broadcast_id;

  insert into public.notifications (user_id, business_id, notification_type, title, body, data)
  select
    profile.auth_user_id,
    business.id,
    'dinas_broadcast',
    'Tawaran pendampingan dari ' || institution.name,
    v_broadcast.message,
    jsonb_build_object('broadcastId', p_broadcast_id, 'institutionName', institution.name)
  from public.dinas_broadcast_recipients as recipient
  join public.businesses as business on business.id = recipient.business_id
  join public.profiles as profile on profile.id = business.legacy_profile_id
  cross join (select name from public.institutions where id = v_broadcast.institution_id) as institution
  where recipient.broadcast_id = p_broadcast_id
    and profile.auth_user_id is not null;

  update public.dinas_broadcasts
  set status = 'approved', reviewed_by = v_profile, reviewed_at = now(),
      review_reason = btrim(p_reason), delivered_at = now(), delivered_count = v_delivered
  where id = p_broadcast_id;

  perform private.write_admin_log(
    v_role, 'DINAS_BROADCAST_APPROVED', p_reason,
    'dinas_broadcast', p_broadcast_id::text, null,
    jsonb_build_object(
      'institutionId', v_broadcast.institution_id,
      'delivered', v_delivered,
      'audienceEstimate', v_broadcast.audience_estimate
    )
  );

  return jsonb_build_object('status', 'approved', 'delivered', v_delivered);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Sisi UMKM
-- ---------------------------------------------------------------------------

/**
 * Pembantu: usaha pemanggil.
 *
 * `0081` memakai logika yang sama, tetapi ditulis langsung di dalam
 * `set_my_dinas_affiliation`. Jadi saat ini ada DUA salinan, dan itu disebut di
 * sini alih-alih disamarkan: fungsi ini belum menjadi rumah bersama, ia baru
 * menjadi rumah bagi pemakaian yang baru. Menyatukannya berarti menulis ulang
 * fungsi `0081` yang sudah terpasang di produksi, dan itu pekerjaan tersendiri
 * dengan risikonya sendiri -- bukan sesuatu yang dititipkan ke migrasi ini.
 */
create or replace function private.my_business_for_broadcast()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select business.id into v_business
  from public.businesses as business
  where private.business_access(business.id)
  order by business.created_at
  limit 1;
  if v_business is null then
    raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED';
  end if;
  return v_business;
end;
$fn$;

/** Tawaran yang sampai ke usaha pemanggil, beserta keadaan keikutsertaannya. */
create or replace function public.list_my_dinas_broadcasts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  return coalesce((
    select jsonb_agg(entry order by entry."deliveredAt" desc)
    from (
      select
        broadcast.id as id,
        institution.name as "institutionName",
        broadcast.message as message,
        broadcast.event_date as "eventDate",
        broadcast.event_place as "eventPlace",
        broadcast.event_link as "eventLink",
        broadcast.delivered_at as "deliveredAt",
        (
          select participant.joined_at from public.dinas_broadcast_participants as participant
          where participant.broadcast_id = broadcast.id
            and participant.business_id = v_business
            and participant.left_at is null
        ) as "joinedAt"
      from public.dinas_broadcast_recipients as recipient
      join public.dinas_broadcasts as broadcast on broadcast.id = recipient.broadcast_id
      join public.institutions as institution on institution.id = broadcast.institution_id
      where recipient.business_id = v_business
        and broadcast.status = 'approved'
      order by broadcast.delivered_at desc
      limit 50
    ) as entry
  ), '[]'::jsonb);
end;
$fn$;

/**
 * "Saya ikut".
 *
 * Ini bukan pendaftaran acara, melainkan peristiwa izin: pada detik ini nama
 * pemilik dan nama usahanya terbuka bagi dinas pengundang. Karena itu ia
 * tercatat di `audit_events` dengan `actor_type = 'user'` -- yang memberi izin
 * adalah orangnya, bukan sistem.
 */
create or replace function public.join_dinas_broadcast(p_broadcast_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_institution uuid;
  v_institution_name text;
begin
  select broadcast.institution_id, institution.name
  into v_institution, v_institution_name
  from public.dinas_broadcasts as broadcast
  join public.institutions as institution on institution.id = broadcast.institution_id
  where broadcast.id = p_broadcast_id
    and broadcast.status = 'approved';

  if v_institution is null then
    raise exception using errcode = '22023', message = 'BROADCAST_TIDAK_DITEMUKAN';
  end if;

  -- Hanya yang diundang. Tanpa ini, id broadcast yang tersebar menjadi jalan
  -- menyerahkan nama sendiri kepada dinas yang tidak pernah mengundang.
  if not exists (
    select 1 from public.dinas_broadcast_recipients as recipient
    where recipient.broadcast_id = p_broadcast_id and recipient.business_id = v_business
  ) then
    raise exception using errcode = '42501', message = 'TIDAK_DIUNDANG';
  end if;

  if exists (
    select 1 from public.dinas_broadcast_participants as participant
    where participant.broadcast_id = p_broadcast_id
      and participant.business_id = v_business
      and participant.left_at is null
  ) then
    return jsonb_build_object('joined', true, 'institutionName', v_institution_name, 'changed', false);
  end if;

  insert into public.dinas_broadcast_participants (broadcast_id, business_id)
  values (p_broadcast_id, v_business);

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, institution_id, action, target_type, target_id, metadata
  ) values (
    (select auth.uid()), 'user', v_business, v_institution, 'DINAS_BROADCAST_JOINED',
    'dinas_broadcast', p_broadcast_id::text,
    jsonb_build_object('institutionName', v_institution_name)
  );

  return jsonb_build_object('joined', true, 'institutionName', v_institution_name, 'changed', true);
end;
$fn$;

/** "Batal ikut". Namanya keluar dari daftar; riwayatnya tidak dihapus. */
create or replace function public.leave_dinas_broadcast(p_broadcast_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_institution uuid;
  v_changed integer;
begin
  select institution_id into v_institution
  from public.dinas_broadcasts where id = p_broadcast_id;
  if v_institution is null then
    raise exception using errcode = '22023', message = 'BROADCAST_TIDAK_DITEMUKAN';
  end if;

  update public.dinas_broadcast_participants
  set left_at = now()
  where broadcast_id = p_broadcast_id
    and business_id = v_business
    and left_at is null;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, institution_id, action, target_type, target_id
    ) values (
      (select auth.uid()), 'user', v_business, v_institution, 'DINAS_BROADCAST_LEFT',
      'dinas_broadcast', p_broadcast_id::text
    );
  end if;

  return jsonb_build_object('joined', false, 'changed', v_changed > 0);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Izin panggil
-- ---------------------------------------------------------------------------

revoke all on function public.dinas_broadcast_audience(text, boolean) from public, anon;
revoke all on function public.request_dinas_broadcast(text, text, boolean, date, text, text) from public, anon;
revoke all on function public.list_institution_broadcasts() from public, anon;
revoke all on function public.list_dinas_broadcast_participants(uuid) from public, anon;
revoke all on function public.admin_pending_broadcasts() from public, anon;
revoke all on function public.admin_review_dinas_broadcast(uuid, boolean, text) from public, anon;
revoke all on function public.list_my_dinas_broadcasts() from public, anon;
revoke all on function public.join_dinas_broadcast(uuid) from public, anon;
revoke all on function public.leave_dinas_broadcast(uuid) from public, anon;

grant execute on function public.dinas_broadcast_audience(text, boolean) to authenticated;
grant execute on function public.request_dinas_broadcast(text, text, boolean, date, text, text) to authenticated;
grant execute on function public.list_institution_broadcasts() to authenticated;
grant execute on function public.list_dinas_broadcast_participants(uuid) to authenticated;
grant execute on function public.admin_pending_broadcasts() to authenticated;
grant execute on function public.admin_review_dinas_broadcast(uuid, boolean, text) to authenticated;
grant execute on function public.list_my_dinas_broadcasts() to authenticated;
grant execute on function public.join_dinas_broadcast(uuid) to authenticated;
grant execute on function public.leave_dinas_broadcast(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_audience text;
  v_list text;
  v_join text;
  v_review text;
begin
  select proc.prosrc into v_audience from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'dinas_broadcast_audience';

  select proc.prosrc into v_list from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'list_institution_broadcasts';

  select proc.prosrc into v_join from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'join_dinas_broadcast';

  select proc.prosrc into v_review from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'admin_review_dinas_broadcast';

  -- Pintu ketiga: jumlah penerima tidak boleh diuji dengan perbandingan
  -- sendiri. Perbandingan `>= 5` akan melewatkan penyembunyian pelengkap, dan
  -- pasangan barisnya kembali bisa dihitung dengan pengurangan.
  if v_audience not ilike '%dinas_cohort_countable%' then
    raise exception 'PINTU_KETIGA_TERBUKA: pratinjau jumlah penerima tidak memakai keputusan sel bersama.';
  end if;
  if v_list not ilike '%dinas_cohort_countable%' then
    raise exception 'PINTU_KETIGA_TERBUKA: jumlah yang diundang dilaporkan tanpa keputusan sel bersama.';
  end if;

  -- Kohort satu definisi: pratinjau dan pengiriman tidak boleh berselisih.
  if v_audience not ilike '%dinas_cohort(%' or v_review not ilike '%dinas_cohort(%' then
    raise exception 'KOHORT_TERSALIN: pratinjau dan pengiriman harus memakai definisi kohort yang sama.';
  end if;

  -- Undangan adalah syarat, bukan kesopanan: tanpa pemeriksaan ini, id
  -- broadcast yang tersebar menjadi jalan menyerahkan nama sendiri.
  if v_join not ilike '%TIDAK_DIUNDANG%' then
    raise exception 'IKUT_TANPA_DIUNDANG: keikutsertaan tidak memeriksa daftar penerima.';
  end if;

  -- Pengiriman terjadi di dalam tinjauan, bukan ditunda ke pekerjaan latar.
  if v_review not ilike '%public.notifications%' then
    raise exception 'DISETUJUI_TAPI_TIDAK_TERKIRIM: tinjauan tidak mengantarkan pesannya.';
  end if;

  -- Koreksi `0083` harus benar-benar terpasang, bukan hanya dijelaskan di
  -- komentar. Tanpa syarat "jumlahnya diterbitkan", penyembunyian pelengkap
  -- merambat dan menutup sel yang tidak melindungi siapa pun.
  if (
    select proc.prosrc from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'private' and proc.proname = 'dinas_region_cells'
  ) not ilike '%v_marginal_terbit%' then
    raise exception 'PELENGKAP_MERAMBAT: penyembunyian pelengkap tidak memeriksa apakah jumlah barisnya diterbitkan.';
  end if;

  -- Tabel penerima tidak boleh bisa ditulis langsung oleh siapa pun.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('dinas_broadcasts', 'dinas_broadcast_recipients', 'dinas_broadcast_participants')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and lower(grantee) in ('authenticated', 'anon', 'public')
  ) then
    raise exception 'JALUR_TULIS_LANGSUNG: broadcast harus lewat fungsi beralasan, bukan tabel.';
  end if;
end;
$$;

commit;
