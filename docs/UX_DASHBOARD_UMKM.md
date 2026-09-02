# UX dashboard UMKM

Dokumen ini menjaga keputusan UI tetap konsisten ketika fitur baru ditambahkan.

## Atomic design

- **Atoms:** IconBadge, StatusBadge, serta primitive di components/ui.
- **Molecules:** PageHeader, MetricCard, FeedbackBanner, dan EmptyState.
- **Organisms:** ComparisonBarChart dan blok fitur yang menggabungkan beberapa molecule.
- **Templates:** DashboardPage, DashboardPanel, dan PanelHeader.
- **Pages:** route di app/(umkm)/umkm.

Komponen baru harus menggunakan lapisan terkecil yang sudah tersedia sebelum membuat variasi baru.

## Sepuluh usability heuristics

1. **Visibility of system status:** proses memuat, merekam, menyimpan, mengunggah, berhasil, dan gagal memakai teks eksplisit serta aria-live bila berubah otomatis.
2. **Match with the real world:** istilah utama memakai bahasa pemilik usaha: uang masuk, uang keluar, buku kas, catatan, dan tutup kas.
3. **User control and freedom:** dialog dapat ditutup, transaksi dapat diperiksa sebelum disimpan, perubahan meminta alasan, dan pembatalan mempertahankan riwayat.
4. **Consistency and standards:** struktur halaman, palet, radius, hierarki teks, tombol, focus ring, status, dan navigasi berasal dari komponen dashboard bersama.
5. **Error prevention:** input memakai batas nominal/tanggal, transaksi hasil suara harus diperiksa, tutup kas mengunci pengeditan, dan aksi destruktif meminta alasan atau konfirmasi.
6. **Recognition rather than recall:** navigasi selalu terlihat, active state ditandai, aksi utama memakai ikon dan kata kerja, serta panduan menghubungkan tujuan pengguna ke fitur yang tepat.
7. **Flexibility and efficiency:** aksi sering dipakai tersedia di kartu utama mobile dan header desktop; seluruh kontrol dapat digunakan dengan keyboard.
8. **Aesthetic and minimalist design:** setiap panel punya satu tujuan, dekorasi dibatasi, grafik hanya hadir saat ada data, dan merah hanya untuk kegagalan atau aksi destruktif.
9. **Help users recover from errors:** pesan menjelaskan apa yang gagal dan menyediakan tindakan seperti coba lagi, unggah pengganti, atau periksa kembali.
10. **Help and documentation:** halaman Panduan Usaha mengarahkan pengguna berdasarkan tujuan tanpa menjanjikan kemampuan AI yang tidak tersedia.

## UX writing

- Gunakan sentence case: “Simpan perubahan”, bukan “Simpan Perubahan”.
- Mulai tombol dengan kata kerja yang jelas.
- Jelaskan hasil tindakan sebelum risiko, terutama untuk tutup kas dan pembatalan.
- Hindari istilah teknis seperti storage, live, OCR, dan extraction pada teks utama.
- Empty state menjawab apa yang terjadi dan apa yang dapat dilakukan berikutnya.
- Jangan menyatakan kelayakan atau jaminan pembiayaan; nilai kesiapan hanya menjelaskan kelengkapan bukti.
