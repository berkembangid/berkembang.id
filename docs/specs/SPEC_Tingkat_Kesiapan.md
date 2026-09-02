# Spesifikasi Fitur: Tingkat Kesiapan — Satu Model, Empat Pilar (`wp08-pilot-v2`)

**Produk:** BERKEMBANG.ID · Tim P0160
**Modul:** `readiness` (dirombak) + render di Beranda, Perjalanan, dossier institusi
**Versi:** 1.0 · 3 September 2026
**Untuk:** Harsya (CTO) · cc: Yosua (UX) · **Dari:** Hadi
**Melengkapi:** *SPEC Laporan Keuangan* v1.0 (jurnal, prive, tutup kas, `inventory_counts`), *SPEC Lemari Dokumen* v1.0 (`document_requirements`, `assurance_level`, attachments, `report_issues`), *Palet Design Tokens* v1.0, mockup `mockup-tingkat-kesiapan.html`
**Prasyarat:** `0029`–`0032` hijau (jurnal, aset/pinjaman/saldo awal, lemari dokumen, patch profil). Rule engine admin ber-versi (`wp08-pilot-v1`) yang sudah ada dipakai sebagai wadah publikasi versi baru.

> **Satu kalimat untuk dipegang saat build:**
> Satu model, satu endpoint, banyak render. Beranda, Perjalanan, dan dossier dilarang menghitung sendiri — semuanya me-render potongan dari `GET /api/v1/readiness`, sehingga mustahil ada dua angka berbeda untuk konsep yang sama.

---

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| T1 | **Angka tunggal 0–100 dihapus dari seluruh permukaan** (UI UMKM, aktivitas, dossier). Eksternal = Tingkat + 4 Pilar + komponen terbuka. Internal boleh menyimpan agregat untuk analitik, tidak pernah dirender. | Angka tunggal ≈ skor ≈ wilayah PKA; juga sumber kebingungan "17/100 vs 6/7 vs 2/7". |
| T2 | **Tingkat naik berdasarkan aturan (rule-based), bukan akumulasi poin**: Mulai → Tembaga → Perak → Emas. | Aturan terbuka bisa dijelaskan baris per baris; skor berbobot mengundang pertanyaan "kenapa 62 bukan 63". |
| T3 | **Setiap tingkat membuka kemampuan nyata**: Perak membuka tombol "Buat laporan PDF ≥ 3 bulan"; Emas menandai dossier "lengkap" di portal institusi. Mulai/Tembaga tidak mengunci apa pun yang esensial. | Gamifikasi tanpa arti = mainan; membuka kemampuan = alasan jujur untuk naik. |
| T4 | **Komponen selalu punya tiga hal**: nilai sekarang (dihitung dari data), target berikutnya, satu aksi. Tidak ada komponen yang diklaim manual. | Prinsip bukti-bukan-klaim yang sudah menjadi identitas produk. |
| T5 | **Formula = konfigurasi ber-versi** (`wp08-pilot-v2`) di rules engine admin: ambang, jendela waktu, daftar komponen aktif. Perubahan formula = versi baru + tanggal berlaku, hasil lama tidak ditulis ulang. | Auditabilitas; jawab juri "kalau rumus berubah, riwayat bagaimana?" |
| T6 | **Halaman "Cara kami menghitung" publik di aplikasi** menampilkan tabel komponen apa adanya. | Transparansi = pembeda dari black-box scoring; pertahanan POJK 29/2024. |
| T7 | **Dossier institusi menampilkan model yang sama persis** (tingkat + pilar + komponen + versi formula), bukan ringkasan berbeda. | Satu kebenaran untuk dua dunia; kalimat tetap "kesiapan data", bukan kelayakan. |
| T8 | **Tidak pernah turun tingkat mendadak di depan pengguna.** Tingkat dievaluasi harian; penurunan diberi masa tenggang 7 hari dengan kartu ajakan ("kebiasaan mencatatmu menurun — 5 hari lagi untuk mempertahankan Perak"), amber, bukan merah. | Tidak menghukum; kebiasaan naik-turun itu normal. |
| T9 | Kata terlarang diperluas di UI UMKM: `score`, `skor`, `poin`, `nilai kredit`. "Perlu disiapkan"/"Langkah ringan" badge boleh; merah dilarang untuk keadaan pengguna. | Konsistensi bahasa. |
| T10 | Komponen yang datanya belum bisa dihitung (fitur belum dipakai) berstatus `BELUM_ADA_DATA`, ditampilkan netral, **tidak menghitung sebagai gagal**. | Adil untuk pengguna baru dan untuk fitur yang menyusul. |

---

## 1. Model

```
Tingkat (1 dari 4)  ◄── aturan atas status komponen
  └── Pilar A/B/C/D (progress % per pilar, hanya untuk bar visual)
        └── Komponen (11 buah) ◄── dihitung dari tabel data, harian + on-demand
              status: TERPENUHI | SEBAGIAN | BELUM | BELUM_ADA_DATA
              value, target_next, action {label, href}
```

## 2. Definisi komponen (formula `wp08-pilot-v2`)

Semua jendela waktu dan ambang adalah **konfigurasi**; nilai di bawah adalah default versi ini. "Bulan penuh" = bulan kalender dengan ≥ 1 transaksi terkonfirmasi di ≥ 8 hari berbeda. Zona waktu Asia/Jakarta.

| ID | Komponen | Sumber & rumus | SEBAGIAN mulai | TERPENUHI (syarat Perak) | Syarat Emas |
|---|---|---|---|---|---|
| A1 | Hari mencatat | hari berbeda dengan ≥1 transaksi `confirmed`, 30 hari terakhir | ≥ 8 | ≥ 20 | ≥ 24 |
| A2 | Tutup kas | baris tutup kas 30 hari terakhir | ≥ 4 | ≥ 12 | ≥ 20 |
| A3 | Umur catatan | hari sejak transaksi terkonfirmasi pertama | ≥ 14 | ≥ 60 | ≥ 90 |
| B1 | Catatan dicek | 1 − (draf kedaluwarsa tanpa konfirmasi + `needs_reclass` terbuka) / total 90 hari | ≥ 70% | ≥ 90% | ≥ 95% |
| B2 | Pisah uang pribadi | bulan dengan ≥1 entry prive (akun 3200), 3 bulan penuh terakhir | ≥ 1 bln | ≥ 2 bln | 3 bln |
| B3 | Bukti belanja besar | Σ nilai transaksi keluar ≥ Rp500rb ber-attachment / Σ nilai transaksi keluar ≥ Rp500rb, 90 hari | ≥ 20% | ≥ 40% | ≥ 70% |
| B4 | Hitung stok | bulan dengan `inventory_counts`, 3 bulan penuh terakhir | ≥ 1 | — (bonus, bukan syarat Perak) | ≥ 2 |
| C1 | Fondasi izin sektor | dokumen WAJIB sektor (dari `document_requirements`) ber-`assurance_level ≥ CONFIRMED` | ≥ 1 | ≥ 3 dari 4 (pangan olahan) | 4 dari 4 |
| C2 | Profil inti | tahun mulai + alamat + WhatsApp + ≥1 kanal penjualan terisi | sebagian | lengkap | lengkap |
| D1 | Saldo awal | `opening_balances.completed_at` terisi | — | ✓ | ✓ |
| D2 | Rentang data | jumlah bulan penuh | ≥ 1 | ≥ 3 | ≥ 6 |
| D3 | Laporan terbit | baris `report_issues` jenis PDF_SAK_EMKM | — | — (terbuka DI Perak) | ≥ 1 |

Progress bar pilar (visual saja): rata-rata proporsi tercapai komponen pilar itu (TERPENUHI=1, SEBAGIAN=nilai/target, BELUM=0; `BELUM_ADA_DATA` dikeluarkan dari pembagi).

## 3. Aturan tingkat

| Tingkat | Syarat (semua wajib) |
|---|---|
| **Mulai** | default |
| **Tembaga** | A1 ≥ 8 · A3 ≥ 14 · D1 ✓ · B1 ≥ 70% |
| **Perak** | semua kolom "TERPENUHI (syarat Perak)" di tabel §2 kecuali B4 dan D3 |
| **Emas** | semua kolom "Syarat Emas" di tabel §2 (termasuk C1 4/4 — Halal masuk di sini) |

**Kemampuan yang terbuka:** Perak → tombol "Buat laporan PDF" untuk rentang ≥ 3 bulan aktif (di bawah Perak: PDF bulanan tunggal tetap boleh, rentang panjang menampilkan "terbuka di Perak" + syarat yang kurang). Emas → dossier di portal institusi berlabel "data lengkap" dan komponen semuanya hijau. Tidak ada fitur pencatatan/dokumen yang dikunci di tingkat mana pun.

**Evaluasi & tenggang (T8):** dihitung on-demand (endpoint) + snapshot harian ke `readiness_daily`. Jika hasil harian < tingkat tersimpan → status `GRACE` 7 hari (kartu amber ajakan); lewat 7 hari belum pulih → tingkat turun + aktivitas "tingkat kesiapan disesuaikan" (netral). Naik tingkat langsung berlaku + aktivitas perayaan.

## 4. Data & API

```
readiness_formula_versions (rules engine yang ada; tambah baris 'wp08-pilot-v2')
  version, config jsonb (ambang, jendela, komponen aktif), effective_from, published_by

readiness_daily
  business_id, snapshot_date, level, level_since, grace_until null,
  components jsonb  -- [{id,status,value,target_next}]
  formula_version
  UNIQUE(business_id, snapshot_date)

business_readiness_state
  business_id PK, level, level_since, grace_until, formula_version, updated_at
```

`GET /api/v1/readiness` → `{ level, level_since, grace: {until, missing[]}|null, next_level: {name, missing: [{component_id, value, target, action}]}, pillars: [{id, progress, components: [{id, status, value, display_value, target_next, action {label, href}}]}], formula_version, disclaimer }`.
`GET /api/v1/readiness/methodology` → tabel §2 + §3 dari konfigurasi (untuk halaman "Cara kami menghitung" dan dossier).
Beranda, Perjalanan, dossier, dan event aktivitas **hanya** memakai dua endpoint ini. Hapus semua perhitungan lokal lama (`wp08-pilot-v1` renderers).

## 5. UI (ikuti mockup `mockup-tingkat-kesiapan.html`)

- **Perjalanan** → halaman Tingkat Kesiapan: hero tangga 4 tingkat (arti tertulis di anak tangga) + kartu "langkah paling berdampak" + 4 kartu pilar berisi komponen (dot hijau/amber/netral, nilai, ajakan, aksi) + catatan "Tentang penilaian ini" + tautan "Lihat cara kami menghitung". Misi kebiasaan (A1) memakai ring `N/target` hidup. Kartu misi lama yang tumpang tindih dihapus; misi legalitas menaut ke Dokumen.
- **Langkah paling berdampak** = komponen `missing` untuk tingkat berikutnya dengan estimasi usaha terkecil (urutan usaha statis di konfigurasi: C2 < D1 < C1-NIB < A2 < A1 < B3 < C1-Halal < D2), satu saja.
- **Beranda**: kartu mini (level + bar menuju tingkat berikutnya + 1 aksi) menggantikan kartu lama; ring "6/7" di kartu "Langkah usaha berikutnya" dihapus (kartunya boleh tetap, tanpa ring, membaca endpoint yang sama).
- **Aktivitas**: "Tingkat kesiapan diperbarui: naik ke Tembaga" — tidak pernah menampilkan angka mentah.
- **Dossier institusi**: blok kesiapan = level + 4 pilar + komponen + `formula_version` + kalimat baku kesiapan-bukan-kelayakan. Bahasa portal boleh sedikit lebih formal, konsep identik.
- Halaman **/umkm/kesiapan/metodologi**: render `methodology` apa adanya, bahasa warung, tanpa login tambahan.

## 6. Invarian & kriteria penerimaan (jadi test)

1. Satu sumber: tidak ada komponen UI yang menghitung kesiapan sendiri (uji: mock endpoint mengubah level → Beranda, halaman kesiapan, dossier berubah serentak; grep tidak ada import util skor lama).
2. Angka mentah tidak pernah dirender: tidak ada string `/100`, `dari 100`, `score`, `skor`, `poin` di UI UMKM (lint + test).
3. Deterministik: fixture data → hasil komponen dan level sama di dua kali evaluasi; snapshot harian idempoten.
4. `BELUM_ADA_DATA` tidak menjatuhkan level (fixture usaha baru tanpa fitur stok/bukti tetap bisa Perak? → TIDAK untuk B3 karena B3 syarat Perak; pastikan B3 dengan nol transaksi ≥500rb = `BELUM_ADA_DATA` dan DIKECUALIKAN dari syarat — usaha kecil tanpa belanja besar tidak boleh terkunci dari Perak. Tulis test khusus kasus ini).
5. Grace: penurunan tidak pernah instan; naik selalu instan.
6. Perak membuka PDF multi-bulan; di bawahnya pesan syarat yang kurang, bukan error.
7. Formula version tercantum di respons, snapshot, dan dossier; mengubah konfigurasi tanpa menaikkan versi ditolak oleh rules engine.
8. Kinerja: `GET /api/v1/readiness` p95 < 400 ms pada akun 1.000 transaksi (agregasi SQL, bukan loop aplikasi).
9. Kasus batas kalender: bulan penuh dihitung Asia/Jakarta; test 31 Des/1 Jan.
10. Migrasi state: akun lama mendapat level awal dari evaluasi perdana (bukan default Mulai kalau datanya sudah memenuhi Tembaga/Perak) — evaluasi retroaktif satu kali saat deploy.

## 7. Penahapan

| Tahap | Isi | Target |
|---|---|---|
| **R-A** | Konfigurasi `wp08-pilot-v2`, evaluator + endpoint + snapshot harian + state, halaman Tingkat Kesiapan (ganti Perjalanan), kartu mini Beranda, hapus semua angka lama, lint kata | **12 Sept** (masuk demo Final Presentation) |
| **R-B** | Dossier institusi membaca model baru; halaman metodologi; grace period + aktivitas; pembukaan PDF multi-bulan terikat Perak | **20 Sept** (Offline Pitching) |
| **R-C** | Tuning ambang dari data pilot; komponen sektor lain; notifikasi tenggang | pilot |

## 8. Di luar cakupan
Perbandingan antar-UMKM/leaderboard (dilarang — memicu kompetisi tidak sehat dan aroma pemeringkatan), reward/poin yang bisa ditukar, push notification, perubahan formula konsen/consent.

## 9. Pertanyaan terbuka untuk Harsya
1. Rules engine `wp08-pilot-v1` sekarang menyimpan konfigurasi dalam bentuk apa — cukupkah untuk struktur §2, atau perlu perluasan skema?
2. Perhitungan A1/A2/B1 lebih murah lewat view SQL atau job harian saja? (target p95 §6.8 yang menentukan)
3. "Langkah usaha berikutnya" di Beranda sekarang komponen terpisah atau bagian kartu kesiapan lama?
4. Ada berapa akun aktif di production untuk evaluasi retroaktif (§6.10) — perlu batching?
