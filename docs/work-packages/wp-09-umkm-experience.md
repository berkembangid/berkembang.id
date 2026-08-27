# WP-09 — Pengalaman UMKM

## Navigasi

Menu utama disederhanakan menjadi:

1. Beranda
2. Catat
3. Laporan
4. Perjalanan
5. Dokumen
6. Profil

Notifikasi berada di header. Halaman contoh Aktivitas dan AI Copilot tidak lagi menampilkan data buatan dan diarahkan ke beranda yang memakai aktivitas nyata.

## Beranda

Urutan beranda mengikuti kebutuhan harian UMKM: tombol catat, ringkasan hari ini, satu misi utama, Kesiapan Data Usaha beserta alasan perubahan, hal yang perlu ditindaklanjuti, dan aktivitas terbaru. Semua bagian berasal dari transaksi, dokumen, catatan suara, permintaan akses, atau snapshot kesiapan.

## Onboarding dan pencatatan

- Pendaftaran dimulai dari akun dan persetujuan, dilanjutkan nama/bidang/lokasi usaha.
- NIB, NPWP, omzet, dan jumlah pegawai tidak diwajibkan saat daftar.
- Akun UMKM tanpa transaksi diarahkan ke transaksi pertama.
- Pencatatan suara memiliki keadaan siap, merekam, mengunggah, membaca, perlu diperiksa, menyimpan, berhasil, dan gagal.
- Kegagalan membaca tidak menghapus draft; pengguna dapat melanjutkan sebagai tulisan.

## Aksesibilitas

Menu memiliki penanda halaman aktif, status proses diumumkan dengan `aria-live`, modal memiliki semantik dialog, Escape, fokus awal, dan perangkap fokus. Target sentuh utama dibuat cukup besar dan aturan `prefers-reduced-motion` global tetap berlaku.

## Verifikasi

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
npm.cmd run test:e2e:smoke
```

Seluruh perintah lulus. Lint tidak memiliki error; warning lama pada area admin dan komponen lama masih tercatat untuk paket observability/cleanup berikutnya.
