# WP-10 — Izin Akses dan Profil Usaha Terverifikasi

Status implementasi: selesai secara lokal, migrasi remote menunggu login Supabase yang memiliki akses proyek.

## Alur pengguna

1. Institusi membuka **Cari Usaha** dan hanya melihat kode kandidat, bidang usaha, wilayah umum, umur usaha, tingkat kesiapan, kebiasaan mencatat, dan jenis bukti yang tersedia.
2. Institusi menjelaskan tujuan, memilih bagian data, masa akses 1–30 hari, dan apakah perlu menyimpan ringkasan.
3. Pemilik UMKM menerima satu permintaan yang menjelaskan institusi, program, tujuan, bagian data, masa berlaku, dan permintaan penyimpanan.
4. Pemilik dapat menolak seluruh permintaan atau mengizinkan bagian data yang dipilih.
5. Persetujuan membuat salinan ringkas yang dibekukan pada saat persetujuan. Catatan transaksi satu per satu, alamat rinci, foto identitas, serta NIK/NPWP lengkap tidak masuk ke salinan ini.
6. Setiap pembukaan, pemeriksaan, penyimpanan, dan percobaan akses yang ditolak dicatat.
7. Pemilik dapat mencabut izin kapan saja. Akses juga berhenti otomatis saat masa berlaku selesai.

## Pengamanan utama

- Institusi harus berstatus aktif dan pengguna harus menjadi anggota aktif.
- Permintaan ganda yang masih menunggu dan izin ganda yang masih aktif dicegah di basis data.
- Persetujuan, penolakan, pembuatan profil, dan pencabutan hanya dapat dilakukan melalui fungsi basis data yang memeriksa pemilik.
- Institusi tidak dapat membaca isi profil langsung dari tabel; setiap bagian harus dibuka melalui pemeriksaan izin dan masa berlaku.
- Bagian data di luar persetujuan dan penyimpanan tanpa izin ditolak serta dicatat tanpa membocorkan isi data.
- Profil merupakan salinan beku, bukan tampilan langsung yang berubah tanpa sepengetahuan pemilik.

## Berkas utama

- `supabase/migrations/0023_consent_verified_business_profile.sql`
- `modules/consent/consent-schema.ts`
- `modules/consent/consent-repository.ts`
- `modules/consent/institution-candidates-page.tsx`
- `modules/consent/institution-profiles-page.tsx`
- `modules/consent/owner-consent-panel.tsx`
- `app/api/v1/candidates/route.ts`
- `app/api/v1/profile-access/**`

## Verifikasi

- Migrasi fresh apply dan replay: lulus.
- Skenario anonim → tolak/setujui → akses terbatas → pencabutan → audit: lulus.
- TypeScript: lulus.
- ESLint: 0 error; peringatan lama di luar WP-10 masih ada.
- Unit test: 90 lulus.
- Integration test: 14 lulus.
- Build produksi: lulus.
- Playwright smoke test Chromium: 1 lulus.

## Penerapan remote

CLI terakhir menerima HTTP 403 karena token login tidak memiliki hak pada proyek yang terhubung. Setelah masuk menggunakan akun pemilik/anggota proyek yang benar:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref ggudmwfhaqoqcguwgdac
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
```

Mode simulasi harus menampilkan hanya `0023_consent_verified_business_profile.sql` sebelum perintah terakhir dijalankan.
