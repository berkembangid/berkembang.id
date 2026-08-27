# WP-08 — Kesiapan Data Usaha dan Misi

## Hasil

Nilai Kesiapan Data Usaha sekarang dihitung di server dari transaksi, profil, dan dokumen yang benar-benar tersedia. Setiap hasil disimpan sebagai snapshot tetap yang menunjuk versi aturan `wp08-pilot-v1`.

- Data yang belum tersedia ditampilkan sebagai **Data belum cukup**, bukan nilai nol.
- Setiap bagian menjelaskan bukti, jumlah bukti, mutu data, dan langkah berikutnya.
- Tujuh misi selesai otomatis berdasarkan bukti; pengguna tidak dapat menandainya selesai secara manual.
- Beranda, Perjalanan, dan halaman rincian membaca sumber nilai yang sama.
- Nilai bukan penilaian regulator dan bukan jaminan pembiayaan.

Migrasi `0022_readiness_mission_engine.sql` sudah diterapkan pada Supabase tertaut dan aturan serta tujuh misi telah diperiksa aktif.

## Pemeriksaan

Pengujian database memastikan snapshot tidak digandakan ketika bukti tidak berubah, NIB yang tidak aktif tetap dianggap belum cukup, dan misi hanya selesai setelah bukti tersedia.
