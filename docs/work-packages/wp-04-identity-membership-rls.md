# WP-04 Identity, Membership, and RLS

Tanggal verifikasi: 25 Agustus 2026  
Status: selesai di repository dan database lokal disposable; belum diterapkan ke Supabase remote/production.

## Outcome

WP-04 mengganti otoritas role berbasis `user_metadata`, awalan email, `profiles.role`, dan fallback UMKM dengan membership yang dikendalikan database. Semua tabel fisik pada schema `public` sekarang mengaktifkan RLS, storage document tetap private, dan operasi istimewa yang sudah memiliki UI dipindahkan dari browser ke Route Handler server.

Urutan role efektif yang deterministik:

1. `platform_admins.status = active` -> portal `admin`;
2. `institution_members.status = active` -> portal `institution`;
3. `business_members.status = active` -> portal `umkm`;
4. tidak ada membership -> fail closed ke login dengan `membership_required`.

`profiles.role` masih dipertahankan sebagai compatibility/read-model agar layar admin lama tidak rusak, tetapi field tersebut tidak dipakai oleh redirect, Route Handler, helper RLS, atau policy.

## Database boundary

Migrasi additive baru:

- `0013_identity_membership_rls.sql`
  - membuat `platform_admins` sebagai authority platform;
  - mengonversi admin legacy satu kali dan membangun institution membership legacy;
  - menambah helper `private.*` dengan `security definer` dan `search_path = ''`;
  - melindungi kolom authority profile, business membership, institution membership, dan consent lewat trigger;
  - mencabut grant browser default, lalu memberi grant per operasi;
  - mengaktifkan RLS pada seluruh 35 tabel fisik `public`;
  - memisahkan policy SELECT/INSERT/UPDATE/DELETE, termasuk business, institution, ledger, legal document, readiness, consent/dossier, AI, notifications, dan audit.
- `0014_storage_object_policies.sql`
  - mempertahankan bucket `documents` private dan `avatars` public;
  - mengaktifkan RLS pada `storage.objects`;
  - membatasi write/read API ke folder teratas milik `auth.uid()`;
  - hanya business owner aktif yang dapat mengakses object legal document.

Service role tetap memiliki grant penuh dan bypass RLS untuk DAL/worker server-only. Key tersebut hanya dibaca oleh `lib/supabase/admin.ts`, yang memakai `server-only`, dan tidak memiliki prefix `NEXT_PUBLIC_`.

## App boundary

- `proxy.ts` hanya memakai hasil lookup membership database dan gagal tertutup jika lookup gagal.
- `/auth/continue` melakukan redirect read-only berdasarkan effective role.
- `/api/auth/bootstrap` adalah POST terautentikasi dan membuat profile + membership onboarding secara idempotent. Metadata signup hanya menjadi input onboarding UMKM/institusi yang memang dapat self-register; metadata tidak dapat membuat platform admin.
- `/api/admin/operations` memvalidasi payload dengan Zod, mengautentikasi ulang, mengharuskan effective role `admin`, lalu menjalankan provisioning/mutasi memakai service client server-only.
- Mutasi admin yang dipindahkan: buat/nonaktifkan admin, status/detail institusi, data mitra, publish rule set, data dan override score UMKM, serta audit event.
- `/api/documents/signed-url` memeriksa document melalui RLS owner, membuat signed URL 60 detik di server, dan menulis audit event. UI upload tidak lagi menyimpan/membuka public URL permanen.

Operasi membership role escalation tidak tersedia bagi browser. Owner hanya dapat mengundang `staff/viewer` dan mengubah status anggota non-owner; perubahan role memerlukan jalur server/service yang eksplisit. Institution admin browser hanya dapat mengundang `viewer`; escalation juga server-only.

## Policy behavior yang dibuktikan

- User A tidak dapat membaca business User B.
- Owner dapat membaca seluruh transaksi business; staff hanya transaksi miliknya.
- Staff tidak dapat menaikkan role sendiri.
- Staff tidak dapat membaca/mengubah consent.
- Institution A tidak dapat membaca request Institution B.
- Institution tidak dapat membaca raw transaction meski memiliki consent scope `summary` aktif.
- User normal tidak memiliki grant untuk menulis rule set, AI run, atau audit event.
- Label legacy `profiles.role = admin` tanpa `platform_admins` tidak menghasilkan admin authority.
- Platform admin server-controlled dapat dibedakan secara positif.
- Owner dapat menulis object document pada folder sendiri; staff dan cross-folder write ditolak.
- Service role masih dapat melakukan privileged write untuk Route Handler/worker.

## Verifikasi

Hasil terakhir:

- database fresh apply + replay + constraints + legacy backfill: lulus;
- cross-account RLS dan storage isolation: lulus;
- generated database types drift check: lulus (35 tabel, 5 view);
- TypeScript: lulus;
- ESLint: 0 error, 64 warning legacy;
- unit: 42 test lulus;
- integration contract: 7 test lulus;
- production build: lulus, 34 route;
- Playwright Chromium landing smoke: lulus (1 test).

Build sandbox pertama tidak dapat mengambil Google Font. Build ulang dengan akses jaringan terbatas berhasil. Playwright Chromium versi yang cocok dipasang lokal dengan `PLAYWRIGHT_BROWSERS_PATH=0` karena profil browser global sandbox berbeda dari profil host.

## Gate sebelum staging/production

1. Isi `SUPABASE_SERVICE_ROLE_KEY` hanya pada secret store runtime server. Jangan pernah menaruhnya pada client env atau bundle.
2. Review daftar yang akan dikonversi oleh `profiles.role = 'admin'` sebelum menerapkan migrasi 0013. Konversi ini hanya jembatan satu kali; setelah migrasi, authority sepenuhnya berada di `platform_admins`.
3. Backup database dan storage metadata, lalu terapkan migrasi pada staging lebih dulu.
4. Audit policy lama yang mungkin sudah ada pada `storage.objects`. Migrasi menambah policy bernama WP-04 tetapi sengaja tidak menghapus policy asing/unknown secara massal.
5. Jalankan cross-account suite terhadap staging dengan akun fixture terisolasi sebelum traffic nyata.
6. Uji signup dengan email confirmation aktif dan nonaktif. Bootstrap dilakukan setelah session tersedia.
7. Pastikan bucket `documents` benar-benar private pada project remote dan URL legacy di `documents.file_url` tidak lagi digunakan; pembersihan object/URL legacy dilakukan sebagai pekerjaan migrasi terpisah yang terkontrol.
8. Provisioning admin pertama setelah migrasi harus memakai admin legacy yang telah direview atau jalur operator/service yang diaudit.

## Batas WP-04

- Dossier generation dan worker execution belum diimplementasikan; RLS sengaja menolak browser write ke dossier/AI run dan menyisakannya untuk work package server/worker berikutnya.
- Admin analytics tetap membaca agregat melalui browser client dengan RLS platform-admin. Akses document/dossier sensitif tidak diberikan kepada policy admin umum.
- UI pengelolaan anggota business/institution belum dibuat; database boundary dan role matrix sudah siap.
- Tidak ada migrasi yang diterapkan ke remote Supabase pada pekerjaan ini.

## Referensi desain

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private bucket access model](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- Next.js local docs: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `data-security.md`, `proxy.md`, dan `cookies.md`.
