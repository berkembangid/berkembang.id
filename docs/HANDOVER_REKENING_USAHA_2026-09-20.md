# Rekening usaha terpisah — komponen B5

Ditulis untuk orang berikutnya yang menyentuh Tingkat Kesiapan atau layar Profil.
Tanggal: 20 September 2026. Migrasi: `0098_rekening_usaha_terpisah.sql`.

## Apa yang bertambah

Satu langkah baru di Perjalanan: **memisahkan rekening usaha dari rekening
pribadi**. Ia bukan catatan sampingan — ia komponen penilaian ketiga belas
(`B5`) di pilar B, lengkap dengan ambangnya sendiri.

Tiga anak tangga, bukan ya/tidak:

| Nilai | Status | Syarat |
|---|---|---|
| 0 | `BELUM` | belum ada catatan |
| 1 | `SEBAGIAN` | pemilik mencatat bank, nama pemilik rekening, dan 4 digit terakhir |
| 2 | `TERPENUHI` | ada berkas rekening koran yang masih berlaku **dan** pemilik menyatakan berkas itu memang rekeningnya |

## Empat keputusan, dan alasannya

**1. Syarat Emas, bukan syarat Perak.** `silver` sengaja `null` — pola yang sama
dengan B4 dan D3. Komponen baru yang menahan Perak akan **menurunkan** setiap
usaha yang hari ini sudah Perak, pada pembacaan halaman berikutnya, karena
sesuatu yang belum pernah diminta dari mereka. Saat keputusan ini diambil ada 16
usaha Perak dan 8 Emas di basis data demo. Uji `never costs anyone the level
they already hold` di `tests/unit/readiness-evaluator.test.ts` menjaga janji itu.

**2. Anak tangga tengah wajib ada.** Pemilik yang rekeningnya baru dibuka
minggu ini belum punya mutasi untuk diunggah. Tanpa `SEBAGIAN` ia mengerjakan
sesuatu yang benar dan layarnya tetap menjawab "belum".

**3. Nomor rekening penuh tidak disimpan.** Hanya `account_last4`. Nomor
lengkapnya tinggal di dalam berkas rekening koran — private storage, di balik
consent. Uji kontrak menolak kolom bernama `account_number` dalam bentuk apa pun.

**4. Rekening atas nama pribadi DITERIMA.** Bank menuntut akta atau NIB untuk
rekening bisnis, dan hampir semua pemilik di produk ini berbentuk perorangan.
Yang dinilai pemisahan uangnya, bukan atas nama siapa rekeningnya. Ini ditulis
terang-terangan di layar supaya tidak ada yang mengira dirinya tidak memenuhi
syarat.

## Di mana aturannya tinggal

`private.business_bank_account_stage(business_id)` — **satu-satunya** tempat
"apakah rekening ini berbukti" diputuskan. `fn_readiness_facts` memanggilnya
untuk B5; `private.business_bank_account_json` memanggilnya untuk layar. Kalau
suatu hari kartunya hijau di Perjalanan dan abu-abu di Profil, yang rusak adalah
invarian ini.

Tulisannya lewat tiga RPC `security definer`, masing-masing menulis
`audit_events`; tabelnya hanya `grant select` sesuai `0092`.

## Yang ditemukan sambil jalan, dan sudah diperbaiki

**Seeder 40 UMKM tidak pernah membuat satu dokumen pun.** `scripts/seed-40-umkm.mjs`
memakai kolom `title` dan `created_by` yang tidak ada di `public.documents`
(yang benar `name` dan `user_id`), dan `doc_type: "ktp_owner"` yang bukan jenis
dokumen yang dikenal. PostgREST menolak setiap baris, galatnya ditelan
`try/catch` yang tidak pernah menangkap apa pun (Supabase JS mengembalikan
galat, tidak melemparnya). Sekarang nama kolomnya benar dan galatnya dicetak.

**Urutan unggah berkas diangkat ke `modules/documents/document-upload.ts`.**
Layar Rekening memerlukan urutan yang sama; menyalinnya berarti dua kesempatan
untuk melewatkan tahap terakhir (pendaftaran versi), yang menghasilkan berkas
hantu di storage. Halaman Dokumen sekarang memakai fungsi yang sama.

## Yang ditemukan, belum diperbaiki

**Tidak ada satu jalur pun di aplikasi yang menaikkan `documents.assurance_level`
di atas `self_declared`.** Hanya seeder yang pernah menulis `'confirmed'`. Karena
C1 menuntut `confirmed`/`attested`, **komponen C1 tidak bisa dipenuhi pengguna
sungguhan** — berapa pun izin yang ia unggah. Tombol "sudah saya cek" yang
dijanjikan `assuranceText` belum ada di layar mana pun.

B5 sengaja TIDAK bergantung pada tangga itu: pernyataan pemiliknya disimpan di
`business_bank_accounts.owner_confirmed_at`, bukan di dokumennya. Jadi langkah
baru ini tidak berdiri di belakang pintu yang terkunci. Tetapi C1 masih terkunci,
dan itu pekerjaan tersendiri.

## Yang dilihat lembaga

Satu baris di dossier PDF: "Rekening Usaha Terpisah — Tercatat, dengan berkas
pendukung / Dinyatakan pemilik, tanpa berkas / Belum dipisahkan". Tanpa nama
bank, tanpa angka.

**Tidak ada lingkup consent baru.** Potret `readiness` sudah memuat seluruh
komponen apa adanya sejak `0063`, jadi B5 ikut ke dossier begitu ia menjadi
komponen. Dossier yang dibekukan sebelum `0098` tidak punya B5, dan barisnya
sengaja **tidak ditampilkan** untuk dossier lama — "belum" akan berbohong
tentang sesuatu yang tidak pernah ditanyakan waktu itu.

## Yang sudah terbukti

Dijalankan terhadap PostgreSQL 18 sungguhan, klaster sekali pakai, seluruh 98
migrasi diputar dari nol:

- `npm run db:test` — **lulus**, termasuk bagian "Rekening usaha terpisah
  (0098)" yang menguji penolakan tulis langsung, normalisasi empat digit,
  penolakan dokumen milik usaha lain, kenaikan ke anak tangga kedua, dokumen
  yang diarsipkan berhenti menopang bukti, pelepasan bukti saat nomor diubah,
  isolasi antar usaha, dan jejak auditnya.
- `npm run db:types` — dijalankan ulang; tipe hasil generator **mengganti** tipe
  yang sebelumnya ditulis tangan. Regenerasi itu sekalian menyusul
  ketertinggalan tipe terhadap `0097` yang sudah ada sebelumnya.
- `npx tsc --noEmit`, `npx vitest run` (857 uji), `npm run lint:terms`,
  `npm run build` — semuanya lulus.
- Diperiksa langsung di katalog sistem: tabelnya hanya punya `SELECT` untuk
  `authenticated`, satu kebijakan RLS, dan tidak ada kolom bernama `*number*`.

## Dua hal yang sudah merah SEBELUM pekerjaan ini

1. **`npm run db:baseline:verify` gagal.** Ada dua pernyataan yang hanya ada di
   `supabase/baseline/0001_baseline_schema.sql` dan tidak diproduksi migrasi mana
   pun (trigger `private.institution_role`). Migrasi `0098` hanya menambah, jadi
   ia tidak mungkin menyebabkan selisih ke arah itu. Baseline perlu dibangun
   ulang dengan `npm run db:baseline` — sengaja **tidak** dilakukan di sini
   supaya berkas hasil generator sepanjang 19 ribu baris tidak bercampur dengan
   perubahan fitur ini.
2. **`wp08-pilot-v1` masih berstatus `published`** berdampingan dengan versi
   model tingkat yang berlaku, sejak `0047`. Tidak berbahaya hari ini — fungsi
   skor lama yang memilih "published terbaru" tetap mengambil versi terbaru, dan
   pembaca yang sekarang memilih versinya dengan nama. Karena itu penjaga di
   `db:test` ditulis "hanya satu dari keluarga v2/v3 yang terbit", bukan "hanya
   satu baris terbit di seluruh tabel".

## Langkah verifikasi manual

Yang belum bisa dibuktikan mesin — perjalanan sungguhan lewat peramban, dengan
penyimpanan berkas Supabase yang asli:

1. Buka `/umkm/profil/rekening` sebagai UMKM tanpa catatan rekening: harus ada
   dua pintu, bukan formulir.
2. Catat rekening → buka `/umkm/roadmap`: kartu B5 berubah dari "belum dicatat"
   menjadi "sudah dicatat", dan bar pilar B naik.
3. Unggah rekening koran dari layar itu → kartu menjadi "terpisah, dengan
   buktinya", dan berkasnya muncul di lemari rak **Alat & perjanjian**.
4. Ubah 4 digitnya → buktinya terlepas dan kartunya turun ke "sudah dicatat".
   Ini disengaja.
5. `npm run test:e2e -- rekening-usaha` dengan `PLAYWRIGHT_BASE_URL`,
   `E2E_EMAIL`, dan `E2E_PASSWORD` terisi; tanpa ketiganya, spesnya dilewati.

Migrasinya sendiri belum diterapkan ke proyek Supabase mana pun — baru diuji
pada klaster sekali pakai.
