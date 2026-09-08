-- ---------------------------------------------------------------------------
-- 0069 — Ruang Mesin: peran admin, catatan tindakan, dan meja kerjanya
-- ---------------------------------------------------------------------------
-- Fondasi portal admin (Tahap Adm-A). Yang dibangun di sini bukan layarnya,
-- melainkan tiga hal yang harus benar sebelum satu layar pun boleh menulis:
-- siapa yang boleh, apa yang tercatat, dan apa yang tidak bisa dihapus.
--
-- EMPAT PENYESUAIAN TERHADAP SPEKNYA, DENGAN ALASANNYA.
--
-- 1. TIDAK ADA TABEL `admin_users`. Speknya menyebutnya, tetapi `platform_admins`
--    (`0013`) sudah persis itu: siapa yang admin, statusnya, dan asal-usulnya.
--    Ia sudah menjadi sandaran `private.is_platform_admin()`, yang dipakai
--    puluhan kebijakan RLS di seluruh basis data. Menambah tabel kedua berarti
--    dua daftar admin yang bisa berselisih, dan yang kalah dalam perselisihan
--    itu adalah yang dipakai RLS -- pintu masuknya. Jadi `platform_admins`
--    tetap satu-satunya jawaban atas "siapa admin", dan `admin_roles` di bawah
--    ini hanya menjawab pertanyaan yang berbeda: "boleh apa".
--
-- 2. TIDAK ADA KOLOM `account_status`. `businesses.status` sudah ada, sudah
--    dibatasi ('active','inactive','suspended','archived'), dan `suspended`
--    sudah memblokir masuk -- `getEffectivePortalRole` menuntut 'active'.
--    Menambah kolom status kedua berarti dua kolom yang bisa berbeda pendapat
--    soal akun yang sama, dan tidak ada aturan yang bisa memutuskan mana yang
--    benar. Yang ditambahkan hanya keterangannya: alasan, oleh siapa, kapan.
--
--    Dari enam status yang diminta spek v1.1 §2.1, hanya SATU yang benar-benar
--    perlu disimpan. PASIF 7+/30+ dihitung dari transaksi terakhir, DEMO dari
--    `demo_accounts`, TENGGANG-HAPUS dari penjadwalan hapus akun yang sudah
--    ada. Menyimpan status turunan berarti menyimpan angka yang bisa basi.
--
-- 3. `support_sessions` TIDAK BISA DIUBAH SAMA SEKALI, termasuk untuk
--    mengakhirinya lebih awal. Kedaluwarsanya dihitung dari `expires_at` yang
--    ditetapkan saat lahir. Baris yang bisa di-`update` untuk "mengakhiri"
--    membuka satu-satunya jalan yang juga bisa dipakai untuk MEMPERPANJANG,
--    dan tiket 30 menit yang bisa diperpanjang bukan tiket.
--
-- 4. PENJAGA "MINIMAL DUA SUPER_ADMIN" DITEGAKKAN SEBAGAI "TIDAK BOLEH NOL".
--    Menuntut selalu ada dua membuat pemasangan pertama mustahil: dari nol,
--    admin pertama tidak akan pernah bisa menjadi yang kedua. Yang ditegakkan
--    basis data adalah yang memang mutlak -- pencabutan yang menyisakan nol
--    SUPER_ADMIN ditolak, dan itu mencakup kasus yang spek sebut ("yang
--    terakhir tidak bisa menonaktifkan dirinya"). Anjuran dua orang tetap
--    berlaku, tempatnya di layar, bukan di sini.
--
-- YANG TIDAK BOLEH DILAKUKAN RUTE ADMIN, dan karena itu tidak diberi jalan di
-- migrasi ini: menyentuh `journal_entries`, `journal_lines`, atau
-- `transactions`. Perbaikan data hanya lewat fungsi jalur resmi yang sudah ada
-- (pembalikan, reklasifikasi, hitung ulang). Tidak ada satu pun fungsi di
-- bawah ini yang menulis ke ketiganya.

begin;

-- ---------------------------------------------------------------------------
-- Peran
-- ---------------------------------------------------------------------------

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  constraint admin_roles_role_check check (role in ('SUPER_ADMIN', 'OPS', 'PENDAMPING'))
);

-- Satu peran aktif sekali saja per orang. Indeks parsial, bukan unique biasa:
-- peran yang pernah dicabut harus tetap tersimpan sebagai riwayat, dan boleh
-- diberikan lagi nanti.
create unique index if not exists admin_roles_active_idx
  on public.admin_roles(user_id, role)
  where revoked_at is null;

create index if not exists admin_roles_lookup_idx
  on public.admin_roles(user_id)
  where revoked_at is null;

comment on table public.admin_roles is
  'Lapisan kemampuan di atas platform_admins. platform_admins menjawab "siapa admin", tabel ini menjawab "boleh apa".';

/**
 * Peran yang sedang dipegang pemanggil.
 *
 * Menuntut `is_platform_admin()` juga, bukan hanya barisnya: peran yang
 * tertinggal pada akun yang sudah dicabut status adminnya tidak boleh
 * menghidupkan apa pun.
 */
create or replace function private.has_admin_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.is_platform_admin() and exists (
    select 1
    from public.admin_roles as granted
    where granted.user_id = (select auth.uid())
      and granted.role = p_role
      and granted.revoked_at is null
  );
$fn$;

create or replace function private.active_super_admin_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::int
  from public.admin_roles as granted
  join public.platform_admins as administrator
    on administrator.user_id = granted.user_id and administrator.status = 'active'
  where granted.role = 'SUPER_ADMIN' and granted.revoked_at is null;
$fn$;

-- ---------------------------------------------------------------------------
-- Catatan tindakan — hanya bisa bertambah
-- ---------------------------------------------------------------------------

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  -- Peran yang DIPILIH saat bertindak, bukan seluruh peran yang dimiliki.
  -- Admin bisa memegang lebih dari satu; yang perlu dipertanggungjawabkan
  -- adalah topi yang ia pakai saat menekan tombolnya.
  acting_role text not null,
  action text not null,
  target_type text,
  target_id text,
  business_id uuid references public.businesses(id) on delete set null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint admin_action_logs_reason_check check (length(btrim(reason)) >= 3),
  constraint admin_action_logs_role_check check (acting_role in ('SUPER_ADMIN', 'OPS', 'PENDAMPING'))
);

create index if not exists admin_action_logs_actor_idx
  on public.admin_action_logs(actor_user_id, occurred_at desc);
create index if not exists admin_action_logs_business_idx
  on public.admin_action_logs(business_id, occurred_at desc)
  where business_id is not null;

comment on table public.admin_action_logs is
  'Append-only. Alasan wajib minimal 3 huruf; ditulis dalam transaksi yang sama dengan tindakannya.';

-- ---------------------------------------------------------------------------
-- Mode Dukungan — tiket 30 menit
-- ---------------------------------------------------------------------------

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint support_sessions_reason_check check (length(btrim(reason)) >= 3),
  constraint support_sessions_window_check check (expires_at > started_at)
);

create index if not exists support_sessions_business_idx
  on public.support_sessions(business_id, started_at desc);
create index if not exists support_sessions_admin_idx
  on public.support_sessions(admin_user_id, started_at desc);

comment on table public.support_sessions is
  'Tiket baca 30 menit. Tidak bisa diubah: memperpanjang harus berarti membuka tiket baru yang tercatat.';

/**
 * Menolak UPDATE dan DELETE.
 *
 * Dipasang sebagai trigger, bukan sekadar tidak diberi hak: `service_role`
 * memegang seluruh hak atas skema `public` (lihat `0062`), dan seluruh kode
 * sisi server berjalan sebagai peran itu. Tanpa trigger, catatan yang tidak
 * bisa dihapus hanya berlaku bagi yang memang tidak punya hak menghapusnya --
 * yaitu semua orang kecuali yang benar-benar berbahaya.
 */
create or replace function private.reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  raise exception using
    errcode = '42501',
    message = format('CATATAN_TIDAK_BISA_DIUBAH: %s hanya bisa bertambah.', tg_table_name);
end;
$fn$;

drop trigger if exists admin_action_logs_append_only on public.admin_action_logs;
create trigger admin_action_logs_append_only
  before update or delete on public.admin_action_logs
  for each row execute function private.reject_mutation();

drop trigger if exists support_sessions_append_only on public.support_sessions;
create trigger support_sessions_append_only
  before update or delete on public.support_sessions
  for each row execute function private.reject_mutation();

-- ---------------------------------------------------------------------------
-- Sakelar fitur
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flags (
  flag_key text primary key,
  description text not null,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flag_overrides (
  flag_key text not null references public.feature_flags(flag_key) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  enabled boolean not null,
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (flag_key, business_id)
);

-- Kuncinya diisi di sini karena tabel sakelar tanpa sakelarnya tidak berarti
-- apa-apa, dan kelimanya sudah bernama di spek. Nilai awal = keadaan produk
-- hari ini; kamera masih mati karena layarnya memang belum ada.
insert into public.feature_flags (flag_key, description, enabled) values
  ('capture_voice',       'Catat dengan suara di layar Catat',                 true),
  ('capture_camera',      'Catat dengan foto nota (jalur OCR)',                false),
  ('caption_live',        'Teks berjalan saat merekam suara',                  true),
  ('pdf_export',          'Unduh laporan sebagai PDF',                         true),
  ('discovery_institusi', 'Usaha bersedia ditemukan lembaga sebagai kandidat', true)
on conflict (flag_key) do nothing;

/**
 * Nilai sakelar untuk sebuah usaha: penyimpangan per akun menang atas global.
 *
 * Dipakai kode produk, bukan hanya layar admin -- karena itu terbuka bagi
 * `authenticated`, sementara MENGUBAHNYA tetap tertutup.
 */
create or replace function public.feature_flag_enabled(p_flag_key text, p_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (
      select override.enabled
      from public.feature_flag_overrides as override
      where override.flag_key = p_flag_key and override.business_id = p_business_id
    ),
    (select flag.enabled from public.feature_flags as flag where flag.flag_key = p_flag_key),
    false
  );
$fn$;

revoke all on function public.feature_flag_enabled(text, uuid) from public, anon;
grant execute on function public.feature_flag_enabled(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Akun demo
-- ---------------------------------------------------------------------------

create table if not exists public.demo_accounts (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  fixture_key text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.demo_accounts is
  'Satu-satunya jawaban atas "akun ini demo". Tidak ada kolom is_demo -- dua tempat berarti dua jawaban.';

/**
 * Penjaga ganda yang diminta spek: akun yang tidak terdaftar di sini tidak bisa
 * direset, dan pemeriksaannya tidak boleh bergantung pada layar yang memanggil.
 */
create or replace function private.is_demo_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.demo_accounts as demo where demo.business_id = p_business_id
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Konfigurasi ber-versi
-- ---------------------------------------------------------------------------

create table if not exists public.config_versions (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  version integer not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  change_note text,
  gate_report jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  -- Penerbitan darurat oleh SUPER_ADMIN boleh melewati aturan dua orang, tetapi
  -- tidak boleh melewati pencatatan. Alasannya wajib, dan barisnya menandai
  -- dirinya sendiri sebagai pengecualian.
  emergency boolean not null default false,
  emergency_reason text,
  constraint config_versions_domain_check
    check (domain in ('CATEGORY_COA', 'PARSER', 'SYSTEM_TEXTS', 'READINESS')),
  constraint config_versions_status_check
    check (status in ('draft', 'in_review', 'published', 'superseded')),
  constraint config_versions_emergency_check
    check (not emergency or length(btrim(coalesce(emergency_reason, ''))) >= 3),
  unique (domain, version)
);

create unique index if not exists config_versions_published_idx
  on public.config_versions(domain)
  where status = 'published';

comment on table public.config_versions is
  'Draft -> tinjau -> terbit. READINESS tidak menyimpan payload di sini: readiness_rule_sets sudah ber-versi, domain ini hanya membungkusnya (lihat 0005).';

-- ---------------------------------------------------------------------------
-- Meja kerja dasbor
-- ---------------------------------------------------------------------------

create table if not exists public.ops_daily_rollups (
  metric_date date not null,
  metric_key text not null,
  dims jsonb not null default '{}'::jsonb,
  value numeric not null,
  computed_at timestamptz not null default now(),
  primary key (metric_date, metric_key, dims)
);

comment on table public.ops_daily_rollups is
  'Agregat lintas akun. Tidak pernah memuat rupiah per akun UMKM; agregat lintas platform (mis. biaya AI) boleh.';

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  entity text not null default 'umkm',
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  constraint saved_views_entity_check check (entity in ('umkm', 'institution', 'capture')),
  unique (owner_admin_id, entity, name)
);

create table if not exists public.metric_definitions (
  metric_key text primary key,
  title text not null,
  formula_text text not null,
  source_note text not null,
  unit text not null default 'count',
  -- Metrik yang belum punya sumber tetap didaftarkan, dengan penanda ini.
  -- Kartunya menampilkan "Belum diukur"; angka contoh dilarang, dan cara
  -- termurah menegakkannya adalah membuat "belum ada sumber" bisa dinyatakan.
  measurable boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint metric_definitions_unit_check check (unit in ('count', 'percent', 'idr', 'ms', 'ratio'))
);

comment on table public.metric_definitions is
  'Setiap KPI di dasbor wajib punya barisnya. Menu tiga-titik menampilkan formula_text apa adanya.';

-- ---------------------------------------------------------------------------
-- Keterangan status akun usaha
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column if not exists status_reason text,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

comment on column public.businesses.status_reason is
  'Kenapa statusnya begini. Wajib diisi saat pembekuan lewat admin_set_business_status.';

-- ---------------------------------------------------------------------------
-- Jalur tulis: setiap tindakan menulis catatannya dalam transaksi yang sama
-- ---------------------------------------------------------------------------

/**
 * Menulis satu baris catatan tindakan.
 *
 * Bukan fungsi terpisah yang boleh dipanggil sendiri: ia dipanggil DARI DALAM
 * fungsi tindakan, jadi tindakan dan catatannya berbagi satu transaksi. Kalau
 * salah satunya gagal, keduanya tidak terjadi. Catatan yang ditulis panggilan
 * kedua dari aplikasi bisa hilang persis ketika ia paling dibutuhkan -- saat
 * ada yang salah di antara keduanya.
 */
create or replace function private.write_admin_log(
  p_acting_role text,
  p_action text,
  p_reason text,
  p_target_type text default null,
  p_target_id text default null,
  p_business_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_log_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'ALASAN_WAJIB';
  end if;

  insert into public.admin_action_logs (
    actor_user_id, acting_role, action, target_type, target_id, business_id, reason, metadata
  ) values (
    v_actor, p_acting_role, p_action, p_target_type, p_target_id, p_business_id,
    btrim(p_reason), coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$fn$;

/**
 * Memberi peran.
 *
 * Dua kunci untuk SUPER_ADMIN: hanya SUPER_ADMIN lain yang boleh memberikannya,
 * dan tidak kepada dirinya sendiri. Pengecualian pemasangan pertama: selama
 * belum ada satu pun SUPER_ADMIN aktif, admin platform mana pun boleh membuat
 * yang pertama -- tanpa itu, sistem yang baru dipasang tidak punya jalan
 * keluar dari nol.
 */
create or replace function public.admin_grant_role(
  p_user_id uuid,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_bootstrap boolean;
  v_role_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  if p_role not in ('SUPER_ADMIN', 'OPS', 'PENDAMPING') then
    raise exception using errcode = '22023', message = 'PERAN_TIDAK_DIKENAL';
  end if;
  if not exists (
    select 1 from public.platform_admins as administrator
    where administrator.user_id = p_user_id and administrator.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'BUKAN_ADMIN_AKTIF';
  end if;

  v_bootstrap := private.active_super_admin_count() = 0;

  -- Memberi peran adalah pekerjaan SUPER_ADMIN, apa pun peran yang diberikan.
  -- Kalau OPS boleh mengangkat OPS, satu akun yang jebol cukup untuk
  -- memperbanyak dirinya sendiri sampai sebanyak yang ia mau.
  if not v_bootstrap and not private.has_admin_role('SUPER_ADMIN') then
    raise exception using errcode = '42501', message = 'BUTUH_SUPER_ADMIN';
  end if;

  -- Dua kunci: SUPER_ADMIN tidak lahir dari tangannya sendiri.
  if p_role = 'SUPER_ADMIN' and not v_bootstrap and p_user_id = v_actor then
    raise exception using errcode = '42501', message = 'SUPER_ADMIN_TIDAK_BOLEH_MENGANGKAT_DIRI';
  end if;

  insert into public.admin_roles (user_id, role, granted_by)
  values (p_user_id, p_role, v_actor)
  on conflict do nothing
  returning id into v_role_id;

  if v_role_id is null then
    raise exception using errcode = '23505', message = 'PERAN_SUDAH_DIPEGANG';
  end if;

  perform private.write_admin_log(
    'SUPER_ADMIN', 'ADMIN_ROLE_GRANTED', p_reason, 'admin_role', v_role_id::text, null,
    jsonb_build_object('userId', p_user_id, 'role', p_role, 'bootstrap', v_bootstrap)
  );

  return jsonb_build_object('roleId', v_role_id, 'role', p_role, 'bootstrap', v_bootstrap);
end;
$fn$;

/**
 * Mencabut peran.
 *
 * Satu penolakan mutlak: pencabutan yang menyisakan nol SUPER_ADMIN aktif.
 * Ini mencakup kasus yang diminta spek -- SUPER_ADMIN terakhir mencabut
 * perannya sendiri -- tetapi juga menutup jalan yang lebih mudah terlewat:
 * dua SUPER_ADMIN saling mencabut sampai habis.
 */
create or replace function public.admin_revoke_role(
  p_user_id uuid,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_role_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  -- Sama seperti pemberian: mencabut peran juga pekerjaan SUPER_ADMIN.
  if not private.has_admin_role('SUPER_ADMIN') then
    raise exception using errcode = '42501', message = 'BUTUH_SUPER_ADMIN';
  end if;

  select id into v_role_id
  from public.admin_roles
  where user_id = p_user_id and role = p_role and revoked_at is null;

  if v_role_id is null then
    raise exception using errcode = '22023', message = 'PERAN_TIDAK_DIPEGANG';
  end if;

  if p_role = 'SUPER_ADMIN' and private.active_super_admin_count() <= 1 then
    raise exception using errcode = '42501', message = 'SUPER_ADMIN_TERAKHIR';
  end if;

  update public.admin_roles
  set revoked_at = now(), revoked_by = v_actor
  where id = v_role_id;

  perform private.write_admin_log(
    'SUPER_ADMIN', 'ADMIN_ROLE_REVOKED', p_reason, 'admin_role', v_role_id::text, null,
    jsonb_build_object('userId', p_user_id, 'role', p_role)
  );

  return jsonb_build_object('roleId', v_role_id, 'role', p_role);
end;
$fn$;

/**
 * Membekukan atau mengaktifkan kembali akun usaha.
 *
 * Membekukan cukup OPS; membuka bekuan menuntut SUPER_ADMIN -- persis
 * asimetri yang diminta spek §3.1, dan asimetri yang benar: menghentikan
 * sesuatu yang mencurigakan harus cepat, mengembalikannya harus disengaja.
 *
 * Datanya tidak disentuh sama sekali. Yang berubah hanya `status`, dan
 * `getEffectivePortalRole` yang menuntut 'active' yang memblokir masuknya.
 */
create or replace function public.admin_set_business_status(
  p_business_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_previous text;
  v_role text;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'STATUS_TIDAK_DIIZINKAN';
  end if;

  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN_OPS';
  end if;
  if p_status = 'active' and v_role <> 'SUPER_ADMIN' then
    raise exception using errcode = '42501', message = 'BUKA_BEKUAN_BUTUH_SUPER_ADMIN';
  end if;

  select status into v_previous from public.businesses where id = p_business_id;
  if v_previous is null then
    raise exception using errcode = '22023', message = 'USAHA_TIDAK_DITEMUKAN';
  end if;

  update public.businesses
  set status = p_status,
      status_reason = btrim(p_reason),
      status_changed_by = v_actor,
      status_changed_at = now(),
      updated_at = now()
  where id = p_business_id;

  perform private.write_admin_log(
    v_role,
    case when p_status = 'suspended' then 'BUSINESS_FROZEN' else 'BUSINESS_UNFROZEN' end,
    p_reason, 'business', p_business_id::text, p_business_id,
    jsonb_build_object('from', v_previous, 'to', p_status)
  );

  return jsonb_build_object('businessId', p_business_id, 'from', v_previous, 'to', p_status);
end;
$fn$;

/**
 * Membuka Mode Dukungan: tiket baca 30 menit atas satu akun usaha.
 *
 * Yang membuat tiket ini bukan formalitas: barisnya terlihat oleh pemilik
 * usaha yang bersangkutan (lihat kebijakan RLS di bawah). Admin yang membuka
 * catatan seseorang tahu bahwa orang itu akan melihat kapan dan kenapa.
 */
create or replace function public.start_support_session(
  p_business_id uuid,
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
  v_session_id uuid;
  v_expires timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 when private.has_admin_role('PENDAMPING') then 'PENDAMPING'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception using errcode = '22023', message = 'USAHA_TIDAK_DITEMUKAN';
  end if;

  v_expires := now() + interval '30 minutes';

  insert into public.support_sessions (admin_user_id, business_id, reason, expires_at)
  values (v_actor, p_business_id, btrim(p_reason), v_expires)
  returning id into v_session_id;

  perform private.write_admin_log(
    v_role, 'SUPPORT_SESSION_OPENED', p_reason, 'support_session', v_session_id::text, p_business_id,
    jsonb_build_object('expiresAt', v_expires)
  );

  return jsonb_build_object('sessionId', v_session_id, 'expiresAt', v_expires);
end;
$fn$;

/**
 * Apakah pemanggil sedang memegang tiket yang masih hidup atas usaha ini.
 *
 * Dipakai rute Mode Dukungan sebelum membaca apa pun. Kedaluwarsanya dihitung,
 * tidak disimpan sebagai status -- tidak ada yang perlu ingat menutupnya.
 */
create or replace function private.has_live_support_session(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.support_sessions as session_row
    where session_row.business_id = p_business_id
      and session_row.admin_user_id = (select auth.uid())
      and session_row.expires_at > now()
  );
$fn$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.admin_roles enable row level security;
alter table public.admin_action_logs enable row level security;
alter table public.support_sessions enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;
alter table public.demo_accounts enable row level security;
alter table public.config_versions enable row level security;
alter table public.ops_daily_rollups enable row level security;
alter table public.saved_views enable row level security;
alter table public.metric_definitions enable row level security;

drop policy if exists admin_roles_select on public.admin_roles;
create policy admin_roles_select on public.admin_roles for select to authenticated
using (private.is_platform_admin());

drop policy if exists admin_action_logs_select on public.admin_action_logs;
create policy admin_action_logs_select on public.admin_action_logs for select to authenticated
using (private.is_platform_admin());

-- Satu-satunya tabel admin yang dilihat bukan-admin, dan itu memang maksudnya:
-- pemilik usaha berhak tahu siapa membuka catatannya, kapan, dan kenapa.
drop policy if exists support_sessions_select on public.support_sessions;
create policy support_sessions_select on public.support_sessions for select to authenticated
using (private.is_platform_admin() or private.business_access(business_id));

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select to authenticated
using (true);

drop policy if exists feature_flag_overrides_select on public.feature_flag_overrides;
create policy feature_flag_overrides_select on public.feature_flag_overrides for select to authenticated
using (private.is_platform_admin() or private.business_access(business_id));

drop policy if exists demo_accounts_select on public.demo_accounts;
create policy demo_accounts_select on public.demo_accounts for select to authenticated
using (private.is_platform_admin());

drop policy if exists config_versions_select on public.config_versions;
create policy config_versions_select on public.config_versions for select to authenticated
using (private.is_platform_admin());

drop policy if exists ops_daily_rollups_select on public.ops_daily_rollups;
create policy ops_daily_rollups_select on public.ops_daily_rollups for select to authenticated
using (private.is_platform_admin());

drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views for select to authenticated
using (private.is_platform_admin() and (shared or owner_admin_id = (select auth.uid())));

drop policy if exists metric_definitions_select on public.metric_definitions;
create policy metric_definitions_select on public.metric_definitions for select to authenticated
using (private.is_platform_admin());

-- Hak baca saja. Menulis lewat fungsi di atas, atau lewat `service_role` yang
-- sudah memegang segalanya sejak `0062` -- dan itu pun tetap dijegal trigger
-- append-only pada dua tabel yang tidak boleh berubah.
grant select on public.admin_roles, public.admin_action_logs, public.support_sessions,
  public.feature_flags, public.feature_flag_overrides, public.demo_accounts,
  public.config_versions, public.ops_daily_rollups, public.saved_views,
  public.metric_definitions to authenticated;

revoke all on function public.admin_grant_role(uuid, text, text) from public, anon;
revoke all on function public.admin_revoke_role(uuid, text, text) from public, anon;
revoke all on function public.admin_set_business_status(uuid, text, text) from public, anon;
revoke all on function public.start_support_session(uuid, text) from public, anon;
grant execute on function public.admin_grant_role(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_role(uuid, text, text) to authenticated;
grant execute on function public.admin_set_business_status(uuid, text, text) to authenticated;
grant execute on function public.start_support_session(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Definisi metrik yang sudah punya sumber, dan yang belum
-- ---------------------------------------------------------------------------
-- Didaftarkan sekarang, bukan nanti bersama layarnya: invarian v1.1 #12
-- menuntut SETIAP KPI punya definisinya, dan satu-satunya cara aturan itu
-- tidak bocor adalah barisnya ada lebih dulu daripada kartunya.

insert into public.metric_definitions (metric_key, title, formula_text, source_note, unit, measurable) values
  ('dau', 'Akun aktif harian',
   'Jumlah usaha dengan minimal satu transaksi terkonfirmasi atau satu tutup kas pada tanggal itu.',
   'transactions + daily_closings; akun demo dikecualikan.', 'count', true),
  ('new_accounts', 'Akun baru',
   'Jumlah usaha yang dibuat pada tanggal itu.', 'businesses.created_at.', 'count', true),
  ('transactions_recorded', 'Transaksi tercatat',
   'Jumlah transaksi berstatus terkonfirmasi pada tanggal itu.',
   'transactions; yang dibatalkan tidak dihitung.', 'count', true),
  ('capture_path_mix', 'Bauran jalur catat',
   'Bagian tiap jalur (TEXT_ONLY / WHISPER / OCR) terhadap seluruh capture pada rentang itu.',
   'transaction_captures.capture_path.', 'ratio', true),
  ('capture_latency_p95', 'Ucapan sampai draf (p95)',
   'Persentil ke-95 selisih waktu antara capture dibuat dan drafnya selesai.',
   'transaction_captures.created_at sampai completed_at.', 'ms', true),
  ('provider_errors_24h', 'Kegagalan penyedia AI 24 jam',
   'Jumlah percobaan yang berakhir gagal dalam 24 jam terakhir.',
   'ai_runs.status = failed.', 'count', true),
  ('queue_age_p95', 'Umur antrean (p95)',
   'Persentil ke-95 lama pekerjaan menunggu sebelum dikerjakan.',
   'ai_jobs.created_at sampai locked_at.', 'ms', true),
  ('ai_tokens_daily', 'Token AI per hari',
   'Jumlah token permintaan dan jawaban seluruh akun pada tanggal itu.',
   'ai_runs.prompt_tokens + completion_tokens. Agregat lintas platform, bukan per akun.', 'count', true),
  ('llm_amount_violation', 'Nominal dari model yang ditolak',
   'Jumlah nominal keluaran model yang ditimpa parser deterministik. Harus nol.',
   'BELUM ADA SUMBER: penjaganya menghitung di capture-worker tetapi angkanya belum disimpan.', 'count', false),
  ('save_without_edit', 'Simpan tanpa edit',
   'Bagian capture yang dikonfirmasi tanpa satu pun nilai draf diubah.',
   'BELUM ADA SUMBER: perbandingan draf dengan hasil akhir belum disimpan.', 'percent', false),
  ('edit_amount_ratio', 'Edit nominal vs edit kategori',
   'Bagian capture yang nominalnya diubah, dibanding yang kategorinya diubah.',
   'BELUM ADA SUMBER: sama dengan di atas.', 'percent', false),
  ('needs_input_reasons', 'Alasan draf butuh isian',
   'Sebaran alasan capture berhenti di keadaan butuh isian.',
   'BELUM ADA SUMBER: alasannya belum dicatat sebagai kolom.', 'count', false)
on conflict (metric_key) do nothing;

-- ---------------------------------------------------------------------------
-- Penjaga migrasi
-- ---------------------------------------------------------------------------

do $$
declare
  v_tables text[] := array[
    'admin_roles', 'admin_action_logs', 'support_sessions', 'feature_flags',
    'feature_flag_overrides', 'demo_accounts', 'config_versions',
    'ops_daily_rollups', 'saved_views', 'metric_definitions'
  ];
  v_table text;
  v_count int;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'MEJA_BELUM_LENGKAP: tabel % tidak terbentuk.', v_table;
    end if;
    select count(*) into v_count
    from pg_class where oid = ('public.' || v_table)::regclass and relrowsecurity;
    if v_count <> 1 then
      raise exception 'RLS_TERBUKA: tabel % tidak menyalakan row level security.', v_table;
    end if;
  end loop;

  -- Tidak ada tabel identitas admin kedua. Kalau suatu saat ada yang
  -- membuatnya, migrasi ini yang memberi tahu -- bukan RLS yang diam-diam
  -- memakai daftar yang salah.
  if to_regclass('public.admin_users') is not null then
    raise exception 'DUA_DAFTAR_ADMIN: public.admin_users muncul; platform_admins sudah menjadi satu-satunya daftar admin.';
  end if;

  select count(*) into v_count from public.feature_flags;
  if v_count < 5 then
    raise exception 'SAKELAR_KURANG: baru % sakelar terdaftar, seharusnya lima.', v_count;
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgname in ('admin_action_logs_append_only', 'support_sessions_append_only')
    and not tgisinternal;
  if v_count <> 2 then
    raise exception 'CATATAN_BISA_DIUBAH: penjaga append-only tidak terpasang lengkap (% dari 2).', v_count;
  end if;
end;
$$;

commit;
