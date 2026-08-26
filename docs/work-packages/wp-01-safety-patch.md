# WP-01 Safety Patch — Handoff

Tanggal verifikasi: 25 Agustus 2026 (Asia/Jakarta)

## Outcome

- Endpoint AI sekarang mewajibkan sesi Supabase sebelum membaca atau memproses payload.
- Kegagalan semua provider AI mengembalikan respons gagal yang eksplisit dan `transactions: []`; tidak ada transaksi atau nominal fallback.
- Input teks, MIME audio, ukuran audio, dan keluaran provider divalidasi sebelum digunakan UI.
- Penyimpanan transaksi hanya menampilkan sukses setelah insert database berhasil. Draft tetap tersedia ketika insert gagal.
- Alur laporan, profil, dokumen, dan notifikasi tidak lagi menyamarkan kegagalan database/storage sebagai sukses atau keadaan kosong.
- Layar yang masih memakai data/aksi mock diberi banner demo; identitas admin/institusi palsu di layout dihapus.
- Tautan `/umkm/journey` yang tidak ada diarahkan ke `/umkm/roadmap`, dan karakter rusak pada production path yang ditemukan telah diperbaiki.
- Contoh environment hanya menaruh kunci provider AI pada variabel server-only.

## Changed files

- `app/api/ai/transcribe/route.ts`: boundary autentikasi, validasi request, response contract, dan dependency injection untuk test.
- `modules/ai/schema.ts`: schema Zod untuk request, output provider, response sukses, dan response gagal.
- `modules/ai/providers.ts`: adapter Groq/OpenAI/Gemini server-only tanpa data fallback.
- `lib/supabase/server.ts`: validasi sesi berbasis cookie di server.
- `app/(umkm)/umkm/catat/page.tsx`: hapus parser/fallback finansial lokal dan gunakan penyimpanan jujur.
- `modules/ledger/save-confirmed-transactions.ts`: boundary insert transaksi yang dapat diuji.
- `app/(umkm)/umkm/laporan/page.tsx`, `profil/page.tsx`, `upload/page.tsx`, `notifikasi/page.tsx`: penanganan error database/storage yang terlihat oleh pengguna.
- `components/DemoBanner.tsx` dan halaman mock di area UMKM, institusi, serta admin: penandaan mode demo/simulasi.
- `app/(umkm)/umkm/aktivitas/page.tsx`: perbaikan link roadmap dan label data contoh.
- `app/(admin)/layout.tsx`, `app/(dashboard)/layout.tsx`, `app/(admin)/admin/admins/page.tsx`: hapus identitas/fallback akun palsu.
- `.env.example`, `.gitignore`: dokumentasi environment tanpa public AI secret.
- `package.json`, `package-lock.json`, `vitest.config.mts`: Zod dan test runner Vitest.
- `tests/unit/*.test.ts`: sembilan test untuk schema, failure path AI, auth, file validation, dan kegagalan insert.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`: aset manifest PWA yang sebelumnya tidak tersedia.
- `components/landing/ProductSections.tsx`, `components/landing/TrustSection.tsx`, `app/globals.css`: perbaikan encoding yang terlihat pengguna.

## Decisions

- Provider boleh dicoba berurutan, tetapi jika tidak ada hasil yang lolos schema maka request gagal; sistem tidak menebak nominal.
- Transaksi AI selalu berstatus `needs_review` sebelum pengguna mengonfirmasi penyimpanan.
- Batas audio default adalah 10 MiB dan dapat diturunkan melalui `AI_MAX_AUDIO_BYTES`.
- Dokumen dibatasi ke PDF/JPEG/PNG maksimal 5 MiB. Perubahan bucket menjadi private dan signed URL tetap dikerjakan pada WP-06 agar tidak mencampur migration besar ke safety patch.
- Mock UI yang belum dapat diganti data nyata tetap dipertahankan untuk demonstrasi, tetapi dilabeli dengan jelas.

## Database/security impact

- Tidak ada migration atau perubahan schema database pada WP-01.
- API AI tidak lagi dapat dipakai tanpa sesi aplikasi yang valid.
- `GROQ_API_KEY`, `OPENAI_API_KEY`, dan `GEMINI_API_KEY` hanya dibaca dari server; tidak ada fallback `NEXT_PUBLIC_*`.
- Role `umkm` tidak lagi ditulis dari halaman profil browser.
- Upload dokumen melakukan kompensasi penghapusan file apabila insert metadata gagal.

## Verification

- `npm.cmd test`: lulus, 3 test files dan 9 tests.
- `.\node_modules\.bin\tsc.cmd --noEmit`: lulus.
- ESLint pada route AI, module AI/ledger, tests, dan halaman safety terkait: lulus tanpa error.
- `npm.cmd run build`: lulus; 30 static pages terbuat dan route `/api/ai/transcribe` terdeteksi dinamis.
- Smoke production pada `127.0.0.1:3187`: `/`, `/icon.png`, dan `/icons/icon-192.png` merespons 200.
- Smoke production `POST /api/ai/transcribe` tanpa cookie: 401 `UNAUTHENTICATED` dengan `transactions: []`.
- Smoke production `/umkm/catat`, `/institusi`, dan `/admin` tanpa sesi: 307 ke `/auth/login` dengan `redirectTo` yang benar.
- Repository search: tidak menemukan pola fallback finansial pada route/module AI, public AI secret, atau link `/umkm/journey`.
- `git diff --check`: lulus.
- `npm.cmd run lint -- --quiet`: masih gagal pada 58 error lama di file di luar boundary WP-01; baseline WP-00 adalah 79 error.
- `npm.cmd audit --omit=dev`: masih melaporkan 10 vulnerability dependency (8 high, 2 moderate), termasuk Next.js 16.2.10.

## Manual test

1. Tanpa login, kirim teks atau audio ke `/api/ai/transcribe`; expected 401 dan array transaksi kosong. Ini telah diverifikasi melalui smoke test.
2. Dengan sesi test, unggah file `.txt`; expected 415. Unggah audio di atas batas; expected 413. Kedua boundary telah diverifikasi melalui unit test.
3. Dengan sesi test dan provider dimatikan/gagal, rekam atau ketik transaksi; expected pesan gagal, preview kosong, dan tidak ada nominal hasil tebakan.
4. Pada preview yang valid, paksa insert database gagal; expected draft tetap ada, toast sukses tidak muncul, dan pesan “Catatan belum tersimpan” tampil. Boundary insert telah diverifikasi melalui unit test.
5. Buka halaman aktivitas, roadmap, AI Copilot, dashboard institusi, analytics, dossiers, dan rules; expected banner “Mode demo/simulasi” terlihat.

## Known limitations

- Skenario UI terautentikasi end-to-end belum dijalankan terhadap project Supabase nyata karena tidak ada akun test disposable yang aman digunakan; boundary kritis ditutup dengan unit test, typecheck, build, dan smoke anonim.
- Bucket dokumen masih memakai public URL sampai WP-06 menyediakan migration private bucket dan signed URL.
- Otorisasi role/tenant masih bergantung pada pekerjaan WP-04 dan migration RLS berikutnya.
- Lint repository belum hijau karena 58 error legacy di luar scope safety patch.
- Dependency audit belum hijau; upgrade Next.js dan dependency transitive perlu dilakukan secara terpisah dengan membaca panduan versi lokal dan regression test penuh.

## Next recommended work package

- WP-02 — Foundation & Contracts. Paket ini diperlukan untuk menetapkan kontrak tipe, env validation, baseline dependency/testing, dan mengurangi lint debt sebelum auth/RLS serta workflow domain diperluas.
