# Super Prompt untuk Claude Code — Laporan Keuangan "Satu Engine, Dua Wajah"

Cara pakai: simpan `SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md` ke `docs/specs/` di repo, lalu tempel prompt di bawah garis ke Claude Code dari root repo. Jalankan per tahap (A dulu). Setelah Tahap A selesai dan di-review, buka sesi baru dengan prompt yang sama tapi ganti "Tahap A" menjadi "Tahap B".

---

Kamu adalah senior engineer yang bergabung ke repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase Auth/Postgres/RLS/Storage, Zod, Vitest, Playwright). Tugasmu: mengimplementasikan **Tahap A** dari spesifikasi di `docs/specs/SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md`. Baca dokumen itu utuh sebelum menyentuh kode. Dokumen itu adalah sumber kebenaran; kalau kode dan dokumen bertentangan, hentikan dan tanya saya, jangan putuskan sendiri.

## Konteks produk yang wajib kamu pegang

BERKEMBANG.ID adalah pendamping UMKM mikro untuk membentuk catatan usaha yang bisa dibaca bank. Kami **bukan** pemberi pinjaman, biro kredit, atau Pemeringkat Kredit Alternatif (POJK 29/2024). Konsekuensi untuk kodemu:

- Tidak ada string `skor kredit`, `layak kredit`, `plafon`, `disetujui`, `ditolak`, `credit score` di UI, PDF, CALK, atau pesan error. Buat lint teks otomatis yang menggagalkan CI kalau muncul.
- UMKM tidak pernah melihat istilah akuntansi. Di komponen UMKM pakai padanan di Bagian 8 spek (Untung bersih, Diambil untuk rumah, dst). Istilah akuntansi hanya boleh di Mode Akuntan, PDF, dan kode.
- AI hanya menebak `category_code` 1–10. **AI tidak pernah memutuskan kode akun.** Pemetaan kategori → akun adalah tabel `category_templates`, bukan prompt.

## Prinsip arsitektur (tidak bisa ditawar)

1. **Single entry di depan, double entry di belakang.** Setiap transaksi `confirmed` menghasilkan satu `journal_entries` dengan ≥ 2 `journal_lines` yang Σdebit = Σkredit, dalam transaksi database yang sama dengan konfirmasi.
2. **Jurnal immutable.** Koreksi dan pembatalan = entry pembalik bertanggal posting hari ini + entry baru. Tidak ada UPDATE/DELETE pada jurnal; tegakkan dengan RLS dan trigger.
3. **Stateless reporting.** Laba rugi, posisi keuangan, arus kas, neraca saldo, buku besar adalah fungsi/view SQL atas jurnal. Tidak ada jurnal penutup tersimpan. Saldo laba dihitung kumulatif.
4. **Deterministik dan bisa diaudit.** Kategori + sektor + metode bayar yang sama selalu menghasilkan akun yang sama. Tulis property test yang menyapu semua kombinasi template.
5. **Ikuti pola repo yang ada,** bukan pola favoritmu: modul domain di `modules/*`, Route Handler di `app/api/v1/*`, validasi Zod, sesi diverifikasi server via `auth.getUser()`, `service role` hanya di modul server-only, RLS pada semua tabel domain, nominal `bigint` rupiah bulat, batas hari Asia/Jakarta, idempotency key pada write, audit event tanpa PII mentah, soft delete dengan alasan.

## Langkah kerja — kerjakan berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (jangan tulis kode)
Baca dan ringkas untuk saya, maksimal 40 baris:
- `supabase/migrations/0021*` (ledger/report/daily closing), `0027*` dan `0028*` (roleless capture) — struktur tabel transaksi aktual, nama kolom, enum status, cara RLS ditulis.
- `modules/ledger/*` dan `modules/ai/*` — bagaimana konfirmasi capture menyimpan transaksi, di mana prompt ekstraksi, bagaimana idempotency key dipakai.
- `tests/integration/database-migrations.contract.test.ts` dan `scripts/verify-database-migrations.mjs` — bagaimana migrasi baru harus didaftarkan.
- Status quality gate: jalankan `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`. Laporkan hasilnya apa adanya.

**Checkpoint 0:** Jika `0028` belum lulus migration test atau lint masih merah, **berhenti dan laporkan**. Jangan menumpuk `0029` di atas fondasi yang belum hijau. Jika hijau, ajukan rencana migrasi `0029` (daftar tabel, kolom, trigger, fungsi) dan daftar file yang akan kamu ubah. Tunggu persetujuan saya.

### Langkah 1 — Migrasi `0029`
Buat `supabase/migrations/0029_accounting_journal_foundation.sql` sesuai Bagian 5 spek, Tahap A saja:
- `coa_accounts` + seed Bagian 3 (kode 1100–5400).
- `category_templates` + seed Bagian 4 untuk sektor pilot (pangan olahan kemasan / PERDAGANGAN_KULINER), termasuk subtype 4a/4b dan sub-beban 5210–5290. `template_version = 'coa-emkm-v1'`.
- Kolom baru di tabel transaksi: `category_code`, `category_subtype`, `counterparty_id`, `interest_amount`, `needs_reclass`, `journal_entry_id`. Tambah nilai `BELUM_DIBAYAR` ke enum metode bayar dengan cara yang aman untuk replay.
- `counterparties`, `journal_entries`, `journal_lines` dengan CHECK constraints dan trigger yang menolak entry tidak seimbang atau < 2 lines, serta trigger yang menolak UPDATE/DELETE.
- RLS untuk semua tabel baru mengikuti pola `0021`/`0027` (kepemilikan usaha + membership internal roleless).
- Fungsi `fn_post_transaction_journal(transaction_id)` yang membaca template dan menulis entry; dipanggil dari fungsi konfirmasi yang sudah ada di dalam transaksi yang sama. Gagal keras jika template tidak ditemukan.
- Fungsi `fn_reverse_journal_entry(entry_id, reason)`.
- `v_general_ledger`, `fn_trial_balance(business_id, as_of)`, `fn_income_statement(business_id, date_from, date_to)`.
- **Backfill**: transaksi `confirmed` lama → MASUK: kategori 1; KELUAR: kategori 6 subtype 5290; `needs_reclass = true`; posting jurnal untuk semuanya. Tulis assertion di akhir migrasi: Σ nominal per arah sebelum = sesudah.

Daftarkan `0029` di `database-migrations.contract.test.ts` dan `verify-database-migrations.mjs`. Tambah skenario verifikasi: fresh apply → insert transaksi 10 kategori → semua entry seimbang → reversal → trial balance tetap seimbang.

**Checkpoint 1:** tunjukkan SQL, hasil `npm run db:test` (kalau `DATABASE_TEST_URL` tersedia; kalau tidak, katakan begitu, jangan pura-pura lulus), dan `npm run db:types:check`.

### Langkah 2 — Modul `accounting` dan perubahan `ledger`
- Buat `modules/accounting/` dengan: `coa.ts` (tipe dan konstanta kode akun), `templates.ts` (resolver `(sector, category_code, subtype, payment_method) → {debit, credit, cashFlowSection}` yang membaca tabel, bukan hardcode), `posting.ts`, `reports.ts` (pemanggil fungsi SQL), `warung.ts` (agregat 4 kotak + kalimat interpretasi berbasis rule, bukan LLM).
- Ubah `POST /api/v1/ledger` dan alur `confirm` capture agar menerima dan memvalidasi (Zod) `category_code`, `category_subtype`, `counterparty_id`, `interest_amount`. Kategori 1 dengan `BELUM_DIBAYAR` → otomatis kategori 10. Kategori 7 dengan `interest_amount > 0` → dua debit (pokok ke utang, bunga ke 5310).
- `PATCH` dan `DELETE` transaksi memanggil `fn_reverse_journal_entry` (+ entry baru untuk PATCH). Pertahankan aturan tanggal terkunci setelah tutup kas.
- Endpoint baru: `GET /api/v1/reports/income-statement`, `GET /api/v1/reports/warung`, `GET /api/v1/accounting/journal`, `GET /api/v1/accounting/trial-balance`, `POST /api/v1/ledger/transactions/:id/reclass`.
- Prompt ekstraksi AI: tambahkan output `category_code` (1–10), `subtype` opsional, `counterparty_name` opsional, `confidence`. Kata pemicu prive (rumah, anak, sekolah, dapur, pribadi) menaikkan prior kategori 9. Jangan minta AI mengeluarkan kode akun. Simpan prompt lama sebagai versi sebelumnya; beri versi pada prompt baru.

**Checkpoint 2:** unit test hijau untuk resolver template (semua kombinasi), posting, reversal, dan kalimat interpretasi. Tunjukkan `curl` contoh ke tiga endpoint baru dengan akun uji.

### Langkah 3 — UI Mode Warung (Tahap A saja)
- Layar konfirmasi transaksi: pilihan kategori 1–10 sebagai chip dengan label bahasa warung dari `category_templates.label_umkm`, pra-terpilih dari tebakan AI, sub-biaya (5210–5290) sebagai chip kedua yang muncul hanya untuk kategori 6. Kategori 7 menampilkan kolom "berapa bunganya?" hanya jika ada pinjaman terdaftar; jika belum, default 0.
- Tab "Bulan Ini" di `/umkm/laporan`: 4 kotak (Uang masuk dari jualan · Belanja & biaya · **Untung bersih** · Diambil untuk rumah), satu kalimat interpretasi dari `warung.ts`, grafik batang untung 6 bulan, naik/turun vs bulan lalu, daftar "pelanggan yang belum bayar".
- Kartu di beranda: "X catatan lama perlu dicek kategorinya" → daftar dengan chip kategori satu ketuk → `reclass`.
- Tanpa satu pun kata terlarang dan tanpa istilah akuntansi. Angka rupiah bulat, pemisah ribuan titik.

**Checkpoint 3:** screenshot Playwright tiga layar tersebut dari akun uji, dan skenario E2E: rekam teks "ambil 300 ribu buat SPP anak" → konfirmasi → untung bersih tidak berubah, kotak "Diambil untuk rumah" bertambah 300.000.

### Langkah 4 — Quality gate dan handoff
Jalankan dan laporkan apa adanya: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run db:types:check`, `npm run build`, lint kata terlarang. Perbarui `docs/STATUS_PRODUK_TERKINI` (atau file status yang dipakai repo) di bagian Buku Kas/Laporan dengan apa yang berubah dan apa yang masih Tahap B/C. Tulis ringkasan handoff ≤ 30 baris: yang selesai, yang sengaja ditunda, risiko, dan cara mendemokan dalam 12 langkah.

## Aturan komunikasi

- Bahasa Indonesia, ringkas, tanpa basa-basi. Angka dan nama file konkret.
- Pesan commit mengikuti pola repo, contoh: `feat(accounting): fondasi jurnal ganda SAK EMKM dan template kategori (0029)`. Satu commit per langkah logis; jangan satu commit raksasa.
- Kalau harus memilih antara dua cara yang sama-sama valid dan spek tidak menjawab, pilih yang paling dekat dengan pola repo yang ada, lalu tulis keputusan itu di komentar kode dan di handoff. Kalau pilihan itu mengubah perilaku yang UMKM lihat, tanya dulu.
- Jangan pernah menyatakan sesuatu lulus kalau kamu tidak menjalankannya. Kalau lingkungan tidak punya `DATABASE_TEST_URL`, kunci Supabase, atau kunci AI, katakan dan tunjukkan apa yang sudah diverifikasi dan apa yang belum.
- Jangan menyentuh: modul `consent`, `readiness` (rule `wp08-pilot-v1`), portal institusi, portal admin, kecuali menambahkan tipe yang dibutuhkan kompilasi. Perubahan readiness untuk indikator baru akan datang sebagai spek terpisah.
- Jangan mengerjakan Tahap B (saldo awal, aset, penyusutan, pinjaman, stok, posisi keuangan, PDF) dalam sesi ini meskipun terlihat mudah. Tahap A harus hijau dan di-review dulu.

Mulai dari Langkah 0.
