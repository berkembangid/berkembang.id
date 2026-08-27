# WP-07 — Buku Kas, Laporan, dan Tutup Kas Harian

## Hasil

Halaman **Buku Kas & Laporan** sekarang memakai data transaksi yang tersimpan dan sudah dikonfirmasi. Transaksi yang dibatalkan tetap terlihat sebagai riwayat, tetapi tidak dihitung dalam pemasukan, pengeluaran, selisih, atau grafik.

Fitur yang tersedia:

- pencatatan pemasukan dan pengeluaran manual;
- kategori yang mudah dipilih sesuai jenis transaksi;
- laporan hari ini, 7 hari terakhir, bulan ini, atau tanggal pilihan;
- ringkasan pemasukan, pengeluaran, selisih, dan hari aktif;
- pembagian nilai transaksi berdasarkan kategori dan cara pembayaran;
- perbaikan transaksi sebelum kas pada tanggal tersebut ditutup, dengan alasan perubahan;
- pembatalan tanpa menghapus riwayat, termasuk setelah tutup kas;
- tutup kas harian dengan uang kas awal, uang fisik, dan catatan yang semuanya opsional;
- unduhan CSV yang aman dibuka di aplikasi spreadsheet.

## Aturan data

- Nominal disimpan sebagai rupiah bulat agar total tidak berubah karena pembulatan pecahan.
- Batas hari memakai waktu Asia/Jakarta.
- Setelah kas suatu tanggal ditutup, transaksi tanggal itu tidak bisa diedit. Pengguna masih dapat membatalkannya dengan menulis alasan.
- Penghapusan permanen dari aplikasi tidak tersedia.
- Setiap pembuatan, perubahan, dan pembatalan memiliki catatan pelaku, waktu, alasan, serta ringkasan sebelum/sesudah.
- Jika uang kas awal atau uang fisik tidak diisi, sistem tidak menampilkan saldo perkiraan atau selisih buatan.

## Cara menjalankan

Setelah migrasi `0021_ledger_report_daily_closing.sql` sudah dikirim ke Supabase:

```powershell
npm.cmd install
npm.cmd run dev
```

Buka `http://localhost:3000`, masuk sebagai pemilik UMKM, lalu pilih menu **Laporan**.

Untuk pemeriksaan sebelum demo:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

## Skenario pemeriksaan manual

1. Catat satu pemasukan dan satu pengeluaran untuk hari ini.
2. Pastikan ringkasan dan grafik berubah sesuai nominal sebenarnya.
3. Ubah salah satu transaksi dan isi alasan perubahan.
4. Unduh CSV dan periksa isi transaksi serta totalnya.
5. Pilih **Tutup kas hari ini**. Form boleh disimpan tanpa menghitung uang fisik.
6. Pastikan tombol ubah pada transaksi hari ini terkunci.
7. Batalkan satu transaksi dengan alasan. Pastikan catatan tetap terlihat sebagai **Dibatalkan**, tetapi total laporan berkurang sesuai nominalnya.

## Verifikasi otomatis

Pengujian database menerapkan seluruh migrasi dari database kosong dan menjalankannya ulang. Pengujian juga memeriksa pembuatan yang tidak menggandakan transaksi, riwayat edit, penolakan edit setelah tutup kas, pembatalan setelah tutup kas, pengecualian transaksi batal dari total, serta larangan hapus langsung.
