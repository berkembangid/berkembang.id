# Serah terima — Lemari Dokumen (D-0, D-A, rak E)

Tanggal 3 September 2026. Migrasi `0041`–`0044`. Semua gerbang hijau di
PostgreSQL 18 lokal: `typecheck`, `lint` (0 galat), `lint:terms`, `test` (574),
`test:integration` (88), `build`, `db:test` `0001`–`0044` fresh + replay,
`db:types:check`, `check:voice-bundle`.

## Selesai

- **Lima rak** `documents.doc_class`. Raknya diisi fungsi + trigger `before
  insert`, bukan backfill sekali jalan — jalur tulis dokumen lebih dari satu.
- **Tiga pintu bukti.** A (kartu setelah simpan), C (ikon kamera di riwayat),
  D (otomatis: bukti pembelian ikut menempel ke alat/pinjaman yang lahir
  darinya, dikerjakan RPC `attach_document`).
- **Ajakan bertingkat.** < Rp100 rb diam; alat & pinjaman selalu diajak.
- **Kompresi klien** 1600 px + putar EXIF; sebelumnya tidak ada di repo.
- **Klip 📎 Mode Akuntan** → tautan bertanda tangan 60 detik, tercatat audit.
- **CALK** memuat kalimat kebijakan bukti hanya bila lampirannya memang ada.
- **Rak E**: berkas laporan disimpan apa adanya + nomor `BRK-YYYYMMDD-XXXXXXXX`
  tercetak di kaki halaman; unduh ulang menyajikan bita yang sama persis.
- **Cacat lama diperbaiki**: `utilitas` dan `akta_pendirian` ditawarkan di layar
  unggah tapi ditolak RPC — dua jenis dokumen mustahil diunggah. Daftarnya kini
  satu, dijaga uji kontrak.

## Ditunda (dilarang dikerjakan di sesi ini)

- **D-B** — mesin pengingat masa berlaku. Tabel `document_reminders` sudah ada,
  mesinnya belum. Catatan penting: **repo ini tidak punya penjadwal sama sekali**
  (bukan pg_cron, bukan vercel cron), jadi pengingat harus diturunkan dari
  keadaan seperti `fn_pending_reminders`, bukan dari job.
- **D-C** — Pintu B (OCR nota → draf transaksi), tingkat `attested`, layar
  pemilah untuk dokumen ber-`needs_class_review`.
- **Dossier institusi**: blok legalitas dan indikator kelengkapan bukti
  ("X% dari nilai transaksi ≥ Rp500 rb punya bukti") belum dibuat.

## Keputusan yang saya ambil sendiri

1. `doc_class` huruf kecil, bukan HURUF BESAR seperti spek — mengikuti dua belas
   nilai `doc_type` yang sudah ada. Dua konvensi di satu kolom menghasilkan
   perbandingan yang meleset diam-diam.
2. Rute `/api/v1/ledger/transactions/:id/attachments`, bukan
   `/api/v1/transactions/...`, karena seluruh rute transaksi sudah di bawah
   `ledger/`.
3. Kartu sukses `/umkm/catat` tidak lagi pindah otomatis ke laporan setelah 1,2
   detik. Ajakan memotret hanya berguna selagi notanya masih di tangan.
4. "Laporan yang pernah dibuat" ditaruh di halaman Dokumen, bukan menu baru.
5. Jumlah bukti ikut dalam muatan daftar (`attachmentCount`), bukan permintaan
   per baris — satu layar riwayat kalau tidak akan menjadi puluhan permintaan.

## Jawaban lima pertanyaan Bagian 13

1. **Tabel dokumen**: `public.documents`, kolom jenis `doc_type text` tanpa
   enum, 12 nilai. Pemetaan rak: `private.document_shelf_for_type()`.
2. **Penjadwal**: tidak ada. Tidak ada pg_cron, tidak ada `vercel.json`.
   Pengingat yang ada diturunkan dari keadaan, dan D-B harus mengikutinya.
3. **Penyimpanan**: satu bucket `documents` + path
   `{user_id}/{business_id}/{document_id}/{berkas}`. RLS storage memakai
   `split_part(name,'/',1) = auth.uid()`. Bucket terpisah per rak **tidak**
   diperlukan: kebijakan berbaginya ditentukan `doc_class` + modul consent.
4. **"Perlu perhatian" di Beranda**: generik. `ActionItem` adalah
   `{ id, title, description, href }`, jadi kartu jenis baru masuk tanpa
   mengubah komponennya.
5. **Util gambar klien**: tidak ada sebelumnya. Yang ada hanya `sharp` di sisi
   server untuk pra-proses OCR, dan `inspectImageQuality` yang hanya memeriksa
   dimensi. Kompresor ditulis baru di `modules/documents/image-compression.ts`.

## Demo 60 detik

1. Catat → ketik **"beli kulkas 3 juta"** → periksa → Simpan.
2. Kartu sukses berbunyi **"Fotokan notanya, ya"** → ambil foto → "Foto nota
   tersimpan · 0,3 MB — hemat kuota".
3. Laporan → tab **Kondisi Usaha**: kulkas sudah terdaftar sebagai alat.
4. **Mode Akuntan** → Jurnal: baris Dr 1600 / Cr Kas membawa **📎** → ketuk,
   notanya terbuka.
5. **Dokumen** → "Laporan yang pernah dibuat": berkas dengan nomornya.

Pembanding yang perlu ditunjukkan: catat **"beli gula 20 ribu"** → tidak ada
ajakan foto sama sekali.

## Yang belum diverifikasi

`tests/e2e/lemari-dokumen.spec.ts` sudah ditulis (4 skenario, satu `@smoke`) dan
terdaftar di Playwright, **tetapi belum pernah dijalankan**: lingkungan ini tidak
punya `E2E_EMAIL`/`E2E_PASSWORD`, jadi spec-nya melewati diri sendiri. Untuk
menjalankannya perlu aplikasi hidup, basis data termigrasi sampai `0044`, dan
akun uji — dan perlu diingat ia menulis transaksi sungguhan, jadi jangan
diarahkan ke akun demo yang dipakai presentasi.
