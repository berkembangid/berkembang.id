# Serah terima — Patch Dokumen & Profil (D-P)

Migrasi `0045`–`0046`. Gerbang hijau: `typecheck`, `lint` (0 galat, 40 peringatan
lama), `lint:terms`, `test` 622, `test:integration` 87, `build`, `db:test`
`0001`–`0046` fresh + replay, `db:types:check`, `check:voice-bundle`.

## Selesai

- **P1/P2** Kartu "Laporan Keuangan" dan "Riwayat QRIS" dibubarkan; berkas yang
  telanjur diunggah dipindah ke rak alat & perjanjian, tidak dihapus.
- **P3** Halaman Dokumen menjadi lima rak, urut sesuai perjalanan pemilik.
- **P4** Kartu Akta Pendirian hanya untuk badan usaha; penghitung ikut menyusut.
- **P5** Wajib/disarankan dibaca dari `document_requirements`; lencana merah
  "Wajib" menjadi "Fondasi" amber.
- **P6** Unggah kamera-dulu, galeri kedua; kompresi klien D-A dipakai di semua
  unggahan gambar halaman ini.
- **P7** Kartu izin menampilkan nomor, masa berlaku, dan tingkat keyakinan.
- **P8** Kolom ketik NIB dihapus; blok "Ringkasan legalitas" read-only. Nomor
  lama dimigrasikan menjadi dokumen tanpa berkas.
- **P9** Profil empat blok, kolom baru (bentuk usaha, tahun mulai, jumlah orang
  bekerja, kanal penjualan), "Akun Terverifikasi" → "Email terverifikasi",
  ekspor ZIP, dan hapus akun dua langkah.
- **P10** Pemetaan sektor eksplisit dengan uji dan fallback bersuara.
- **P11** "17/100" → "Perunggu — 3 dari 7 fondasi lengkap"; kamus lint dapat
  kategori baru untuk teks yang benar-benar dibaca pemilik.

## Pemetaan sektor final

| Pilihan profil | Sektor template | Alasan |
|---|---|---|
| Kuliner | `PERDAGANGAN_KULINER` | template pangan olahan memang untuk mereka |
| Fashion | `PERDAGANGAN_KULINER` | menjual barang jadi, punya persediaan |
| Pertanian | `PERDAGANGAN_KULINER` | menjual hasil panen, punya persediaan |
| Kerajinan | `PERDAGANGAN_KULINER` | beli bahan lalu jual barang jadi |
| Jasa | `JASA` | tidak punya persediaan barang dagangan |
| Teknologi | `JASA` | jasa pengembangan, desain, perbaikan |
| Lainnya | *(sengaja kosong)* | kita memang tidak tahu usahanya; jatuh ke template dasar **sambil mencatat peringatan** |

## Keputusan yang saya ambil sendiri

1. **Nomor migrasi `0045`/`0046`**, bukan `0032` seperti prompt — repo sudah di
   `0044`.
2. **ZIP ditulis sendiri**, tanpa dependensi baru. Ekspor berjalan di server,
   jadi ukuran bundel bukan soal; yang jadi soal adalah menambah kode asing ke
   jalur yang memegang KTP, jurnal, dan nomor izin sekaligus.
3. **Kamus lint dapat kategori "teks yang dibaca pemilik"**, bukan menambah
   `score` ke daftar biasa. Kata itu juga nama variabel, kelas CSS, dan potongan
   URL yang sah; melarangnya di seluruh berkas hanya akan membuat orang
   menaburkan penanda pengecualian sampai lint ini berhenti berarti.
4. **Kolom profil ditulis langsung dari peramban**, tanpa RPC — `0013` memang
   memberi `grant insert, update` dengan policy pada `profiles`. Ini pengecualian
   sah dari pola tabel akuntansi, bukan kelalaian.
5. **Cincin di Beranda menampilkan "3/7"**, bukan angka dari seratus. Itu
   pekerjaan yang bisa diselesaikan; "17" hanya sebuah nilai.

## Yang harus diketahui penerus

**Klaim bukanlah bukti.** P8 memindahkan nomor NIB ketikan menjadi baris
dokumen. Mesin kesiapan menghitung BARIS dokumen NIB, dan itu aman selama baris
dokumen hanya lahir ketika berkasnya selesai diunggah. Begitu nomor ketikan
menjadi baris, mengetik nomor akan menaikkan tingkat kesiapan tanpa satu berkas
pun ada. `0045` menutupnya di berkas yang sama: `recalculate_my_readiness` kini
hanya menghitung dokumen yang punya `storage_path`. **Jangan lepas syarat itu.**

**Penghapusan permanen adalah stub.** `private.purge_deleted_accounts()`
mengembalikan `implemented: false` dan tidak menghapus apa pun. Tidak ada
penjadwal di repo ini sama sekali (bukan pg_cron, bukan vercel cron), jadi tidak
ada yang memanggilnya. Data pengguna yang meminta hapus **masih ada** setelah 30
hari. Yang benar-benar berhenti seketika adalah izin akses institusinya.

**E2E belum pernah dijalankan.** `tests/e2e/lemari-lima-rak.spec.ts` (7 skenario)
dan `tests/e2e/lemari-dokumen.spec.ts` (4 skenario) sudah ditulis dan terdaftar,
tetapi lingkungan ini tidak punya `E2E_EMAIL`/`E2E_PASSWORD`. Keduanya menulis
data sungguhan; siapkan akun uji terpisah, bukan akun demo presentasi.

**Belum dikerjakan:** D-B (mesin pengingat masa berlaku), D-C (OCR nota, tingkat
`attested`, layar pemilah `needs_class_review`), impor/rekonsiliasi QRIS, dan
blok legalitas di dossier institusi.
