-- ---------------------------------------------------------------------------
-- 0102 — Siapa yang mencoba demo
-- ---------------------------------------------------------------------------
-- Akun demo tercetak terang-terangan di `/bio`, halaman tujuan QR poster. Itu
-- disengaja dan tetap benar: yang memindai QR sedang berdiri di depan poster
-- dan tidak punya siapa-siapa untuk dimintai akun.
--
-- Yang tidak pernah ada sampai sekarang adalah sisi sebaliknya: tidak seorang
-- pun tahu siapa saja yang sudah mencoba. Poster dipasang, QR dipindai, akun
-- dipakai, dan jejaknya berhenti di situ. Tidak ada cara menindaklanjuti orang
-- yang jelas-jelas tertarik.
--
-- Tabel ini menyimpan nama dan surel yang diisi sebelum akunnya diperlihatkan.
--
-- INI PENCATATAN MINAT, BUKAN PENJAGA PINTU.
--
-- Formulirnya tidak memverifikasi apa pun. Siapa pun bisa mengetik nama
-- karangan, dan akun demonya tetap terbuka. Itu memang batasnya: lingkungan
-- demo berisi usaha karangan di basis data terpisah, jadi tidak ada yang perlu
-- dijaga di baliknya. Yang dicari adalah nama orang yang mau meninggalkannya --
-- dan itu, untuk poster yang dipasang di ruang publik, sudah cukup.
--
-- Karena ia pencatatan minat, kolomnya tidak menuntut apa-apa selain dua yang
-- diisi sendiri. Tidak ada tautan ke `auth.users`: yang mengisi formulir ini
-- justru orang yang BELUM punya akun.

begin;

create table if not exists public.demo_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  -- Dari mana ia sampai ke halaman ini. QR poster tidak meninggalkan jejak
  -- lain, jadi `referrer` kosong justru petunjuk: besar kemungkinan ia datang
  -- dari kertas, bukan dari tautan.
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.demo_access_requests is
  'Nama dan surel yang diisi sebelum akun demo diperlihatkan di /bio. '
  'Pencatatan minat, bukan penjaga pintu: tidak ada verifikasi, dan akun '
  'demonya memang terbuka. Ditulis service role dari route server.';

-- Daftar ini dibaca berurutan waktu ("siapa saja minggu ini"), dan sesekali
-- dicari per orang ("apakah dia sudah pernah mencoba"). Dua indeks itu saja.
create index if not exists demo_access_requests_created_at_idx
  on public.demo_access_requests (created_at desc);

create index if not exists demo_access_requests_email_idx
  on public.demo_access_requests (lower(email));

alter table public.demo_access_requests enable row level security;

-- Tanpa satu pun kebijakan, dan tanpa satu pun hak -- pola yang sama dengan
-- `public.team_profiles` di 0096. Tabel yang tidak punya keduanya tidak bisa
-- disentuh lewat REST API sama sekali, termasuk oleh kunci anon yang memang
-- tertanam di peramban setiap pengunjung halaman publik ini.
--
-- Satu-satunya yang menulis ke sini adalah route server dengan service role,
-- yang melewati RLS. Artinya bentuk dan isi barisnya ditentukan kode yang kita
-- tulis, bukan oleh siapa pun yang membuka DevTools di depan poster.
revoke all on public.demo_access_requests from public, anon, authenticated;

commit;
