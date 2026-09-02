# Spesifikasi Fitur: Lemari Usaha — Modul Dokumen Lengkap

**Produk:** BERKEMBANG.ID · Tim P0160
**Modul:** `documents` (diperluas) + tautan ke `accounting`, `readiness`, portal institusi
**Versi:** 1.0 · 3 September 2026
**Untuk:** Harsya (CTO) · cc: Yosua (UX) · **Dari:** Hadi
**Melengkapi:** *SPEC Laporan Keuangan Satu Engine Dua Wajah* v1.0 (`journal_entries`, `fixed_assets`, `loans`, CALK), *SPEC Voice Capture* v1.0 (parser, gating, kartu konfirmasi), *Palet Design Tokens* v1.0, audit *Status Produk Terkini 2026-08-31*
**Prasyarat:** Tahap A+B laporan keuangan hijau. Modul dokumen eksisting (upload, versi non-destruktif, OCR gambar via Groq, consent per-upload, signed URL 60 dtk, magic bytes) dipakai apa adanya sebagai fondasi.

> **Satu kalimat untuk dipegang saat build:**
> Dokumen bukan folder upload. Dokumen adalah lemari lima rak yang masing-masing menjawab pertanyaan berbeda dari bank: *siapa kamu* (identitas), *boleh apa* (legalitas), *benarkah angkamu* (bukti), *apa yang kamu punya dan tanggungkan* (aset & kontrak), dan *apa yang pernah kami terbitkan* (arsip keluaran).

---

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| L1 | **Lima rak (`doc_class`)** dengan kebijakan sensitivitas, berbagi, dan retensi berbeda per rak. | Satu kebijakan seragam pasti salah di salah satu ujung: terlalu longgar untuk KTP atau terlalu ketat untuk nota gorengan. |
| L2 | **Bukti transaksi permanen, menempel ke jurnal.** Tidak ikut kebijakan hapus audio. Pembalikan transaksi tidak menghapus bukti. | Nota adalah buktinya itu sendiri; jurnal immutable butuh bukti yang immutable. |
| L3 | **OCR/AI tidak pernah memutuskan; pemilik selalu konfirmasi.** Hasil OCR diperlakukan seperti transkrip voice: masuk `nominal-parser` dan gating yang sama. | Satu pipeline kebenaran, bukan dua. Prinsip `no-fallback-nominal` berlaku untuk semua input. |
| L4 | **Tingkat keyakinan dokumen 4 tingkat** (SELF_DECLARED → CHECKED → CONFIRMED → ATTESTED), ditampilkan apa adanya di dossier. | Jujur soal derajat keyakinan = kredibel, dan menjauh dari kesan "kami menjamin/menilai" ala PKA. |
| L5 | **Masa berlaku + mesin pengingat H-90/H-30/H-7** untuk rak legalitas, termasuk kartu countdown halal 17 Okt 2026 untuk sektor pangan olahan. | Mengubah Dokumen dari penyimpanan menjadi pendampingan; data kedaluwarsa juga bernilai bagi dinas/CSR (stream revenue 1). |
| L6 | **Kelengkapan per sektor** via tabel `document_requirements`, menjadi kartu "X dari Y fondasi" dan misi Perjalanan. | Menyatukan Dokumen–Perjalanan–Kesiapan yang sekarang hidup sendiri-sendiri. |
| L7 | **Rak E menyimpan setiap PDF SAK EMKM/snapshot yang diterbitkan** dengan ID dokumen. | Jejak "apa yang pernah dilihat bank" — properti audit yang murah dibangun sekarang, mustahil direkonstruksi nanti. |
| L8 | **Pintu B (OCR nota → draf transaksi) ditunda ke D-C.** Fase sekarang: foto sebagai bukti (Pintu A/C/D), bukan sebagai sumber angka. | Kapasitas Harsya terbatas; nilai demo kecil (juri sudah lihat AI di voice); risiko demo OCR struk tinggi. |
| L9 | **KTP/NPWP tidak pernah masuk snapshot institusi** dalam bentuk apa pun; hanya status "terverifikasi". Rak B dibagikan sebagai status+nomor+masa berlaku; file penuh hanya consent eksplisit per dokumen. | UU PDP 27/2022; minimalisasi data. |
| L10 | **Bukti tidak pernah wajib.** Dorongan bertingkat berdasar nilai dan kategori; ketiadaan bukti tidak pernah merah. | Mencatat > bukti. Mewajibkan foto = orang berhenti mencatat. |
| L11 | **Fase sekarang: gambar (JPEG/PNG) saja untuk OCR; PDF diterima tanpa OCR.** Kompresi di klien sebelum upload (sisi terpanjang 1600 px, target 200–400 KB). | OCR PDF belum tersedia di env (hanya Groq); UMKM memotret, bukan scan; 3G. |
| L12 | **Kata terlarang tetap berlaku** + rak dan indikator tidak boleh memakai bahasa penilaian kredit. | POJK 29/2024. |

---

## 1. Lima rak

| Rak | `doc_class` | Isi | Metadata wajib | Dibagikan ke institusi | Retensi |
|---|---|---|---|---|---|
| A. Identitas pemilik | `IDENTITAS` | KTP, NPWP pribadi, KK | jenis, nama sesuai dokumen, NIK ter-mask (4 digit terakhir) | **Tidak pernah** (file/nomor/gambar); hanya boolean "identitas terverifikasi ✓" + tingkat keyakinan | selama akun hidup |
| B. Legalitas usaha | `LEGALITAS` | NIB, PIRT, Sertifikat Halal, SLHS, BPOM MD, merek, izin lain | jenis, nomor, penerbit, tanggal terbit, **masa berlaku** (nullable utk NIB), nama usaha di dokumen | default: status + jenis + nomor + masa berlaku + tingkat keyakinan; **file penuh hanya via consent eksplisit per dokumen** | selama akun hidup |
| C. Bukti transaksi | `BUKTI_TRANSAKSI` | nota, kuitansi, struk, bukti transfer, invoice masuk | tautan ke transaksi/jurnal (via `document_attachments`) | default: **agregat saja** (indikator kelengkapan bukti); file per-transaksi hanya via consent | **permanen** |
| D. Aset & kontrak | `ASET_KONTRAK` | nota beli alat, sewa kios, perjanjian pinjaman, BPKB/serupa | tautan ke `fixed_assets`/`loans`, nilai, jangka waktu | ringkasan lewat CALK (daftar aset, pinjaman); file via consent | selama aset/kontrak hidup + 2 th |
| E. Arsip keluaran | `ARSIP_KELUARAN` | PDF SAK EMKM yang diterbitkan, snapshot dossier yang pernah dibagikan | periode, `document_uid`, tanggal terbit, tujuan (unduh sendiri / institusi X) | inilah yang dibagikan; arsipnya sendiri read-only | permanen |

Dokumen lama di sistem dimigrasikan: KTP/NPWP → A; NIB/PIRT/Halal/sertifikat → B; lainnya → B dengan flag `needs_class_review` (pemilik memilah lewat satu kartu, satu ketuk per dokumen).

---

## 2. Tingkat keyakinan (`assurance_level`)

| Tingkat | Arti | Cara naik |
|---|---|---|
| `SELF_DECLARED` | baru diunggah | otomatis saat upload |
| `CHECKED` | lolos pemeriksaan otomatis | OCR terbaca DAN aturan format lolos (Bagian 5) DAN nama di dokumen ≈ nama profil (fuzzy) |
| `CONFIRMED` | pemilik mengonfirmasi hasil baca | layar konfirmasi OCR yang sudah ada |
| `ATTESTED` | diperiksa manusia (pendamping pod / admin) | Tahap D-C; ada `attested_by`, `attested_at` |

Tingkat tampil di UI pemilik ("Tersimpan → Terbaca → Sudah kamu cek → Diperiksa pendamping") dan di dossier dengan istilah netral. Tidak ada kata "verified oleh BERKEMBANG" — kita tidak menjamin keaslian, kita melaporkan derajat pemeriksaan. Kalimat baku di dossier: *"Status dokumen menggambarkan tingkat pemeriksaan, bukan jaminan keaslian."*

---

## 3. Empat pintu masuk bukti (rak C dan D)

| Pintu | Alur | Fase |
|---|---|---|
| **A. Dari kartu konfirmasi** | Kartu draf (voice/teks) punya tombol "📷 Foto nota" (opsional, bisa dilewati). Foto → kompres klien → upload → `document_attachments(TRANSACTION)`. Tanpa OCR: angka sudah dari ucapan; foto = bukti. | **D-A** |
| **C. Menempel belakangan** | Detail transaksi → "Tambah bukti" → pilih foto/dokumen yang sudah ada di lemari atau unggah baru. | **D-A** |
| **D. Dokumen yang mengisi register** | Transaksi kategori 8 (beli alat) atau 4b (pinjaman cair) → setelah simpan, ajakan jelas "foto notanya / fotokan perjanjiannya". Lampiran menempel ke transaksi DAN ke `fixed_assets`/`loans` sekaligus (dua baris attachment, satu dokumen). | **D-A** |
| **B. Nota → draf (OCR)** | Upload nota tanpa transaksi → OCR → teks masuk `nominal-parser` + gating (pipeline voice) → kartu konfirmasi → transaksi + bukti sudah menempel. Struk multi-baris: ambil **grand total** sebagai satu transaksi kategori 5. Tidak pernah tersimpan diam-diam; selalu berakhir di kartu. | **D-C** |

Aturan lintas pintu: satu dokumen boleh menempel banyak target; menghapus/membalikkan transaksi tidak menghapus dokumen; dokumen rak C tanpa attachment > 30 hari muncul di kartu "nota belum tertaut" (bukan merah).

---

## 4. Model data (migrasi `0031` — setelah `0030` Tahap B laporan)

```
documents (perluasan tabel yang ada; nama kolom ikuti konvensi eksisting)
  + doc_class        enum(IDENTITAS, LEGALITAS, BUKTI_TRANSAKSI, ASET_KONTRAK, ARSIP_KELUARAN)
  + doc_type         text          -- 'KTP','NPWP','NIB','PIRT','HALAL','SLHS','BPOM_MD','MEREK',
                                   -- 'NOTA','KUITANSI','BUKTI_TRANSFER','SEWA','PERJANJIAN_PINJAMAN',
                                   -- 'PDF_SAK_EMKM','SNAPSHOT_DOSSIER','LAINNYA'
  + doc_number       text null
  + issuer           text null
  + issued_on        date null
  + valid_until      date null     -- null = tidak kedaluwarsa (NIB)
  + name_on_doc      text null
  + assurance_level  enum(SELF_DECLARED, CHECKED, CONFIRMED, ATTESTED) default SELF_DECLARED
  + attested_by      uuid null
  + attested_at      timestamptz null
  + needs_class_review boolean default false
  + content_hash     text null     -- sha256, deteksi duplikat (D-C)

document_attachments
  id uuid PK, business_id uuid,
  document_id uuid FK documents,
  target_type enum(TRANSACTION, JOURNAL_ENTRY, FIXED_ASSET, LOAN, INVENTORY_COUNT),
  target_id uuid,
  created_by uuid, created_at timestamptz,
  UNIQUE(document_id, target_type, target_id)
  -- RLS pola kepemilikan usaha yang sama; tanpa UPDATE (immutable), DELETE hanya soft via kolom removed_at + alasan

document_requirements (seed, tanpa business_id)
  id, sector enum(8 sektor), doc_type, requirement enum(WAJIB, DISARANKAN),
  order_index smallint, mission_key text null, note text
  -- seed sektor pangan olahan Bagian 6

document_reminders
  id, business_id, document_id, remind_on date,
  kind enum(H90, H30, H7, EXPIRED, HALAL_DEADLINE),
  status enum(PENDING, SENT, DISMISSED, DONE),
  UNIQUE(document_id, kind)

report_issues (rak E; diisi otomatis oleh generator PDF/snapshot)
  id, business_id, document_id FK documents,
  report_kind enum(PDF_SAK_EMKM, SNAPSHOT_DOSSIER),
  period_from date, period_to date,
  document_uid text UNIQUE,          -- tercetak di kaki halaman PDF
  audience enum(SELF, INSTITUTION), institution_id uuid null,
  formula_version text, created_at
```

Backfill: dokumen lama diberi `doc_class`/`doc_type` dari jenis yang sudah tercatat; yang tak terpetakan → `needs_class_review = true`.

---

## 5. Pemeriksaan otomatis per jenis (untuk naik ke CHECKED)

| doc_type | Aturan format | Sumber isian OCR → konfirmasi pemilik |
|---|---|---|
| NIB | 13 digit angka | nomor, nama usaha, tanggal terbit |
| NPWP | 15/16 digit (format baru), checksum format saja | nomor (mask di UI), nama |
| PIRT | 15 digit (format P-IRT), ada kode jenis pangan | nomor, masa berlaku (5 th dari terbit bila tidak terbaca → minta isi) |
| HALAL | format ID + tanggal; masa berlaku 4 th | nomor, masa berlaku |
| KTP | 16 digit NIK; **hanya 4 digit terakhir disimpan terbuka**, sisanya mask | nama, NIK ter-mask |
| Lainnya | tanpa aturan → maksimal CONFIRMED via konfirmasi manual | — |

Aturan format = data di tabel konfigurasi, bukan hardcode, supaya bisa dikoreksi tanpa deploy. Gagal aturan ≠ ditolak; dokumen tetap tersimpan sebagai SELF_DECLARED dengan catatan "nomor tidak sesuai format umum — cek lagi ya".

---

## 6. Kelengkapan sektor pangan olahan (seed `document_requirements`)

| Urutan | doc_type | Status | Catatan misi (Perjalanan) |
|---|---|---|---|
| 1 | KTP | WAJIB | fondasi identitas |
| 2 | NIB | WAJIB | "urus di OSS, gratis, 30 menit" |
| 3 | PIRT | WAJIB | syarat edar pangan olahan rumah produksi |
| 4 | HALAL | WAJIB | **deadline UMK 17 Okt 2026 (PP 42/2024)** — kartu countdown |
| 5 | NPWP | DISARANKAN | "wajib saat omzet mendekati Rp500 juta/tahun" |
| 6 | BPOM MD | DISARANKAN | "saat masuk ritel modern / produksi di fasilitas khusus" |
| 7 | MEREK | DISARANKAN | perlindungan jangka panjang |

Kartu Beranda: "3 dari 4 fondasi wajib lengkap" + tautan ke misi berikutnya. Komponen readiness membaca tabel yang sama (spek `wp08-pilot-v2`, terpisah). Bahasa selalu tangga, tidak pernah rapor merah.

---

## 7. Mesin pengingat

- Job harian (pg_cron / route terjadwal, ikuti mekanisme job yang ada): isi `document_reminders` untuk dokumen ber-`valid_until` (H-90, H-30, H-7, EXPIRED) dan kartu `HALAL_DEADLINE` untuk semua usaha sektor pangan olahan yang belum punya dokumen HALAL ber-status ≥ CONFIRMED (remind_on = H-45/H-14 dari 2026-10-17).
- Kanal fase ini: kartu Beranda + item "Perlu perhatian" (komponen yang sudah ada). Push/WA = di luar cakupan.
- Nada: ajakan, bukan ancaman. "PIRT-mu berlaku sampai 12 Des — perpanjang dari sekarang biar tenang." EXPIRED memakai `--status-attention-*` (amber), **bukan** alert merah.
- Dismiss tersimpan; pengingat yang sama tidak muncul lagi kecuali naik tingkat (H-30 setelah H-90 di-dismiss tetap muncul).

---

## 8. Integrasi keluar

| Ke | Apa |
|---|---|
| **CALK** | Kebijakan akuntansi + kalimat: "Transaksi didukung bukti digital yang tertaut pada jurnal." Catatan aset/pinjaman menandai mana yang berdokumen. |
| **Mode Akuntan** | Ikon klip 📎 di baris jurnal yang punya attachment → pratinjau (signed URL 60 dtk). |
| **Dossier institusi** | (1) Blok legalitas: jenis + nomor + masa berlaku + tingkat keyakinan; (2) **Indikator kelengkapan bukti**: "X% dari nilai transaksi ≥ Rp500.000 dalam 90 hari terakhir memiliki bukti" — dihitung dari **nilai rupiah**, bukan jumlah transaksi; (3) daftar arsip keluaran yang pernah diterbitkan untuk institusi itu. File penuh apa pun hanya via consent eksplisit (mekanisme yang ada). |
| **Rak E otomatis** | Generator PDF SAK EMKM dan snapshot menulis `report_issues` + menyimpan berkasnya; `document_uid` tercetak di kaki halaman. |
| **Perjalanan/misi** | Misi legalitas membaca `document_requirements` + status dokumen; misi selesai berdasarkan dokumen ber-status ≥ CONFIRMED (bukti, bukan klaim — prinsip yang ada). |

---

## 9. UX (dengan Yosua)

- Navigasi Dokumen menjadi lemari 5 bagian dengan nama warung: **"Identitas saya" · "Izin usaha" · "Nota & bukti" · "Alat & perjanjian" · "Laporan yang pernah dibuat"**.
- Upload selalu lewat kamera dulu ("Foto dokumennya"), galeri kedua, file ketiga. Kompresi klien: sisi terpanjang 1600 px, kualitas ~0,8, target 200–400 KB; tampilkan ukuran akhir ("0,3 MB — hemat kuota").
- Dorongan bukti bertingkat (L10): < Rp100 rb tidak diganggu; ≥ Rp500 rb satu ajakan lembut di kartu sukses; kategori 8/4b ajakan jelas. Copy: "Foto notanya biar catatanmu makin kuat."
- Status dokumen memakai token: tersimpan `--status-neutral`, terbaca/berlaku `--status-success`, mendekati kedaluwarsa `--status-attention`, gagal unggah (sistem) `--status-alert`.
- Konfirmasi OCR tetap pola lama: hasil baca tampil, pemilik betulkan, simpan.

---

## 10. Risiko

| # | Risiko | Mitigasi | Sinyal |
|---|---|---|---|
| K1 | Foto berisi PII tak terduga (alamat di invoice) | rak C default privat; masuk dossier hanya via consent; tak pernah di log; pratinjau selalu signed URL singkat | audit sampling |
| K2 | OCR salah baca nomor izin | naik CHECKED butuh aturan format; CONFIRMED butuh manusia; salah format → tetap tersimpan + ajakan cek | rasio gagal aturan |
| K3 | Storage bengkak | kompresi klien; kuota lunak 500 foto/usaha lalu ajakan; ukuran max 2 MB server-side | GB/usaha p95 |
| K4 | Pengingat jadi spam | maksimal 1 kartu pengingat dokumen per hari; dismiss dihormati | rasio dismiss |
| K5 | Pemilik mengira foto = tercatat | Pintu B ditunda; selama D-A/B, upload rak C selalu dari/ke transaksi sehingga ambiguitas kecil; kartu "nota belum tertaut" | jumlah untethered > 30 hari |
| K6 | Duplikat nota | `content_hash` + peringatan (D-C) | duplikat/bulan |
| K7 | Tanggal masa berlaku salah isi → pengingat salah | konfirmasi pemilik wajib untuk `valid_until`; format tanggal dd/mm/yyyy dengan contoh | koreksi tanggal |
| K8 | Beban Harsya | D-A dipangkas ke 3 pintu tanpa OCR baru; D-B tanpa AI sama sekali | — |

---

## 11. Penahapan dan definisi selesai

| Tahap | Isi | Target | DoD |
|---|---|---|---|
| **D-0 Patch Beranda** | 5 temuan 3 Sep: (1) "meja/kulkas/etalase/kompor/mesin" terarah ke kategori 8 + register aset terisi + backfill transaksi "meja" yang salah kelas; (2) kartu Uang masuk/keluar diberi label "dari catatan yang sudah dicek" + badge jumlah belum dicek; (3) banner tutup kas sebelum 04.00 menawarkan hari sebelumnya; (4) sapu kamus: "Arus kas hari ini" → "Sisa uang hari ini" + audit istilah akuntan di seluruh UI UMKM; (5) template aktivitas tidak menampilkan nominal dua kali | **6 Sept** | 5 uji Playwright, satu per temuan |
| **D-A Bukti menempel** | `0031` (documents+, attachments, requirements seed, reminders schema, report_issues); migrasi kelas dokumen lama; Pintu A, C, D; ikon klip Mode Akuntan; kalimat CALK | **12 Sept** | E2E: ucap "beli kulkas 3 juta" → konfirmasi → foto nota → aset terdaftar + jurnal 1600 + klip tampil + nota juga di rak D |
| **D-B Masa berlaku & kelengkapan** | metadata nomor/terbit/berlaku + aturan format (CHECKED); wizard pemilahan `needs_class_review`; mesin pengingat + kartu countdown halal; kartu "X dari Y fondasi"; blok legalitas dossier (status+nomor+berlaku+tingkat) | **20 Sept** | pengingat H-30 muncul untuk fixture PIRT; kartu halal tampil utk akun pangan olahan tanpa HALAL; dossier menampilkan blok legalitas |
| **Rak E** | generator PDF/snapshot menulis `report_issues` + simpan berkas + `document_uid` di kaki halaman | menumpang D-A | PDF baru muncul di "Laporan yang pernah dibuat" dan bisa diunduh ulang byte-identik |
| **D-C** | Pintu B (OCR→draf via pipeline voice), PDF OCR provider kedua, `ATTESTED` + peran pendamping, deteksi duplikat, rekening koran | pilot | gerbang tersendiri |

## 12. Di luar cakupan
Push notification/WhatsApp, tanda tangan digital, verifikasi ke sumber resmi (OSS/BPJPH API), itemisasi struk per baris, watermark, enkripsi tambahan di luar yang ada.

## 13. Pertanyaan terbuka untuk Harsya
1. Tabel dokumen eksisting: apa nama dan bentuk kolom jenis dokumen sekarang? (menentukan mapping backfill `doc_class`)
2. Mekanisme job terjadwal yang sudah ada di repo apa (pg_cron, vercel cron, lainnya)? Pengingat menumpang situ.
3. Penyimpanan: bucket terpisah per kelas atau satu bucket + path? Kebijakan akses berbeda per rak lebih mudah di bucket terpisah — cek biaya konfigurasi RLS storage yang ada.
4. Komponen "Perlu perhatian" di Beranda: sudah generik (bisa menerima kartu tipe baru) atau hardcode?
5. Kompresi klien: sudah ada util gambar (dari alur OCR sekarang) yang bisa dipakai ulang?
