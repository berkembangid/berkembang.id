# Serah Terima: Mesin Akuntansi SAK EMKM

Tanggal: 2 September 2026 (Asia/Jakarta)
Branch: `feat/akuntansi-sak-emkm` — enam commit di atas `main` (`f2548ab`)
Cakupan: migrasi `0029`–`0039`, `modules/accounting`, `modules/nominal-parser`, `components/warung`, Mode Akuntan, seeder demo, Voice Capture Tahap V-A

Dokumen ini untuk **developer berikutnya**. Ia menjelaskan bentuk sistemnya, keputusan yang menahannya, dan yang belum selesai. Status produk per fitur ada di `STATUS_PRODUK_TERKINI_2026-08-31.md` Bagian 4.4.1–4.4.9; spesifikasinya di `specs/SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md`. Dokumen ini tidak mengulang keduanya.

---

## 1. Kalimat yang menjelaskan seluruhnya

> Pemilik usaha menjawab satu pertanyaan — "uang ini untuk apa" — dan memilih satu dari sepuluh kategori bahasa sehari-hari. Basis data yang menyusun jurnal ganda SAK EMKM dari pilihan itu.

Kalau Anda hanya sempat memahami satu hal, pahami ini: **antarmuka tidak pernah menyentuh kode akun.** Yang memetakan kategori ke debit dan kredit adalah tabel `category_templates`, bukan kode aplikasi dan bukan model bahasa. AI hanya menebak kategori 1–10.

Konsekuensinya, dan ini yang sering dilanggar orang baru: **jangan pernah menambah aturan akuntansi di TypeScript.** Kalau sebuah kategori perlu memetakan ke akun berbeda, yang berubah adalah barisnya di `category_templates`, lewat migrasi.

---

## 2. Peta: di mana sesuatu terjadi

```
Layar pemilik (bahasa warung)          Layar pendamping (bahasa akuntansi)
components/warung/*                    app/(umkm)/umkm/akuntan/page.tsx
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼
        app/api/v1/{accounting,reports,...}/route.ts
                       ▼
        modules/accounting/*.ts        ← membaca, menyusun bentuk, TIDAK menghitung akun
                       ▼
        RPC `security definer` di PostgreSQL
                       ▼
        journal_entries + journal_lines   ← satu-satunya kebenaran
```

**Semua penulisan lewat RPC.** Tabel bersifat select-only untuk peran `authenticated`; `insert/update/delete` sudah dicabut. Kalau Anda perlu menulis sesuatu, tulis RPC baru — jangan memberi grant.

### Berkas yang paling sering perlu dibaca

| Berkas | Isinya |
|---|---|
| `modules/accounting/coa.ts` | 28 akun SAK EMKM, cermin `coa_accounts` |
| `modules/accounting/templates.ts` | 10 kategori × 2 sektor, cermin `category_templates`, ambang alat usaha |
| `modules/accounting/warung.ts` | Aturan bahasa warung: empat kotak, kalimat, perbandingan bulan. **Tanpa istilah akuntansi.** |
| `modules/accounting/period.ts` | Saldo awal, penyusutan, pajak, indikator, pengingat. Berisi `ensurePeriodPosted`. |
| `modules/accounting/reports.ts` | Jurnal, buku besar, neraca saldo, laba rugi, ekspor CSV |
| `modules/accounting/balance-sheet.ts` | Posisi Keuangan formal ↔ "Kondisi Usaha" bahasa pemilik |

---

## 3. Tujuh aturan yang menahan sistem ini

Melanggar salah satunya menghasilkan pembukuan yang tampak benar tetapi tidak bisa dipertanggungjawabkan. Semuanya dijaga uji, bukan kesepakatan lisan.

**1. Jurnal tidak pernah disunting.** Trigger `journal_entries_immutable` menolak setiap `UPDATE`/`DELETE`. Koreksi selalu berupa entry pembalik plus entry baru.

**2. Pembalikan bertanggal di dalam periodenya, kecuali pembalikan transaksi.** Penyusutan, pajak, dan koreksi stok dibalik di akhir bulan yang dikoreksi (`private.reverse_journal_entry_on`) supaya Posisi Keuangan pada tanggal lampau tetap benar. Pembalikan transaksi bertanggal hari posting — aturan spek, dan perkiraan pajak dirancang mengikutinya (lihat §5).

**3. Template tidak pernah ditebak.** Kombinasi (sektor, kategori) yang tidak punya template gagal keras dengan `CATEGORY_TEMPLATE_NOT_FOUND`. Menebak berarti menebak akun.

**4. Isolasi memakai `private.accounting_business_access`, bukan `private.business_role`.** Yang kedua pernah mengembalikan `'owner'` tanpa syarat — setiap akun menjadi pemilik usaha mana pun. Jangan memakainya untuk tabel akuntansi.

**5. Agregat apa pun tetap tunduk RLS.** Itu sebabnya `indicator_monthly` adalah tabel biasa, bukan materialized view: matview PostgreSQL tidak tunduk RLS.

**6. Tidak ada istilah akuntansi di layar pemilik.** Dijaga `npm run lint:terms`, yang juga melarang bahasa penilaian kredit **di mana pun** (POJK 29/2024). Mode Akuntan adalah satu-satunya pengecualian untuk istilah akuntansi.

**7. `npm run db:test` adalah gate wajib sebelum `supabase db push`.** Delapan kerusakan yang ditemukan sepanjang pekerjaan ini semuanya lolos `build` dan `typecheck`. Build tidak pernah bisa membuktikan SQL.

---

## 4. Mesin yang berjalan sebelum laporan dibaca

Tiga hal harus sudah diposting sebelum angka dibaca, dan ketiganya digabung dalam satu fungsi:

```ts
// modules/accounting/period.ts
export async function ensurePeriodPosted(asOf: string)
//   1. ensure_depreciation_posted   penyusutan garis lurus per aset per bulan
//   2. ensure_tax_estimated         PPh final 0,5% atas omzet di atas Rp500 juta
//   3. ensure_indicators_rebuilt    indikator bulanan + versi rumus
```

Digabung dengan sengaja: memisahkannya berarti setiap pembaca baru harus ingat memanggil tiga hal, dan lupa satu tidak menghasilkan error — hanya laporan yang diam-diam tertinggal satu bulan.

Ketiganya **idempoten** dan **memperbaiki diri sendiri**. Pajak dan indikator menyimpan sidik jari sumbernya; kalau omzet bergeser karena koreksi, bulan itu dihitung ulang tanpa satu pun jalur tulis buku kas perlu tahu soal pajak.

**Jebakan yang sudah pernah menggigit:** `app/api/v1/reports/financial-statements/route.ts` menjalankan enam pembacaan dalam satu `Promise.all`. `ensurePeriodPosted` harus dipanggil **sekali di depan**, bukan dibiarkan terpicu salah satu pembacaan — kalau tidak, satu berkas PDF bisa memuat dua angka pajak yang berbeda.

---

## 5. Keputusan yang tidak jelas dari kode

Enam hal yang akan terlihat aneh sampai Anda tahu alasannya.

### Ambang alat usaha Rp500.000

Belanja kategori 8 di bawah ambang menjadi biaya bulan berjalan (kategori 6 / `5290`), bukan alat yang disusutkan. Aturannya di `fn_post_transaction_journal` — corong tunggal yang dilewati **setiap** jalur tulis. Ia memindahkan **baris transaksinya juga**, bukan hanya jurnalnya.

Tanpa ini, pisau Rp15.000 menghasilkan 48 baris jurnal penyusutan Rp312 sebulan. Uji `db:test` membuktikan warung beromzet Rp1,2 juta setahun ditagih Rp6.000 kalau aturannya dimatikan.

### Pajak bulanan boleh negatif

`tax_estimates` sengaja tanpa batasan non-negatif. Pembalikan transaksi bertanggal hari pembatalan, jadi membatalkan penjualan Agustus pada September membuat omzet September negatif — dan pajak yang terlanjur diakui dilepaskan di bulan itu. Memaksanya nol mengunci pemilik pada pajak atas penjualan yang tidak pernah jadi.

Pembulatan dilakukan pada angka **kumulatif**, bukan per bulan, supaya dua belas pembulatan tidak menumpuk menjadi selisih terhadap perhitungan setahun.

### Nilai alat lama = nilai pakainya di hari pertama mencatat

Kulkas Rp3.000.000 yang dibeli dua bulan sebelum pencatatan dimulai masuk sebagai Rp2.968.750 dengan sisa umur 95 bulan. `fixed_assets.original_cost_idr` menyimpan harga aslinya supaya koreksi kedua tidak menyusutkannya lagi.

### `capital_in` mengecualikan entry `OPENING`

Akun `3100` pada entry saldo awal adalah penyeimbang, bukan setoran modal. Tanpa pengecualian ini bulan pertama tampak seolah pemilik menyuntik modal sebesar seluruh kekayaan usahanya — dan angka itulah yang dulu tercetak di lampiran PDF.

### Dua set template sektor, bukan delapan

Yang berbeda antar sektor hanya kata-katanya; akunnya identik. `db:test` membandingkan aturan posting kedua sektor **baris demi baris** dan mewajibkannya sama. Enam sektor SI APIK sisanya menunggu daftar kanonik dari Pedoman PTK BI–IAI (lihat §7).

### Pengingat diturunkan, tidak disimpan

`fn_pending_reminders` menghitung dari keadaan setiap kali dibaca. Tidak ada baris pengingat dan tidak ada penjadwal. Akibatnya pengingat hilang sendiri saat pekerjaannya dilakukan, tidak bisa muncul dua kali, dan tidak pernah basi. Baris pemberitahuan tersimpan akan menuntut dedup, kedaluwarsa, dan pembersihan.

---

## 6. Cara menjalankan dan gate

```powershell
npm.cmd install
npm.cmd run dev
```

Delapan gate, semuanya hijau pada commit ini:

```powershell
npm.cmd run typecheck        # tsc --noEmit
npm.cmd run lint             # 0 error, 38 warning lama
npm.cmd run lint:terms       # bahasa penilaian kredit & istilah akuntansi di layar pemilik
npm.cmd test                 # 286 lulus, 1 dilewati
npm.cmd run test:integration # 65 lulus (uji kontrak, tanpa basis data)
npm.cmd run build
npm.cmd run db:types:check   # tipe TypeScript sinkron dengan skema
```

Yang kedelapan butuh PostgreSQL lokal dengan nama basis data berakhiran `_test`:

```powershell
$env:DATABASE_TEST_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/berkembang_test"
npm.cmd run db:test
```

Skrip menolak host non-lokal dan basis data yang namanya tidak berakhiran `_test`, karena ia menghapus dan membangun ulang skema. **Jalankan ini sebelum setiap `supabase db push`.**

### Ketika `db:test` gagal

Ia menyebut assertion yang gagal beserta nilainya. Cara membaca hasilnya: assertion di `scripts/verify-database-migrations.mjs` ditulis sebagai kalimat yang menjelaskan **kenapa** aturannya ada, bukan sekadar apa yang dibandingkan. Contoh: `"only the turnover above the threshold is taxed, never the whole month"`.

---

## 7. Yang belum selesai

### Sudah dikerjakan, menunggu tindakan Anda

**Migrasi `0032`–`0038` belum ada di Supabase produksi.** Pemeriksaan terakhir: remote berhenti di `0031`. Sampai di-push, tab Kondisi Usaha dan Mode Akuntan akan gagal, karena keduanya memanggil `ensure_tax_estimated` (0035) dan `ensure_indicators_rebuilt` (0036).

```powershell
npx supabase db push --dry-run   # pastikan tepat tujuh berkas
npx supabase db push
```

Backup dulu lewat Dashboard: `0032` menautkan alat dan pinjaman lama ke baris saldo awalnya dan **berhenti dengan assertion** kalau menemukan baris yang tidak bisa ditautkan dengan yakin. Itu disengaja supaya tidak menebak, tetapi artinya push bisa berhenti di tengah.

Kalau jaringan Anda memblokir port 5432 (kampus, kantor, sebagian ISP), `db push` akan menggantung tanpa pesan. Gejalanya: `ECONNREFUSED` ke port 5432 sementara 6543 terbuka. Jalan keluarnya `npm run db:push:pooler -- --dry-run`, dan penjelasannya ada di kepala `scripts/db-push-pooler.mjs`.

**Seeder demo belum selesai dijalankan.** Data UMKM lengkap (142 transaksi, jurnal seimbang, sepuluh kategori terpakai), tetapi permintaan akses bank belum terbentuk. Jalankan ulang; ia idempoten.

### Belum dikerjakan

**Enam sektor SI APIK sisanya.** Mekanismenya sudah terbukti sektor-agnostik, jadi ini pengisian data, bukan pembangunan ulang. Yang ditunggu adalah **daftar sektor kanonik dari Pedoman PTK BI–IAI / SI APIK**. Jangan menyusunnya dari ingatan: daftar karangan akan terlihat sah sampai dibaca pendamping atau petugas bank.

**Laba/rugi pelepasan alat belum tampil terpisah di CALK.** Jurnalnya sudah benar (`4200` untuk untung, `5290` untuk rugi); yang belum adalah barisnya di Catatan atas Laporan Keuangan.

**E2E Playwright** `tests/e2e/warung-prive.spec.ts` masih dilewati tanpa `PLAYWRIGHT_BASE_URL`, `E2E_EMAIL`, dan `E2E_PASSWORD`.

**38 warning lint lama** di portal admin (hook dependency, variabel tak terpakai). Tidak satu pun error.

---

## 8. Kalau Anda akan menyentuh bagian ini

Empat nasihat dari kesalahan yang sudah terjadi.

**Menambah kolom ke `v_general_ledger`?** Tambahkan di belakang kolom yang sudah ada; `create or replace view` hanya mengizinkan penambahan di akhir. Dan kalau Anda mengubah `order by` di window `running_balance`, ubah juga urutan pembacaannya di `modules/accounting/reports.ts` — keduanya wajib sama, dan uji kontrak `0034` menjaganya.

**Menambah jalur tulis transaksi baru?** Ia harus memanggil `fn_post_transaction_journal`. Semua aturan yang berlaku pada transaksi — ambang alat usaha, pemisahan bunga, pendaftaran aset — hidup di sana, dan hanya di sana.

**Mengubah rumus indikator?** Naikkan `private.indicator_formula_version()` dan `indicatorFormulaVersion` di `statement-document.ts` bersamaan. Uji kontrak membandingkan keduanya. Berkas PDF lama mencetak versinya, sehingga angkanya tetap bisa dijelaskan.

**Menambah komponen di layar pemilik?** Jangan memakai warna bawaan Tailwind (`slate-500`, `blue-600`). Uji kontrak memeriksa seluruh `components/warung/` dan dua halaman UMKM, dan akan merah. Palet dan komponennya ada di `components/dashboard`.

---

## 8.1 Voice Capture Tahap V-A

Ditambahkan setelah dokumen ini pertama ditulis. Empat berkas yang perlu Anda kenal:

| Berkas | Isinya |
|---|---|
| `modules/nominal-parser/` | Satu-satunya tempat angka lahir dari ucapan. Murni, deterministik, 168 uji |
| `modules/ledger/capture-routing.ts` | Pemilihan jalur, gating tiga tingkat, pertanyaan maksimal satu, telemetry |
| `modules/ledger/capture-amount-guard.ts` | Menimpa nominal keluaran model dengan hasil parser di jalur Whisper |
| `components/warung/VoiceDraftCard.tsx` | Kartu draf yang menyorot bukti di transkrip |

**Aturan kedelapan, setara dengan tujuh di atas: angka tidak pernah berasal dari model bahasa.** Kalau Anda menambah jalur baru yang menghasilkan draf, ia wajib melewati `enforceParserAmounts`. Skema keluaran model sengaja tidak punya medan nominal, dan `parseLlmCategory` menghitung setiap percobaan melanggarnya.

**Kalau Anda mengerjakan Tahap V-B**, jalankan `npm run check:voice-bundle` sejak baris pertama: anggarannya 15 KB gzip dan parser sudah memakai 5,9 KB sebagai batas atas.

**Yang belum diverifikasi:** `tests/e2e/voice-typed-capture.spec.ts` belum pernah dijalankan. Ia butuh aplikasi berjalan dan remote yang sudah dimigrasi sampai `0039`.

## 9. Riwayat commit

```
5e576a4  feat(akuntansi): mesin jurnal SAK EMKM di balik buku kas warung
86e6139  refactor(ui): sistem desain bersama untuk seluruh portal
f2548ab  fix(db): perbaiki function capture roleless yang broken di migration 0027  ← main
```

Commit pertama berdiri sendiri: tidak ada satu berkas pun di dalamnya yang mengimpor `modules/accounting` atau `components/warung`. Commit kedua berisi mesinnya beserta semua yang bergantung padanya, dan sengaja tidak dipecah lebih jauh — memisahkan migrasi dari modul yang memakainya menghasilkan commit yang tidak bisa dijalankan sendiri.
