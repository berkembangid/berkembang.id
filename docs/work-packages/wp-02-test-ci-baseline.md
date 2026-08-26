# WP-02 Test and CI Baseline — Handoff

Tanggal verifikasi: 25 Agustus 2026 (Asia/Jakarta)

## Outcome

- Repository memiliki command konsisten untuk lint, typecheck, unit test, integration test, E2E, dan E2E smoke.
- GitHub Actions menjalankan frozen install, lint, typecheck, unit test, dan production build pada push serta pull request.
- Unit suite mencakup normalisasi nominal Indonesia, parser transaksi, schema AI, role resolution existing, score existing, dan success/error state insert transaksi.
- Role fallback dan formula score lama dikunci sebagai characterization test agar refactor WP-04/WP-10 tidak mengubah perilaku tanpa sengaja.
- Full repository lint yang sebelumnya memiliki 58 error kini lulus dengan 0 error. Sebanyak 66 warning legacy tetap terlihat dan tidak disembunyikan.
- Playwright smoke menggunakan environment Supabase lokal placeholder dan tidak mengakses project Supabase production.

## Changed files

- `package.json`, `package-lock.json`: script WP-02 dan dependency `@playwright/test`.
- `.github/workflows/ci.yml`: pipeline Node.js 22 dengan lima stage wajib.
- `vitest.config.mts`: unit test Node yang sudah dibuat pada WP-01 dan diperluas pada WP-02.
- `vitest.integration.config.mts`: boundary integration test terpisah; saat ini eksplisit mengizinkan belum ada test.
- `playwright.config.ts`, `tests/e2e/smoke.spec.ts`: browser smoke untuk landing page dan aset PWA dengan Supabase placeholder.
- `modules/ledger/indonesian-money.ts`: normalisasi nominal eksplisit `ribu/rb/k/juta/jt` tanpa menebak unit.
- `modules/ai/schema.ts`: schema nominal provider memakai normalizer tersebut sebelum validasi integer positif.
- `modules/auth/role-resolution.ts`, `proxy.ts`: ekstraksi resolver role existing agar dapat dikarakterisasi tanpa mengubah urutan authority lama.
- `tests/unit/indonesian-money.test.ts`: nominal Indonesia, invalid input, dan larangan multiplier tebakan.
- `tests/unit/transaction-parser.test.ts`: parsing item valid serta penolakan nominal ambigu.
- `tests/unit/role-resolution.characterization.test.ts`: precedence metadata/email/profile dan routing portal existing.
- `tests/unit/score.characterization.test.ts`: baseline kosong, fixture penuh, dan floor aktivitas existing.
- `tests/unit/save-confirmed-transactions.test.ts`: success state hanya setelah insert berhasil.
- `lib/score.ts`: tipe input minimal menggantikan `any` tanpa mengubah formula.
- Halaman admin, layout UMKM, dashboard/gaps/score, `DateTimePicker`, dan `Modal`: penghapusan error lint melalui tipe eksplisit dan lifecycle yang aman, tanpa perubahan schema/database.
- `.gitignore`: abaikan artifact Playwright `test-results` dan `playwright-report`.

## Decisions

- Unit test tetap memakai environment Node karena subject utama adalah pure function dan route boundary; async component diuji lewat E2E sesuai panduan Next.js lokal.
- Integration suite dipisah dan `passWithNoTests` untuk saat ini karena Supabase lokal, migration, dan RLS baru tersedia pada WP-03/WP-04. Kondisi kosong ditampilkan jelas oleh output command.
- E2E tidak menjadi stage wajib CI pada WP-02. Playbook menetapkan integration/migration/RLS/E2E CI setelah environment tersedia.
- Email prefix dan user metadata tetap dikarakterisasi sebagai authority role existing, bukan dinyatakan aman. Perbaikannya sengaja ditunda ke WP-04.
- Formula score lama dipertahankan apa adanya dan ditandai expected debt hingga engine versioned WP-10.
- Warning lint legacy tidak diubah menjadi ignore atau disable global. CI lulus karena tidak ada error, sementara warning tetap muncul pada log.

## Database/security impact

- Tidak ada migration, query baru, atau perubahan data Supabase.
- Unit test mem-mock server Supabase dan hanya memakai URL `localhost`.
- Playwright web server memaksa `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` serta anon key placeholder.
- CI memakai Supabase localhost placeholder; tidak membutuhkan atau membaca secret production.
- Role behavior existing belum aman dan tetap tercatat sebagai expected debt WP-04.

## Verification

- Frozen install terisolasi: `npm.cmd ci --prefix <temporary-directory> --ignore-scripts` lulus, 645 packages dipasang dari lockfile; direktori temporer dihapus setelah verifikasi.
- `npm.cmd ls --depth=0`: lulus tanpa dependency missing/extraneous.
- `npm.cmd run lint`: lulus, 0 error dan 66 warning legacy.
- `npm.cmd run typecheck`: lulus.
- `npm.cmd test`: lulus, 7 test files dan 36 tests.
- `npm.cmd run test:integration`: lulus dengan pesan eksplisit “No test files found”; tidak ada koneksi production.
- Probe kegagalan sementara: satu assertion sengaja dibuat gagal; `npm.cmd test -- ci-failure-probe` mengembalikan exit code 1. File probe kemudian dihapus.
- `npm.cmd run build`: lulus, 30 static pages dan route dinamis AI terbuat.
- `npm.cmd run test:e2e:smoke`: lulus, 1 Chromium test.
- `git diff --check`: lulus.

## Manual test

1. Jalankan `npm ci` pada checkout bersih; expected install mengikuti `package-lock.json` tanpa mengubah lockfile.
2. Jalankan `npm run lint`, `npm run typecheck`, `npm test`, lalu `npm run build`; expected seluruh command exit 0.
3. Jalankan `npx playwright install chromium` satu kali, lalu `npm run test:e2e:smoke`; expected landing page dan ikon PWA terverifikasi.
4. Buka log GitHub Actions pada push/PR; expected job berhenti pada stage pertama yang gagal.

## Known limitations

- Workflow GitHub Actions belum dapat diamati pada runner remote sampai perubahan di-push; seluruh command yang sama sudah diverifikasi lokal.
- Integration suite belum memiliki test database/RLS karena migration dan Supabase lokal belum tersedia.
- E2E baru mencakup landing/PWA smoke dan belum menguji tiga role atau flow Supabase.
- Full lint masih menghasilkan 66 warning legacy, terutama unused import/state, exhaustive dependency, dan penggunaan `<img>`.
- NPM audit masih melaporkan 10 vulnerability (8 high, 2 moderate), termasuk Next.js 16.2.10.
- Role authority berbasis metadata/email dan tiga sumber score lama belum diperbaiki; characterization test mencegah perubahan diam-diam tetapi bukan security fix.

## Next recommended work package

- WP-03 — Database Foundation. Migration, constraints, indexes, generated types, dan schema resmi diperlukan sebelum RLS, membership, integration test, dan workflow lintas role dapat dibangun dengan aman.
