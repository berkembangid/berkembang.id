# Spesifikasi Fitur: Portal Admin "Ruang Mesin" — v1.1 (Dasbor Interaktif & Manajemen Pengguna)

**Produk:** BERKEMBANG.ID · Tim P0160
**Versi:** 1.1 · 6 September 2026 — **memperluas v1.0** (peran, log, Mode Dukungan, konfigurasi ber-versi, flags, demo reset tetap berlaku; dokumen ini merinci tiga hal yang di v1.0 masih garis besar: dasbor, manajemen data UMKM, dan manajemen pengguna)
**Untuk:** Harsya (CTO) · cc: Hadi, Garly, Yosua · **Dari:** Hadi
**Prasyarat:** `0029`–`0035` sesuai peta migrasi; telemetry V-A/K-A mengalir; `readiness_daily` terisi.
**Acuan visual:** `mockup-admin-dashboard.html`

> **Satu kalimat untuk dipegang saat build:**
> Dasbor admin ada untuk menjawab tiga pertanyaan setiap pagi — *apakah produk sehat, apakah pengguna tumbuh dan bertahan, apakah ada yang butuh tindakan hari ini* — dan setiap jawaban harus bisa diklik sampai ke daftar akun yang bisa ditindak, tanpa pernah membuka isi keuangan UMKM tanpa tiket.

---

## 0. Keputusan tambahan (melanjutkan M1–M12 v1.0)

| # | Keputusan | Alasan |
|---|---|---|
| M13 | **Dasbor dibangun di dalam aplikasi** (React + komponen chart yang sudah dipakai UMKM), BUKAN memakai BI eksternal (Metabase/Grafana) di fase ini. | Best option untuk kita — alasan lengkap di §6. |
| M14 | **Dua lapis data**: agregat harian (`ops_daily_rollups`, diisi job malam — cepat, untuk tren) + query langsung (untuk "hari ini" dan drill-down). Tidak ada angka dasbor yang dihitung di klien. | p95 dasbor < 1 dtk tanpa membebani DB produksi. |
| M15 | **Setiap angka bisa diklik** (drill-down) sampai ke daftar entitas (akun, capture, dokumen) — dan dari daftar bisa langsung ke tindakan jalur resmi. Dasbor tanpa tindakan hanyalah hiasan. | Ops tim 4 orang: dasbor = daftar kerja. |
| M16 | **Privasi berlapis tetap berlaku di dasbor**: agregat & metadata operasional (jumlah transaksi, level, status antrean) terlihat bebas; **isi keuangan (angka rupiah per akun) tidak pernah tampil di dasbor/daftar** — hanya via Mode Dukungan ber-tiket (M4). Kolom rupiah di daftar UMKM = dilarang. | Konsistensi janji privasi; tetap operasional penuh. |
| M17 | **Segmentasi tersimpan** (saved views) untuk daftar UMKM: filter + kolom + urutan bisa disimpan bernama (mis. "Depok pangan, Tembaga, pasif 7 hari") dan dipakai untuk kampanye pendampingan. | Pod ops & program dinas butuh kohort berulang. |
| M18 | **Ekspor dari admin hanya agregat/metadata** (CSV daftar tanpa rupiah, PDF dasbor ber-watermark internal). Ekspor isi keuangan dari admin tidak ada. | Anti-bocor; keuangan keluar hanya lewat jalur consent produk. |
| M19 | Semua tren tampil dengan pembanding periode sebelumnya dan penanda peristiwa (deploy versi konfigurasi, flag berubah) di sumbu waktu. | Perubahan metrik hampir selalu berkorelasi dengan perubahan yang kita buat sendiri. |

---

## 1. Dasbor — struktur & isi

Tiga dasbor (tab) + satu baris kesehatan yang selalu tampil di atas semuanya.

### 1.0 Baris kesehatan (selalu terlihat)
6 lampu: API error rate 1 jam · antrean capture menunggu · job harian terakhir · circuit breaker provider AI · `llm_amount_violation` (harus 0, tampil besar) · flag darurat aktif. Hijau/amber/alert (alert boleh merah — ini kegagalan sistem, sesuai palet). Klik lampu → panel insiden terkait.

### 1.1 Tab **Produk** (pertanyaan: tumbuh & bertahan?)
- KPI kartu (hari ini vs 7 hari vs 30 hari, dengan Δ%): akun aktif harian (DAU: ≥1 transaksi/tutup kas), akun baru, transaksi tercatat, retensi D7 kohort mingguan, distribusi tingkat kesiapan (4 kolom kecil).
- Grafik: garis DAU 30 hari (penanda peristiwa M19); batang transaksi/hari per mode input (suara/kamera/ketik — susun, bukan tumpuk warna-merah); **corong aktivasi** daftar → profil lengkap → saldo awal → 7 hari mencatat → Tembaga (klik tahap → daftar akun yang berhenti di situ, M15); heatmap jam mencatat (7×24) untuk memahami perilaku.
- Tabel kohort mingguan retensi (minggu daftar × minggu aktif).

### 1.2 Tab **Kualitas AI** (pertanyaan: pipeline dipercaya?)
- KPI: rasio jalur TEXT_ONLY / WHISPER / OCR · simpan-tanpa-edit % · edit nominal % vs edit kategori % · p50/p95 ucapan→draf · `llm_amount_violation` = 0.
- Grafik: garis simpan-tanpa-edit 30 hari per jalur; batang alasan NEEDS_INPUT (nominal tak ketemu / ambigu / OCR gagal); divergensi klien-server.
- Drill-down: klik "edit nominal" → daftar capture teranonim (id, jalur, panjang teks, hasil parser vs hasil akhir — TANPA teks mentah) untuk analisis pola; tombol "tandai untuk golden set".

### 1.3 Tab **Biaya & Kesehatan** (pertanyaan: tagihan & mesin aman?)
- KPI: biaya AI hari ini & per capture (Rp) · error provider 24 jam · umur antrean offline p95 · storage per rak (GB) · PDF diterbitkan.
- Grafik: garis biaya harian per provider; batang error per endpoint; tabel job harian (nama, terakhir sukses, durasi).

### 1.4 Interaktivitas (berlaku semua tab)
Rentang waktu global (hari ini / 7 / 30 / 90 / kustom) · filter global (sektor, kab/kota, flag demo dikecualikan default) · hover tooltip angka persis · klik legenda menyembunyikan seri · setiap kartu punya menu ⋯ (lihat definisi metrik — teks rumus dari konfigurasi, unduh CSV agregat) · semua drill-down membuka daftar di §2 dengan filter terisi. Auto-refresh 5 menit untuk baris kesehatan; tab lain manual/refresh saat buka.

## 2. Manajemen data UMKM ("semua data", dengan lapisan)

### 2.1 Daftar UMKM
Kolom default: nama usaha, kode, sektor, kab/kota, tingkat kesiapan, hari-mencatat/30, transaksi 30 hari (jumlah, bukan rupiah), antrean review, dokumen wajib X/Y, status akun (AKTIF / PASIF 7+ / PASIF 30+ / DIBEKUKAN / DEMO / TENGGANG-HAPUS), terakhir aktif. **Tanpa kolom rupiah (M16).**
Filter semua kolom + pencarian (nama/kode/email) + segmentasi tersimpan (M17) + urutan netral (bukan "terbaik"). Aksi massal HANYA non-invasif: kirim ke daftar kampanye pendamping, tandai kohort program, ekspor CSV metadata (M18).

### 2.2 Halaman detail akun (metadata dulu, isi ber-tiket)
Tab: **Ringkasan** (status modul, tingkat + pilar, umur catatan, mode input yang dipakai, perangkat/capability profile) · **Aktivitas** (jejak event non-finansial: daftar, saldo awal, dokumen naik status, PDF terbit, consent diberikan/dicabut — tanpa isi) · **Dokumen** (daftar + status keyakinan; pratinjau berkas identitas TIDAK tersedia di sini) · **Akses** (consent aktif, riwayat lembaga membuka, support session sebelumnya) · **Tindakan** (semua jalur resmi v1.0 §3.2 + kelola status akun §3 di bawah) · **Mode Dukungan** (tombol ber-alasan → sesi 30 menit read-only, banner, tercatat & terlihat UMKM).

### 2.3 Kualitas data lintas akun
Halaman "Perhatian data": akun dengan antrean review menumpuk (>10), backfill `needs_reclass` tersisa, dokumen `needs_class_review`, wizard saldo awal mangkrak, selisih tutup kas besar berulang (jumlah kejadian, bukan nominal), capture gagal berulang. Setiap baris → tindakan (kirim pengingat lewat kartu Beranda pengguna, tugaskan ke pendamping, buka tiket dukungan).

## 3. Manajemen pengguna (tiga populasi, satu disiplin)

### 3.1 Akun UMKM (lifecycle)
Status: AKTIF → PASIF (otomatis 7/30 hari, hanya label) → DIBEKUKAN (manual ber-alasan: pelanggaran §4 S&K — memblokir login, data utuh) → TENGGANG-HAPUS (dipicu pengguna dari Profil; 30 hari; admin bisa lihat status, TIDAK bisa memicu hapus atas nama pengguna) → TERHAPUS (job). Tindakan admin: bekukan/aktifkan (dua orang untuk bekukan? tidak — cukup satu OPS + alasan + log; SUPER_ADMIN untuk buka bekuan), kirim ulang verifikasi email, reset ke fixture HANYA jika `is_demo`. Password/OTP tidak pernah terlihat; reset password = kirim tautan resmi.

### 3.2 Pengguna internal (admin) — memperinci M1/M2
Halaman Admin & Peran: daftar admin (nama, peran-peran, status, terakhir aktif, jumlah aksi 30 hari), undang via email (peran ditentukan pengundang SUPER_ADMIN), nonaktifkan seketika (sesi dicabut ≤ 1 menit), riwayat perubahan peran di `admin_action_logs`. Aturan: minimal 2 SUPER_ADMIN aktif (guard: SUPER_ADMIN terakhir tidak bisa menonaktifkan dirinya); pemberian peran SUPER_ADMIN butuh SUPER_ADMIN lain (dua kunci); PENDAMPING otomatis terikat pod. Setiap layar admin menampilkan "kamu bertindak sebagai [peran]" bila multi-peran (pilih peran per sesi — log memakai peran terpilih).

### 3.3 Organisasi & anggota lembaga (operasionalisasi I11/§3.1 v1.0)
Dari admin: buat organisasi, undang anggota pertama, lihat anggota (nonaktifkan atas permintaan resmi organisasi — ber-alasan), set entitlements, suspend organisasi. Anggota lembaga selebihnya dikelola ADMIN organisasi itu sendiri dari portal institusi — admin kita tidak menambah anggota atas nama mereka (jejak tanggung jawab jelas).

## 4. Data & perubahan skema (menambah `0035`)

```
ops_daily_rollups   metric_date, metric_key, dims jsonb (sector, region, path, …), value numeric
                    UNIQUE(metric_date, metric_key, dims)   -- diisi job malam; sumber tren
saved_views         id, owner_admin_id, name, entity ('umkm'), filters jsonb, columns jsonb, shared bool
account_status     (kolom pada business/akun) status enum + status_reason + status_changed_by/at
metric_definitions  metric_key PK, formula_text, source_note   -- ditampilkan di menu ⋯ (M15/M19); ikut config_versions domain SYSTEM_TEXTS
```
Semua tabel RLS admin; rollup tidak pernah memuat rupiah per akun (agregat lintas akun boleh: total transaksi COUNT ya, SUM rupiah lintas platform boleh untuk biaya AI — bukan per akun).

## 5. Invarian tambahan (jadi test, melanjutkan v1.0 §5)

11. Tidak ada endpoint/daftar/rollup admin yang mengembalikan nominal rupiah per akun UMKM (test menyapu respons; pengecualian eksplisit: Mode Dukungan render UI baca).
12. Setiap KPI punya `metric_definitions` dan drill-down yang menghasilkan daftar dengan jumlah baris = angka KPI (uji rekonsiliasi 3 metrik kunci: DAU, capture hari ini, akun pasif 7+).
13. Akun `is_demo` dikecualikan dari semua KPI produk secara default; toggle menampilkan berlabel.
14. Aksi massal tidak pernah memicu jalur invasif (bekukan massal tidak ada; test rute).
15. SUPER_ADMIN terakhir tidak bisa dinonaktifkan; pemberian SUPER_ADMIN oleh diri sendiri ditolak.
16. Dasbor p95 < 1 dtk pada fixture 5.000 akun / 500 ribu transaksi (rollup) — benchmark test.
17. Penanda peristiwa (M19) muncul untuk publish konfigurasi & perubahan flag (uji integrasi dengan `config_versions`).

## 6. Best option dasbor — keputusan & alasan (M13)

**Pilihan yang dibandingkan:** (a) BI eksternal self-host (Metabase/Grafana) menempel ke replika DB; (b) SaaS analytics (Amplitude/Mixpanel); (c) **bangun di aplikasi** dengan stack yang ada + rollup harian.

**Keputusan: (c), dengan (a) sebagai opsi internal nanti.** Alasannya: (1) dasbor kita harus **bisa bertindak** (drill-down → bekukan/tugaskan/tiket) — BI eksternal berhenti di angka; (2) kebijakan privasi berlapis (M16) harus ditegakkan kode kita — memberi Metabase akses DB = membuat jalan pintas melewati RLS dan Mode Dukungan; (3) SaaS analytics berarti mengirim event pengguna ke pihak ketiga — bertabrakan dengan cerita PDP kita; (4) komponen chart, token warna, dan tabel sudah ada di codebase — biaya marginal kecil; (5) satu hal yang biasanya jadi alasan memakai BI (query ad-hoc oleh non-engineer) belum relevan untuk tim 4 orang. **Kompromi masa depan:** kalau tim analisis tumbuh, pasang Metabase READ-ONLY ke skema `ops_daily_rollups` SAJA (agregat, tanpa PII/rupiah) — bukan ke tabel produksi. Catat sebagai Adm-C.

Prinsip visual dasbor (selaras palet): angka besar navy-700, tren mint-500 (naik) / navy-400 (turun — bukan merah), alert merah hanya baris kesehatan, semua angka `tabular-nums`, maksimal 6 kartu KPI per tab, tanpa pie chart (batang/garis lebih terbaca), penanda peristiwa garis putus vertikal.

## 7. Penahapan (merevisi prioritas Adm-A v1.0 §6)

| Urutan | Isi | Target |
|---|---|---|
| 1 | Demo reset + Flags/kill switch (tetap prioritas 1–2 v1.0) | 12 Sept |
| 2 | Baris kesehatan + Tab Kualitas AI + Tab Biaya (data telemetry sudah ada dari V-A/K-A; kartu "belum diukur" untuk yang belum) + `metric_definitions` | 18 Sept |
| 3 | Daftar UMKM + detail akun (metadata) + Mode Dukungan + lifecycle §3.1 + onboarding institusi | 19 Sept |
| 4 | Tab Produk penuh (rollup + corong + kohort) + saved views + halaman Perhatian data + manajemen admin §3.2 | FEKDI |
| 5 | Editor konfigurasi lengkap + pendamping/pod (Adm-B v1.0) | pilot |

## 8. Pertanyaan terbuka
1. (Harsya) Library chart yang sudah dipakai di UMKM — cukup untuk heatmap & corong, atau corong dirender sebagai batang bertingkat saja (usul: batang bertingkat, hindari library baru)?
2. (Harsya) Job rollup malam menumpang mekanisme job yang mana; kalau belum ada scheduler andal, fallback: rollup dihitung saat tab Produk dibuka + cache 1 jam — putuskan di Checkpoint 0.
3. (Hadi/Garly) KPI "bintang utara" yang dipajang paling besar di Tab Produk: usul **akun yang mencatat ≥ 20 hari/bulan** (proxy kebiasaan hidup = nilai kita) — setuju, atau DAU biasa?
