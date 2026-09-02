# Spesifikasi Fitur: Laporan Keuangan "Satu Engine, Dua Wajah"

**Produk:** BERKEMBANG.ID · Tim P0160
**Modul:** `ledger` (diperluas) + modul baru `accounting`
**Versi:** 1.0 · 1 September 2026
**Untuk:** Harsya (CTO), Yosua (Product/UX) · **Dari:** Hadi
**Melengkapi:** *Standar Pencatatan sebagai Fondasi Build* (v1.0, 1 Sep 2026) dan *Spec Brief Journey UMKM* (1 Sep 2026)
**Basis kode yang dirujuk:** commit `f2548ab`, audit *Status Produk Terkini 2026-08-31*

> **Satu kalimat untuk dipegang saat build:**
> UMKM hanya menjawab "uang masuk atau keluar, berapa, untuk apa". Sistem menyusun jurnal ganda SAK EMKM di belakang. Yang keluar ke bank adalah tiga laporan SAK EMKM dan indikator terbuka, bukan skor kredit.

---

## 0. Ringkasan keputusan

| # | Keputusan | Alasan singkat |
|---|---|---|
| D1 | **Single entry di antarmuka, double entry di basis data.** UMKM memilih 1 dari 10 kategori bahasa warung; sistem menghasilkan jurnal ganda dari template deterministik. | Pendekatan Pedoman PTK BI–IAI (SI APIK). Menjadikan klaim "kompatibel SAK EMKM" bisa dibuktikan tanpa membebani UMKM. |
| D2 | **Jurnal Umum, Buku Besar, Neraca Saldo adalah artefak sistem**, bukan fitur yang UMKM pelihara. Ketiganya read-only di "Mode Akuntan". Neraca Lajur **tidak dibangun**. | Siklus akuntansi manual runtuh menjadi query di software. Neraca lajur adalah kertas kerja manusia. |
| D3 | **Tiga laporan SAK EMKM wajib lengkap**: Laporan Posisi Keuangan, Laporan Laba Rugi, Catatan atas Laporan Keuangan (CALK). Laporan Arus Kas sebagai pelengkap (dibaca bank, bukan syarat SAK EMKM). | Tanpa Posisi Keuangan dan CALK, klaim SAK EMKM tidak jujur. Posisi Keuangan naik dari P2 → P1 dibanding dokumen Standar v1.0. |
| D4 | **Jurnal penyesuaian dibatasi dua jenis** yang relevan untuk mikro: penyusutan aset (otomatis) dan koreksi stok akhir bulan (opsional, input UMKM). Plus pemisahan bunga saat bayar cicilan. | Akrual ringan yang cukup untuk SAK EMKM versi mikro. |
| D5 | **Tidak ada jurnal penutup tersimpan di MVP.** Saldo laba dan prive dihitung kumulatif dari jurnal saat laporan diminta. | Engine tetap stateless; laporan selalu dapat direproduksi dari jurnal. |
| D6 | **Wizard saldo awal wajib** sebelum Posisi Keuangan bisa ditampilkan. 6 pertanyaan bahasa warung. | Tanpa saldo awal, neraca tidak bisa disusun dan saldo kas tidak bermakna. |
| D7 | **AI hanya menebak kategori sederhana; AI tidak pernah memutuskan akun.** Pemetaan kategori → akun adalah tabel, bukan prompt. | Auditabilitas. "AI membaca, aturan menilai." |
| D8 | **Koreksi dan pembatalan = jurnal pembalik + jurnal baru.** Jurnal tidak pernah di-update atau dihapus. | Konsisten dengan aturan ledger yang ada (soft delete dengan alasan, tanggal terkunci setelah tutup kas). |
| D9 | **Sektor pilot: pangan olahan kemasan (rumah produksi).** Template kategori 5–6 dispesifikkan untuk sektor ini; struktur tetap sektor-agnostik (8 sektor SIAPIK). | Fokus GTM tanpa mengunci arsitektur. |
| D10 | **Kata terlarang di UI dan PDF** (skor kredit, layak kredit, plafon, disetujui/ditolak) ditegakkan lewat lint teks otomatis. | Garis batas POJK 29/2024. |

---

## 1. Peta siklus akuntansi → sistem

| Langkah siklus (manual) | Di berkembang.id | Dikerjakan oleh | Terlihat di |
|---|---|---|---|
| Bukti transaksi | Ucapan suara / teks / foto nota via `/api/v1/captures` (sudah ada) | UMKM | Mode Warung: layar Catat |
| Jurnal umum | Tabel `journal_entries` + `journal_lines`, 1 entry per transaksi terkonfirmasi, dari `category_templates` | Sistem | Mode Akuntan (read-only) |
| Buku besar | View `v_general_ledger` (lines per akun, running balance) | Sistem | Mode Akuntan |
| Neraca saldo | Fungsi `fn_trial_balance(business_id, as_of)` | Sistem | Mode Akuntan |
| Jurnal penyesuaian | (a) `fn_post_monthly_depreciation` otomatis; (b) `inventory_counts` → entry koreksi persediaan; (c) split bunga/pokok pada kategori 7 | Sistem (+ UMKM opsional untuk b) | Mode Warung: satu kolom "Hitung stok" |
| Neraca lajur | **Tidak dibangun** | — | — |
| Laporan | `fn_income_statement`, `fn_balance_sheet`, `fn_cash_flow`, CALK template → PDF | Sistem | Mode Warung (bahasa warung) · PDF SAK EMKM (format IAI) |

---

## 2. Dua wajah, satu sumber

```
UMKM bicara ──► AI ekstrak: nominal, arah, kategori 1–10, metode bayar, tanggal
                          │
                          ▼  konfirmasi satu layar (sudah ada: needs_review → confirmed)
              ┌──────────────────────────────────┐
              │  JOURNAL_ENTRIES + JOURNAL_LINES  │ ◄── category_templates (deterministik)
              │  satu sumber kebenaran            │ ◄── penyusutan bulanan otomatis
              └──────────────┬───────────────────┘ ◄── koreksi stok (opsional)
                             │                     ◄── saldo awal (wizard)
         ┌───────────────────┼───────────────────────────┐
         ▼                   ▼                           ▼
   MODE WARUNG          MODE AKUNTAN                PDF SAK EMKM + DOSSIER
   "Untung bulan ini"   Jurnal Umum                 Laporan Posisi Keuangan
   "Uang yang harus     Buku Besar                  Laporan Laba Rugi
    ada di laci"        Neraca Saldo                Catatan atas Laporan Keuangan
   "Diambil buat        (read-only, ekspor CSV      Laporan Arus Kas (pelengkap)
    rumah"               berkolom akun SAK EMKM)    Indikator 6 bulan + disclaimer
```

Aturan: **kedua wajah membaca tabel yang sama.** Tidak ada agregat yang disimpan terpisah dari jurnal kecuali `indicator_monthly` (materialized, versi rumus tercatat, bisa di-rebuild).

---

## 3. Chart of Accounts (SAK EMKM, versi mikro)

Kode 4 digit. Kolom `report_line` menunjuk baris di laporan SAK EMKM. `normal_balance` menentukan tanda saldo.

| Kode | Nama akun | Tipe | Normal | Baris laporan |
|---|---|---|---|---|
| 1100 | Kas | Aset | Debit | Posisi Keuangan → Kas dan setara kas → Kas |
| 1200 | Bank / Giro | Aset | Debit | Posisi Keuangan → Kas dan setara kas → Giro |
| 1300 | Piutang Usaha | Aset | Debit | Posisi Keuangan → Piutang usaha |
| 1400 | Persediaan | Aset | Debit | Posisi Keuangan → Persediaan |
| 1500 | Beban Dibayar di Muka | Aset | Debit | Posisi Keuangan (Tahap C) |
| 1600 | Aset Tetap | Aset | Debit | Posisi Keuangan → Aset tetap |
| 1690 | Akumulasi Penyusutan | Aset (kontra) | Kredit | Posisi Keuangan → Akumulasi penyusutan |
| 2100 | Utang Usaha | Liabilitas | Kredit | Posisi Keuangan → Utang usaha |
| 2200 | Utang Bank | Liabilitas | Kredit | Posisi Keuangan → Utang bank |
| 2300 | Utang Pinjaman Lain | Liabilitas | Kredit | Posisi Keuangan → Utang bank (digabung, dirinci di CALK) |
| 2400 | Utang Pajak | Liabilitas | Kredit | Posisi Keuangan (Tahap C) |
| 3100 | Modal Pemilik | Ekuitas | Kredit | Posisi Keuangan → Modal |
| 3200 | Prive | Ekuitas (kontra) | Debit | Posisi Keuangan → Modal (pengurang, dirinci di CALK) |
| 3300 | Saldo Laba | Ekuitas | Kredit | Posisi Keuangan → Saldo laba (defisit) — **dihitung**, tidak diposting |
| 4100 | Pendapatan Usaha | Pendapatan | Kredit | Laba Rugi → Pendapatan usaha |
| 4200 | Pendapatan Lain-lain | Pendapatan | Kredit | Laba Rugi → Pendapatan lain-lain |
| 5100 | Beban Pokok Penjualan | Beban | Debit | Laba Rugi → Beban usaha (dirinci sebagai HPP di CALK) |
| 5210 | Beban Bahan Bakar & Energi | Beban | Debit | Laba Rugi → Beban usaha |
| 5220 | Beban Utilitas (listrik, air, internet) | Beban | Debit | Laba Rugi → Beban usaha |
| 5230 | Beban Gaji & Upah | Beban | Debit | Laba Rugi → Beban usaha |
| 5240 | Beban Sewa | Beban | Debit | Laba Rugi → Beban usaha |
| 5250 | Beban Kemasan & Label | Beban | Debit | Laba Rugi → Beban usaha |
| 5260 | Beban Transport & Ongkir | Beban | Debit | Laba Rugi → Beban usaha |
| 5270 | Beban Promosi & Komisi Platform | Beban | Debit | Laba Rugi → Beban usaha |
| 5280 | Beban Penyusutan | Beban | Debit | Laba Rugi → Beban usaha |
| 5290 | Beban Usaha Lain-lain | Beban | Debit | Laba Rugi → Beban usaha |
| 5310 | Beban Bunga Pinjaman | Beban | Debit | Laba Rugi → Beban lain-lain |
| 5400 | Beban Pajak Penghasilan | Beban | Debit | Laba Rugi → Beban pajak penghasilan |

Catatan: Harsya mencocokkan nama akun dengan contoh CoA di SAK EMKM dan Buku Pedoman Literasi SIAPIK sebelum dikunci (lihat Bagian 10 dokumen Standar).

---

## 4. Template jurnal: 10 kategori sederhana → jurnal ganda

Notasi: **Kas\*** = akun 1100 jika `payment_method = TUNAI`, akun 1200 jika `QRIS` atau `TRANSFER`. **Utang\*** = 2100 (supplier), 2200 (bank), 2300 (koperasi/keluarga) sesuai `counterparty_type`.

| # | Kategori (bahasa warung) | Contoh ucapan | Debit | Kredit | Arus kas | Catatan aturan |
|---|---|---|---|---|---|---|
| 1 | Laku / Jualan | "tadi laku 47 ribu", "masuk QRIS 120" | Kas\* | 4100 | Operasi (+) | Jika `payment_method = BELUM_DIBAYAR` → otomatis jadi kategori 10 |
| 2 | Pemasukan lain | "dapat sewa etalase 200", "komisi titip jual" | Kas\* | 4200 | Operasi (+) | Dipisah dari penjualan inti |
| 3 | Piutang dibayar | "Bu Sari bayar utang 50" | Kas\* | 1300 | Operasi (+) | **Bukan pendapatan**. Kurangi saldo piutang `counterparty` |
| 4a | Modal masuk | "suami kasih modal 500" | Kas\* | 3100 | Pendanaan (+) | **Tidak pernah masuk pendapatan** |
| 4b | Pinjaman masuk | "pinjaman koperasi cair 2 juta" | Kas\* | Utang\* | Pendanaan (+) | Buat baris `loans` (pokok, cicilan/bln) |
| 5 | Belanja bahan / barang | "belanja ayam 300", "kulak stok 1,2 juta" | 5100 | Kas\* (atau 2100 jika BELUM_DIBAYAR) | Operasi (−) | Dibebankan saat beli (periodik). Dikoreksi oleh `inventory_counts` |
| 6 | Biaya usaha | "gas 22 ribu", "gaji Rina 800", "sewa kios" | 52xx (sub oleh AI) | Kas\* (atau 2100) | Operasi (−) | Sub-akun 5210–5290; default 5290 jika AI ragu |
| 7 | Bayar utang / cicilan | "nyicil koperasi 250", "bayar utang supplier" | Utang\* (pokok) + 5310 (bunga) | Kas\* | Pendanaan (−) pokok; Operasi (−) bunga | Layar konfirmasi tanya "berapa bunganya?" bila `loans` punya suku bunga; default 0 |
| 8 | Beli alat / aset | "beli kulkas 3 juta", "etalase baru" | 1600 | Kas\* (atau Utang\*) | Investasi (−) | Buat baris `fixed_assets`; penyusutan mulai bulan berikutnya. **Di bawah Rp500.000 diperlakukan sebagai kategori 6 subtipe 5290** — lihat §4.1 |
| 9 | Ambil untuk rumah (prive) | "ambil 100 buat dapur", "SPP anak dari laci" | 3200 | Kas\* | Pendanaan (−) | **Tidak pernah masuk beban**. Pemicu: rumah, anak, sekolah, dapur, pribadi |
| 10 | Ngutangin pelanggan | "Bu Ani ngutang 35" | 1300 | 4100 | Non-kas | Pendapatan akrual; tampil sebagai "belum dibayar" |


### 4.1 Batas bawah alat usaha

Belanja kategori 8 **kurang dari Rp500.000** tidak menjadi alat usaha. Ia dicatat sebagai kategori 6 subtipe `5290` (Biaya usaha lainnya), tidak menghasilkan baris `fixed_assets`, dan tidak pernah disusutkan. Batasnya "kurang dari", bukan "sampai dengan": belanja tepat Rp500.000 masih alat usaha.

Alasannya: tanpa batas bawah, pisau Rp15.000 akan disusutkan Rp312 sebulan selama empat tahun — 48 baris jurnal, satu baris permanen di daftar alat, dan satu baris di CALK, untuk uang yang sudah habis terpakai bulan itu juga.

Aturannya dipasang di `fn_post_transaction_journal`, corong tunggal yang dilewati setiap jalur tulis, dan ia **memindahkan baris transaksinya juga**, bukan hanya jurnalnya. Angka ambangnya hidup di `private.fixed_asset_threshold_idr()`.

Pemindahannya wajib dijelaskan ke pemilik di layar konfirmasi — satu kalimat yang menyebut nominalnya, akibatnya pada untung bulan ini, dan batasnya. Memindahkan tanpa berkata apa-apa melanggar aturan "jelaskan akibatnya, jangan diam-diam mengubah".

### 4.2 Jurnal otomatis (bukan dari ucapan)

| Peristiwa | Debit | Kredit | Pemicu |
|---|---|---|---|
| Saldo awal | 1100, 1200, 1300, 1400, 1600 (sesuai isian) | 2100, 2200/2300 (sesuai isian); **3100 sebagai penyeimbang** | Wizard saldo awal selesai. Satu entry, `source = OPENING`. Jika utang > aset, 3100 di sisi debit dengan peringatan |
| Penyusutan bulanan | 5280 | 1690 | Job akhir bulan / saat laporan diminta untuk bulan yang belum diposting. Garis lurus: `harga / (umur_bulan)`. Per aset |
| Koreksi stok | Jika `stok_akhir > saldo 1400`: 1400 / 5100. Jika `<`: 5100 / 1400 | | UMKM isi "Hitung stok" akhir bulan. Efek: HPP = pembelian − kenaikan persediaan |
| Pembalikan (koreksi/batal) | Kebalikan entry asli | | Selalu entry baru bertanggal posting hari ini, `reverses_entry_id` menunjuk asli, alasan wajib |
| Estimasi pajak | 5400 | 2400 | Omzet kumulatif tahun takwim > Rp500 juta (WP OP) → PPh final 0,5% **atas bagian yang melewati ambang saja**, bukan atas seluruh omzet bulan berjalan. Pembulatan pada angka kumulatif. Selisih bulanan boleh negatif: itulah pelepasan pajak saat penjualannya dibatalkan. Label "perkiraan" wajib di setiap tempat angkanya muncul |

**Umur manfaat default aset** (mengikuti kelompok fiskal, boleh diubah UMKM): peralatan/etalase/kompor 48 bulan; mesin/kulkas/freezer 96 bulan; kendaraan 96 bulan; bangunan 240 bulan.

---

## 5. Model data

Migrasi baru mulai `0029`. Semua tabel: `business_id` + RLS pola yang sama dengan `0021`/`0027`. Nominal `bigint` rupiah bulat. Tanggal bisnis memakai `date` di zona Asia/Jakarta (pola yang sudah ada).

### 5.1 Tabel referensi (seed, tanpa business_id)

```
coa_accounts
  code            text PK            -- '1100'
  name            text
  account_type    enum(ASET, LIABILITAS, EKUITAS, PENDAPATAN, BEBAN)
  normal_balance  enum(DEBIT, KREDIT)
  is_contra       boolean
  report_line     text               -- kunci baris di template laporan
  parent_code     text null          -- '5200' untuk 5210..5290
  is_active       boolean

category_templates
  id              uuid PK
  sector          enum(8 sektor SIAPIK)   -- terisi: PERDAGANGAN_KULINER (barang)
                                          -- dan JASA. Dipilih dari jawaban
                                          -- `profiles.sektor_usaha`; yang
                                          -- berbeda hanya label, tidak pernah
                                          -- akunnya. Enam sisanya menunggu
                                          -- daftar kanonik PTK BI-IAI.
  category_code   smallint (1..10)
  subtype         text null               -- '4a','4b', atau sub-beban '5210'..
  label_umkm      text                    -- "Laku / Jualan"
  debit_rule      text                    -- 'CASH_STAR' | '1300' | '5100' | 'LIABILITY_STAR' ...
  credit_rule     text
  cash_flow_section enum(OPERASI, INVESTASI, PENDANAAN, NON_KAS)
  affects_pnl     boolean
  trigger_keywords text[]                 -- untuk AI hint, bukan keputusan akun
  version         text                    -- 'coa-emkm-v1'
```

### 5.2 Perluasan tabel transaksi yang ada

Periksa skema aktual di migrasi `0021` lalu tambahkan (nama kolom menyesuaikan konvensi yang ada):

```
transactions
  + category_code     smallint null       -- 1..10
  + category_subtype  text null           -- '4a'/'4b'/'5210'...
  + counterparty_id   uuid null           -- pelanggan/supplier/pemberi pinjaman
  + interest_amount   bigint default 0    -- untuk kategori 7
  + needs_reclass     boolean default false
  + journal_entry_id  uuid null           -- FK ke journal_entries, diisi saat confirmed
```

**Backfill** transaksi lama: arah MASUK → kategori 1, arah KELUAR → kategori 6 subtype 5290, `needs_reclass = true`. Beranda menampilkan "X transaksi lama perlu dicek kategorinya" dengan tindakan satu ketuk.

Perluasan `payment_method`: tambah nilai `BELUM_DIBAYAR`.

### 5.3 Tabel baru

```
journal_entries
  id              uuid PK
  business_id     uuid
  entry_date      date                    -- tanggal transaksi (bukan input)
  posted_at       timestamptz
  source          enum(TRANSACTION, OPENING, DEPRECIATION, INVENTORY_ADJ, REVERSAL, TAX_ESTIMATE)
  source_id       uuid null               -- transactions.id / fixed_assets.id / inventory_counts.id
  reverses_entry_id uuid null
  memo            text
  template_version text                   -- 'coa-emkm-v1'
  created_by      uuid

journal_lines
  id              uuid PK
  entry_id        uuid FK
  account_code    text FK coa_accounts
  debit           bigint default 0
  credit          bigint default 0
  line_order      smallint
  CHECK (debit = 0 OR credit = 0), CHECK (debit >= 0 AND credit >= 0)

-- INVARIAN (trigger AFTER INSERT pada journal_lines, deferrable per entry):
--   SUM(debit) = SUM(credit) per entry_id, dan >= 2 lines

counterparties
  id, business_id, name, type enum(PELANGGAN, SUPPLIER, BANK, KOPERASI, KELUARGA, LAIN), is_active

opening_balances
  id, business_id, start_date, cash, bank, receivables, payables, inventory,
  loans_bank, loans_other, fixed_assets_total, notes, journal_entry_id, completed_at
  UNIQUE(business_id)

fixed_assets
  id, business_id, name, acquired_on date, cost bigint, useful_life_months int,
  salvage_value bigint default 0, source_transaction_id uuid null, disposed_on date null

depreciation_postings
  id, asset_id, period_month date (YYYY-MM-01), amount, journal_entry_id
  UNIQUE(asset_id, period_month)

loans
  id, business_id, counterparty_id, principal bigint, outstanding bigint,
  monthly_installment bigint null, annual_rate numeric null, started_on, source_transaction_id

inventory_counts
  id, business_id, period_month date, counted_value bigint, journal_entry_id, notes
  UNIQUE(business_id, period_month)

indicator_monthly (tabel ber-RLS, rebuildable per bulan)
  business_id, period_month, revenue, cogs, opex, interest, net_income,
  prive, capital_in (tanpa entry OPENING), receivable_new,
  noncash_sales, noncash_sales_ratio (= penjualan lewat rekening / seluruh
  pendapatan; null bila tidak ada penjualan), days_recorded, formula_version,
  source_entry_count, source_last_posted_at
  Bukan materialized view: matview PostgreSQL tidak tunduk RLS.
```

### 5.4 View dan fungsi laporan (SQL, server-side)

```
v_general_ledger(business_id, account_code, entry_date, entry_id, debit, credit, running_balance)
fn_trial_balance(business_id, as_of date)            → per akun: total debit, total kredit, saldo
fn_income_statement(business_id, date_from, date_to)  → baris SAK EMKM + rincian sub-beban
fn_balance_sheet(business_id, as_of date)             → baris SAK EMKM; Saldo Laba = Σ(4xxx − 5xxx) s.d. as_of
fn_cash_flow(business_id, date_from, date_to)         → operasi / investasi / pendanaan dari lines akun 1100+1200
fn_notes_data(business_id, date_from, date_to)        → payload untuk template CALK
```

Semua fungsi `security invoker` dan tunduk RLS. Tidak ada agregat yang bergantung pada `service role`.

---

## 6. Alur dan aturan bisnis

### 6.1 Posting
1. Transaksi berpindah ke `confirmed` (alur `/api/v1/captures/:id/confirm` atau `POST /api/v1/ledger`) **dalam transaksi database yang sama** membuat `journal_entries` + `journal_lines` dari `category_templates`.
2. Jika `category_code` null (transaksi lama) → tidak diposting; muncul di daftar `needs_reclass`.
3. Template dipilih oleh `(sector, category_code, subtype)`. Jika tidak ditemukan → gagal keras (bukan fallback diam-diam).

### 6.2 Koreksi dan pembatalan
- `PATCH /api/v1/ledger/transactions/:id` → entry pembalik bertanggal hari ini + entry baru. Alasan wajib (sudah ada).
- `DELETE` (pembatalan logis) → entry pembalik saja.
- Tanggal yang sudah tutup kas: tetap tidak bisa diedit, pembatalan tetap boleh (aturan sekarang). Pembalikan selalu bertanggal posting, bukan tanggal asli.

### 6.3 Saldo awal
- Wizard 6 pertanyaan (Bagian 8). Sekali selesai, membuat satu entry `OPENING` bertanggal `start_date`.
- **Amandemen 2 Sep 2026 — kondisi awal bisa diperbaiki.** Versi awal spek ini menyamakan "idempoten" (jangan dobel saat retry) dengan "immutable" (tidak pernah bisa dikoreksi). Akibatnya pemilik yang salah ketik terkunci selamanya, dan wizard tetap menampilkan berhasil tanpa mengubah apa pun. Koreksi kini tersedia lewat `correct_opening_balances` dengan aturan yang sama seperti koreksi lain: entry `OPENING` lama dibalik **bertanggal `start_date` aslinya** (bukan hari posting), lalu entry baru disusun. Baris `opening_balances` tetap satu per usaha.
- Penyusutan yang sudah diposting dihitung ulang saat koreksi: entry bulanannya dibalik di akhir bulan masing-masing, `depreciation_postings`-nya dihapus, lalu dipasang kembali dari angka baru.
- Riwayat pembayaran cicilan dipertahankan: `sudah dibayar = pokok lama − sisa lama`, dan sisa baru = `pokok baru − sudah dibayar`. Pinjaman yang sudah pernah dicicil tidak boleh dihilangkan dari kondisi awal (`LOAN_HAS_PAYMENTS`).
- `start_date` boleh dimundurkan bebas; dimajukan hanya bila tidak ada transaksi terkonfirmasi yang jadi terkurung di belakangnya (`OPENING_START_DATE_CONFLICT`).
- **Alat yang sudah dipakai sebelum pencatatan dimulai** masuk buku sebesar nilai pakainya pada `start_date` (`harga beli × sisa umur ÷ umur manfaat`), bukan harga barunya, dan disusutkan selama sisa umurnya. Harga dan umur yang diketik pemilik disimpan di `original_cost_idr`/`original_useful_life_months` supaya layar koreksi menampilkan kembali jawabannya.
- **Penyusutan tidak pernah mendahului `start_date`.** Menyusutkan bulan sebelum pembukuan dimulai membuat akumulasi penyusutan ada tanpa harga alatnya, sehingga Posisi Keuangan menampilkan harta bernilai negatif.
- Transaksi bertanggal sebelum `start_date` ditolak dengan pesan ramah.
- Sebelum wizard selesai: Mode Warung menampilkan "Untung bulan ini" saja; kartu "Uang yang harus ada" dan Posisi Keuangan disembunyikan dengan ajakan mengisi.

### 6.4 Penyusutan
- Dijalankan saat: (a) job akhir bulan, atau (b) saat laporan diminta untuk periode yang belum ada `depreciation_postings`. Idempoten via `UNIQUE(asset_id, period_month)`.
- Mulai bulan setelah `acquired_on`. Berhenti saat akumulasi = cost − salvage atau `disposed_on` terisi.

### 6.5 Persediaan
- Default: pembelian (kategori 5) dibebankan ke 5100 saat terjadi.
- Akhir bulan, kartu opsional "Stok bahan sisa kira-kira berapa?" → `inventory_counts` → entry koreksi. Jika dilewati, saldo 1400 tidak berubah dan CALK mencantumkan "persediaan berdasarkan hitungan terakhir tanggal …".

### 6.6 Tutup kas harian (sudah ada, diperluas)
- Saat tutup kas, UMKM mengetik uang fisik di laci dan (opsional) saldo rekening/QRIS. Sistem membandingkan dengan saldo 1100 dan 1200 → **selisih kas** ditampilkan, tidak otomatis dijurnal. Selisih tersimpan di tabel tutup kas untuk indikator integritas.

### 6.7 Periode dan perbandingan
- Laba Rugi: periode (bulan/tahun/rentang) dengan kolom pembanding periode sebelumnya yang setara.
- Posisi Keuangan: per tanggal (akhir bulan/akhir tahun) dengan kolom pembanding akhir periode sebelumnya.
- Tahun buku = tahun kalender.

---

## 7. Tiga laporan SAK EMKM + pelengkap

### 7.1 Laporan Posisi Keuangan (format ilustrasi SAK EMKM hal. 50)
Kepala: nama usaha, "LAPORAN POSISI KEUANGAN", "Per [tanggal]". Kolom: Pos · Catatan · [Periode ini] · [Periode lalu].
Baris: Kas · Giro (Bank) · *Jumlah kas dan setara kas* · Piutang usaha · Persediaan · Aset tetap · Akumulasi penyusutan (dalam kurung) · **JUMLAH ASET** · Utang usaha · Utang bank · **JUMLAH LIABILITAS** · Modal · Saldo laba (defisit) · **JUMLAH EKUITAS** · **JUMLAH LIABILITAS & EKUITAS**.
Modal ditampilkan neto setelah prive; rincian modal awal, setoran, prive ada di CALK (Catatan 9). Invarian tampilan: JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS, diuji.

### 7.2 Laporan Laba Rugi (format hal. 51)
Kepala: "LAPORAN LABA RUGI", "Untuk periode yang berakhir [tanggal]". Baris: Pendapatan usaha · Pendapatan lain-lain · *JUMLAH PENDAPATAN* · Beban usaha · Beban lain-lain · *JUMLAH BEBAN* · **LABA (RUGI) SEBELUM PAJAK PENGHASILAN** · Beban pajak penghasilan · **LABA (RUGI) SETELAH PAJAK PENGHASILAN**.
Beban usaha di laporan utama satu baris; rincian HPP dan sub-beban 5210–5290 di CALK (Catatan 10–11).

### 7.3 Catatan atas Laporan Keuangan (templated)
1. Umum: nama, bentuk usaha (perorangan), alamat, sektor, tanggal mulai pencatatan — dari profil.
2. Ikhtisar kebijakan akuntansi (teks tetap): pernyataan kepatuhan SAK EMKM; dasar penyusunan (biaya historis, akrual); kas dan setara kas; piutang (tidak ada penyisihan); persediaan (biaya perolehan, sistem periodik, hitungan fisik akhir bulan); aset tetap (garis lurus, umur manfaat per kelompok); pengakuan pendapatan (saat barang diserahkan); pajak penghasilan (PP 55/2022, estimasi).
3–12. Rincian bernomor yang dirujuk kolom "Catatan": Kas · Giro · Piutang usaha (per counterparty) · Persediaan (tanggal hitung terakhir) · Aset tetap (daftar, penyusutan) · Utang bank (per pinjaman) · Modal (awal, setoran, prive, laba) · Pendapatan usaha (per bulan) · Beban usaha (per sub-akun) · Beban lain-lain.
13. Pernyataan: "Laporan disusun dari catatan pemilik melalui BERKEMBANG.ID, belum diaudit, bukan penilaian kelayakan kredit."

### 7.4 Laporan Arus Kas (pelengkap)
Metode langsung: Operasi · Investasi · Pendanaan · Kenaikan/penurunan kas · Kas awal · Kas akhir. Sejalan format SIAPIK. Ditampilkan di dossier dan Mode Akuntan.

### 7.5 PDF
Satu berkas: Posisi Keuangan → Laba Rugi → Arus Kas → CALK → Lampiran indikator 6 bulan → Lampiran metodologi (pemetaan kategori → akun, rumus). Setiap halaman: nama usaha, periode, tanggal cetak, ID dokumen, disclaimer. Dua kolom perbandingan wajib. Render server-side (route handler), target < 10 detik untuk 500 transaksi.

---

## 8. Mode Warung (UI UMKM)

Tidak ada kata: debit, kredit, jurnal, akun, HPP, prive, akrual, neraca, ekuitas, liabilitas. Padanan wajib:

| Konsep | Kata di layar |
|---|---|
| Pendapatan usaha | Uang masuk dari jualan |
| Beban pokok / pembelian | Belanja bahan & stok |
| Beban usaha | Biaya usaha |
| Prive | Diambil untuk rumah |
| Laba bersih | Untung bersih |
| Piutang | Pelanggan yang belum bayar |
| Utang usaha | Belum dibayar ke supplier |
| Saldo kas | Uang yang harus ada di laci / di rekening |
| Aset tetap | Alat usaha |
| Posisi Keuangan | Kondisi usaha saya |
| Laba Rugi | Untung bulan ini |

**Tab "Hari Ini":** uang awal → masuk → keluar → yang harus ada; tutup kas dengan selisih; daftar transaksi.
**Tab "Bulan Ini":** 4 kotak (Uang masuk dari jualan · Belanja & biaya · **Untung bersih** · Diambil untuk rumah); satu kalimat interpretasi berbasis rule; grafik untung 6 bulan; pelanggan belum bayar; naik/turun vs bulan lalu; kartu "Hitung stok" di 3 hari terakhir bulan.
**Tab "Kondisi Usaha":** versi warung dari Posisi Keuangan — "Yang saya punya" (uang, piutang, stok, alat) vs "Yang saya harus bayar" vs "Milik saya bersih". Muncul setelah wizard saldo awal.
**Tab "Untuk Bank":** tombol "Buat laporan PDF" (pilih 3/6/12 bulan) + kirim WhatsApp; tautan kecil "Mode Akuntan".

**Wizard saldo awal** (6 layar, satu pertanyaan per layar, bisa dilewati per pertanyaan dengan nilai 0):
1. Uang di laci sekarang berapa?
2. Saldo rekening / QRIS sekarang berapa?
3. Ada yang masih ngutang ke kamu? Siapa, berapa? (bisa banyak)
4. Kamu masih ngutang ke siapa? Berapa? Cicilan per bulan berapa? (bisa banyak)
5. Stok bahan yang ada kira-kira senilai berapa?
6. Alat usaha apa yang kamu punya? Beli kapan, harganya? (bisa banyak)
Layar akhir: "Modal usaha kamu saat ini Rp X" (aset − utang), tombol Mulai.

---

## 9. Mode Akuntan (read-only)

Akses: tautan kecil di tab "Untuk Bank" dan dari portal admin/pendamping. Konten: Jurnal Umum (filter tanggal, sumber) · Buku Besar per akun · Neraca Saldo per tanggal · ketiga laporan dalam format SAK EMKM di layar · Ekspor CSV jurnal berkolom `kode_akun, nama_akun, debit, kredit, tanggal, sumber, memo` (dapat diimpor ke SI APIK / sistem bank). Tidak ada tombol edit apa pun.

---

## 10. API

Menambah, tidak mengubah kontrak endpoint yang ada.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/accounting/journal` | Jurnal umum (paginasi, filter tanggal/sumber) |
| GET | `/api/v1/accounting/ledger/:accountCode` | Buku besar satu akun |
| GET | `/api/v1/accounting/trial-balance?as_of=` | Neraca saldo |
| GET | `/api/v1/reports/income-statement?from=&to=&compare=true` | Laba rugi + pembanding |
| GET | `/api/v1/reports/balance-sheet?as_of=&compare=true` | Posisi keuangan + pembanding |
| GET | `/api/v1/reports/cash-flow?from=&to=` | Arus kas |
| GET | `/api/v1/reports/notes?from=&to=` | Payload CALK |
| GET | `/api/v1/reports/warung?month=` | Agregat Mode Warung (4 kotak, kalimat, 6 bulan) |
| POST | `/api/v1/reports/pdf` | Render PDF SAK EMKM (body: `months`, `include_indicators`) |
| GET/POST/PUT | `/api/v1/opening-balances` | Baca/isi wizard saldo awal (POST idempoten, sekali); PUT memperbaikinya dengan alasan wajib |
| GET | `/api/v1/opening-balances/answers` | Jawaban wizard sebagaimana diketik pemilik, untuk mengisi layar koreksi |
| GET/POST | `/api/v1/fixed-assets` · PATCH `/:id` · POST `/:id/dispose` | Register alat usaha. Harga perolehan **tidak** dapat diubah di sini: alat kondisi awal lewat koreksi kondisi awal, alat yang dibeli lewat koreksi transaksinya |
| GET/POST | `/api/v1/loans` · PATCH `/:id` | Register pinjaman. `outstanding_idr` **tidak** dapat diketik: ia hasil pembayaran cicilan yang tercatat |
| GET/POST | `/api/v1/inventory-counts` | Hitung stok bulanan |
| GET/POST/PATCH | `/api/v1/counterparties` | Pelanggan/supplier/pemberi pinjaman |
| POST | `/api/v1/ledger/transactions/:id/reclass` | Set kategori untuk transaksi `needs_reclass` (memicu posting) |
| GET | `/api/v1/accounting/export.csv` | Ekspor jurnal |

Perubahan pada endpoint yang ada: `POST /api/v1/ledger` dan `POST /api/v1/captures/:id/confirm` menerima `category_code`, `category_subtype`, `counterparty_id`, `interest_amount`; validasi Zod; posting jurnal dalam transaksi yang sama.

Perubahan prompt ekstraksi AI: keluarkan `category_code` (1–10), `subtype` bila relevan, `counterparty_name` bila terdengar, dan `confidence`. AI **tidak** mengeluarkan kode akun.

---

## 11. Invarian dan kriteria penerimaan (harus jadi test)

1. **Seimbang:** setiap `journal_entries` memiliki Σdebit = Σkredit (trigger DB + unit test template).
2. **Neraca seimbang:** `fn_balance_sheet` menghasilkan JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS untuk setiap `as_of`, termasuk saat ada prive, penyusutan, koreksi stok, dan pembalikan.
3. **Prive tidak pernah di Laba Rugi:** tidak ada line 3200 yang masuk `fn_income_statement`.
4. **Modal dan pinjaman tidak pernah pendapatan:** kategori 4a/4b tidak menyentuh 4xxx.
5. **Deterministik:** kategori + sektor + metode bayar yang sama → akun yang sama, 100% (property test atas semua kombinasi template).
6. **Immutable:** tidak ada UPDATE/DELETE pada `journal_entries`/`journal_lines` (RLS + trigger menolak).
7. **Idempoten:** penyusutan tidak dobel per aset per bulan; **satu baris saldo awal per usaha** — koreksi menghasilkan jurnal pembalik dan entry baru, bukan baris kedua; retry `confirm` tidak membuat entry ganda (memakai idempotency key yang ada). Koreksi berulang harus tetap benar: pembalikan bersifat sekali per entry, jadi yang dibalik selalu entry yang sedang ditunjuk `opening_balances.journal_entry_id`.
14. **Akumulasi penyusutan jujur:** saldo akun 1690 di jurnal — termasuk seluruh pembalikannya — selalu sama dengan jumlah `depreciation_postings` yang membenarkannya, sebelum maupun sesudah koreksi.
15. **Efek samping transaksi ikut dibatalkan saat jurnalnya dibalik:** pokok cicilan dikembalikan ke sisa pinjaman (tidak berkurang dua kali saat transaksi diedit), dan alat yang lahir dari pembelian yang dibatalkan ikut dicabut beserta penyusutannya.
8. **Isolasi:** dua usaha tidak bisa saling membaca jurnal/laporan (uji RLS lintas akun, pola yang ada).
9. **Reproduksi:** angka di PDF = angka dari fungsi SQL = angka dari CSV ekspor untuk periode yang sama.
10. **Backfill:** semua transaksi terkonfirmasi lama mendapat `category_code` default dan `needs_reclass = true`; tidak ada yang hilang dari total lama.
11. **Kata terlarang:** lint teks gagal jika string `skor kredit`, `layak kredit`, `plafon`, `disetujui`, `ditolak`, `credit score` muncul di UI, PDF, atau CALK.
12. **Kinerja:** PDF 6 bulan dari akun demo ≥ 500 transaksi < 10 detik.
13. **Migrasi:** fresh apply dan replay lulus `0001–00XX`; `database-migrations.contract.test.ts` dan `verify-database-migrations.mjs` diperbarui.

---

## 12. Penahapan

Prasyarat mutlak: P0 audit 31 Agustus selesai (sintaks `0028`, migration contract, lint, verifikasi remote). Jangan mulai `0029` di atas `0028` yang belum lulus.

| Tahap | Cakupan | Target |
|---|---|---|
| **A** | `0029`: `coa_accounts`, `category_templates` (sektor pangan olahan), kolom baru `transactions`, `journal_entries/lines` + trigger seimbang, `counterparties`, backfill. Posting saat confirm. Pembalikan untuk koreksi/batal. `fn_income_statement`, `fn_trial_balance`, `v_general_ledger`. Prompt AI + layar konfirmasi dengan 10 kategori. Tab "Bulan Ini" (4 kotak + kalimat + 6 bulan). Endpoint `reports/income-statement`, `reports/warung`, `accounting/journal`, `reclass`. | **10 Sept** (sebelum Final Presentation Online 14–17 Sept) |
| **B** | `0030`: `opening_balances`, `fixed_assets`, `depreciation_postings`, `loans`, `inventory_counts`. Wizard saldo awal. Penyusutan otomatis. Koreksi stok. `fn_balance_sheet`, `fn_cash_flow`, `fn_notes_data`. Tab "Hari Ini" dengan selisih kas, tab "Kondisi Usaha". PDF SAK EMKM lengkap (3 laporan + arus kas + CALK) dua kolom. | **20 Sept** (sebelum Offline Pitching 22–23 Sept) |
| **C** | Mode Akuntan penuh, ekspor CSV berkolom akun, estimasi pajak (`5400/2400`), `indicator_monthly` materialized + rumus tercetak, template kategori untuk sektor lain, pengingat hitung stok & tutup kas. | Sebelum pilot pengguna nyata |

Tahap A cukup untuk mengubah narasi demo: rekam *"ambil 300 ribu buat SPP anak"* → untung bersih **tidak berubah**, kotak "Diambil untuk rumah" bertambah. Itu momen yang menjawab pain point nomor satu riset Depok dan menunjukkan pemisahan kas usaha–pribadi dengan bukti, bukan slogan.

---

## 13. Di luar cakupan dokumen ini

Rule readiness (`wp08-pilot-v2`) yang memakai indikator baru (rasio prive, stabilitas laba) — akan dispesifikasikan terpisah setelah Tahap A stabil. Snapshot institusi memakai output `reports/pdf` yang sama; tidak ada perubahan pada modul `consent`.

---

## 14. Referensi

SAK EMKM (IAI, efektif 1 Jan 2018; ilustrasi laporan hal. 50–51) · Pedoman Umum/Teknis/Modul PTK untuk UMK (BI–IAI) dan SI APIK · PP 55/2022 (PPh final UMKM 0,5%; batas Rp500 juta WP OP) · PP 42/2024 (kewajiban sertifikasi halal UMK 17 Okt 2026) · POJK 29/2024 (PKA) · UU 27/2022 (PDP) · Audit *Status Produk Terkini 2026-08-31* · *Standar Pencatatan sebagai Fondasi Build* v1.0 · *Spec Brief Journey UMKM* v1.0.
