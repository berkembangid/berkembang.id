# Super Prompt untuk Claude Code — Patch Dokumen & Profil (D-P)

Cara pakai: tempel prompt di bawah garis ke Claude Code dari root repo, sesi baru. Prasyarat: sesi Lemari Dokumen (D-0 + D-A + Rak E, migrasi `0031`) sudah selesai dan hijau. Spek induk tetap `docs/specs/SPEC_Lemari_Dokumen.md`; prompt ini adalah ronde perbaikan berdasarkan review layar 3 September (halaman Dokumen dan Profil), bukan fitur baru besar.

---

Kamu adalah senior engineer di repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase, Zod, Vitest, Playwright). Tugasmu: **Tahap D-P — merapikan halaman Dokumen dan Profil** sesuai daftar patch bernomor di bawah. Baca dulu `docs/specs/SPEC_Lemari_Dokumen.md` (terutama Bagian 1 lima rak, Bagian 6 kelengkapan sektor, keputusan L9–L11) dan `docs/specs/SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md` Bagian 5.1 (enum sektor `category_templates`). Konflik spek vs kode → berhenti dan tanya saya.

Prinsip yang berlaku dari spek-spek sebelumnya dan tidak diulang panjang di sini: bahasa warung (tanpa istilah akuntan/penilaian), token warna (`--status-*`; merah hanya kegagalan sistem), KTP/NPWP tidak pernah dibagikan, lint kata terlarang, RLS pola repo, tidak ada `any`.

## Daftar patch (kerjakan berurutan)

### P1 — Hapus kartu "Laporan Keuangan (upload)"
Kartu upload "Laporan Keuangan" di seksi Keuangan & Transaksi **dihapus**. Produk ini menghasilkan laporan dari catatan; menerima upload laporan jadi membuka jalan bypass inti produk. Dokumen yang telanjur terunggah lewat kartu itu (kalau ada) dipindah ke `doc_class = ASET_KONTRAK`, `doc_type = 'LAINNYA'`, `needs_class_review = true` — jangan dihapus.

### P2 — Keluarkan "Riwayat QRIS" dari Dokumen
Kartu Riwayat QRIS dihapus dari halaman Dokumen. Ini sumber data (untuk fitur impor/rekonsiliasi masa depan), bukan dokumen. Jangan bangun fitur impor sekarang. Berkas telanjur terunggah → perlakuan sama seperti P1.

### P3 — Susun ulang halaman Dokumen menjadi 5 rak
Urutan seksi: **"Identitas saya"** (KTP, NPWP) → **"Izin usaha"** (NIB, PIRT, Sertifikat Halal, Izin Edar) → **"Nota & bukti"** (daftar dokumen `BUKTI_TRANSAKSI` dari Pintu A/C/D, dengan tautan ke transaksinya; state kosong: "Nota akan muncul di sini saat kamu memfotonya dari catatan") → **"Alat & perjanjian"** (nota alat, sewa, perjanjian pinjaman, **Rekening Koran** pindah ke sini, Foto Tempat Usaha, Bukti Utilitas) → **"Laporan yang pernah dibuat"** (sudah ada, jangan diubah). Seksi "Keuangan & Transaksi" dan "Bukti Pendukung Usaha" dibubarkan ke rak-rak di atas.

### P4 — Kartu Akta Pendirian kondisional
Tambahkan field bentuk usaha di profil (`PERORANGAN` default | `BADAN_USAHA`). Kartu "Akta Pendirian / SK" hanya tampil untuk `BADAN_USAHA`, dan penghitung "X dari Y" menyesuaikan. Fixture demo (DImsum) = PERORANGAN.

### P5 — Label wajib dan warna
Badge merah "Wajib" diganti: teks **"Fondasi"** dengan gaya `--status-attention` (amber) atau netral — merah dilarang untuk keadaan pengguna. Status wajib/disarankan dibaca dari `document_requirements` (seed `0031`), bukan hardcode: untuk pangan olahan, NPWP = **Disarankan** (bukan wajib), dengan keterangan "wajib saat omzet mendekati Rp500 juta/tahun".

### P6 — Upload = kamera dulu + kompresi klien
Tombol "Pilih file (maks. 5 MB)" diganti pola: **"Foto dokumennya"** (memicu kamera via `capture` di mobile) dengan opsi sekunder "pilih dari galeri/file". Terapkan kompresi klien yang sudah dibuat di D-A (sisi terpanjang 1600 px) pada semua upload gambar di halaman ini. Batas ukuran tetap ditegakkan server.

### P7 — Metadata izin tampil di kartu
Untuk dokumen rak "Izin usaha" yang sudah terunggah, kartu menampilkan nomor + masa berlaku (dari kolom `doc_number`, `valid_until` di `0031`) + tingkat keyakinan dalam bahasa warung ("Tersimpan / Terbaca / Sudah kamu cek"). Kalau `valid_until` kosong untuk jenis yang seharusnya punya (PIRT, Halal), tampilkan ajakan "isi masa berlakunya biar bisa kami ingatkan". (Mesin pengingatnya sendiri tetap D-B — jangan dibangun di sesi ini.)

### P8 — NIB satu sumber kebenaran
Di Profil, kolom ketik "NIB (Nomor Induk Berusaha)" **dihapus** dan diganti blok **"Ringkasan legalitas" read-only**: NIB / PIRT / Halal dengan status ✓ + nomor + masa berlaku, ditarik dari metadata dokumen; setiap baris menaut ke halaman Dokumen. Nilai NIB yang sudah telanjur diketik pengguna di profil dimigrasikan: kalau belum ada dokumen NIB, simpan sebagai dokumen rak Izin usaha ber-status `SELF_DECLARED` dengan `doc_number` terisi dan catatan "belum ada berkas".

### P9 — Profil dirapikan jadi 4 blok
Urutan: (a) **Identitas usaha**: nama, logo, sektor, **tahun mulai usaha** (field baru, wajib diisi, dipakai dossier sebagai "lama usaha"), **jumlah karyawan** (field baru: sendiri / 1–4 / 5–19, opsional), kota, alamat, **kanal penjualan** (multi-pilih: warung/kios, WhatsApp, marketplace, media sosial — memberi makan readiness), bentuk usaha (P4); (b) **Kontak pemilik**: nama, email, WhatsApp; (c) **Ringkasan legalitas** (P8); (d) **Privasi & akun**: panel izin yang sudah ada + dua tombol baru: **"Unduh semua data saya"** (ekspor ZIP: profil JSON, CSV jurnal, daftar dokumen + berkasnya — boleh async dengan status) dan **"Hapus akun"** (konfirmasi dua langkah, soft-delete dengan masa tenggang 30 hari, tulis alurnya di layar). Badge "Akun Terverifikasi" diganti **"Email terverifikasi"**.

### P10 — Sinkronisasi enum sektor
Pilihan sektor Profil (Kuliner/Fashion/Pertanian/Jasa/Kerajinan/Teknologi/Lainnya) harus memetakan eksplisit ke enum sektor `category_templates`. Buat tabel mapping tunggal (konstanta terekspor + test) dan pastikan: pengguna sektor "Kuliner" ter-resolve ke template pangan olahan yang di-seed; sektor tanpa template → fallback eksplisit ke template default dengan log peringatan, BUKAN gagal diam-diam. Laporkan padaku mapping final yang kamu pasang.

### P11 — Sapu kata "score"
Teks helper NIB "menaikkan Readiness Score" dan semua kemunculan "score/skor/poin readiness" di UI UMKM diganti keluarga "tingkat kesiapan". Format "17/100" di Beranda diganti tampilan non-rapor: "Tingkat kesiapan: Perunggu — 3 dari 7 fondasi lengkap" (ambil definisi fondasi dari `document_requirements` + komponen readiness yang ada; kalau datanya belum cukup untuk tangga, minimal hilangkan format X/100 dan kata score). Tambahkan `score`, `skor` ke lint kamus direktori UI UMKM (Mode Akuntan dan portal institusi dikecualikan).

## Langkah kerja

**Langkah 0 (tanpa kode):** baca halaman Dokumen dan Profil saat ini + skema profil di DB; laporkan ≤ 30 baris: struktur komponen, dari mana kartu-kartu dokumen didefinisikan (config atau hardcode), dampak P8/P9 ke tabel profil (kolom baru → migrasi `0032`), dan status quality gate. **Checkpoint 0:** rencana migrasi `0032` + daftar file. Tunggu persetujuan.

**Langkah 1:** P1–P7 (halaman Dokumen). **Checkpoint 1:** Playwright: lima rak tampil urut; akun PERORANGAN tidak melihat Akta; kartu PIRT terunggah menampilkan nomor+masa berlaku; tidak ada kartu QRIS/Laporan Keuangan; screenshot.

**Langkah 2:** P8–P11 (Profil + sektor + kamus). **Checkpoint 2:** Playwright: NIB read-only menarik dari dokumen; migrasi NIB ketikan lama jadi dokumen SELF_DECLARED; unduh-semua-data menghasilkan ZIP berisi profil+CSV jurnal; test mapping sektor; lint kamus menangkap "score". Screenshot Profil 4 blok.

**Langkah 3:** quality gate penuh (`lint`, `typecheck`, `test`, `test:integration`, `build`, lint kamus) apa adanya; perbarui dokumen status produk; handoff ≤ 25 baris termasuk keputusan yang kamu ambil sendiri dan mapping sektor final.

## Batasan
- Jangan bangun: impor/rekonsiliasi QRIS, mesin pengingat (D-B), OCR baru, perubahan portal institusi di luar pembacaan ringkasan legalitas, push notification.
- Migrasi `0032` hanya untuk kolom profil baru (tahun mulai, karyawan, kanal, bentuk usaha) + yang dibutuhkan P8; daftarkan di migration contract test + verify script.
- Hapus akun: implementasi fase ini cukup soft-delete + tenggang 30 hari + pencabutan semua consent aktif; penghapusan permanen terjadwal boleh berupa job stub dengan TODO yang jelas — katakan jujur di handoff bahwa itu stub.
- Bahasa Indonesia, commit pola repo (`fix(documents): lima rak dan pembersihan kartu sumber data (0032)`), satu commit per patch atau per kelompok kecil. Jangan menyatakan lulus tanpa menjalankan.

Mulai dari Langkah 0.
