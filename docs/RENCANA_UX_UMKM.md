# Rencana perbaikan UI/UX portal /umkm

Disusun 23 September 2026 dari audit seluruh layar `app/(umkm)` beserta
komponen dan modul yang dipakainya. Urutan fase mengikuti dampak: angka salah
dan risiko data tertimpa lebih dulu, lalu fondasi tampilan, lalu perbaikan per
layar, lalu fitur baru.

## Fase 0 — Bug yang terlihat pengguna

| # | Masalah | Lokasi |
|---|---|---|
| 1 | "Hari ini" di Beranda memakai tanggal UTC; pukul 00:00–07:00 WIB menampilkan angka kemarin | `app/(umkm)/umkm/page.tsx` |
| 2 | Nilai bersih negatif di KPI desktop tampil "Rp-5.000" | `app/(umkm)/umkm/page.tsx` |
| 3 | Chip "Hari ini" aktif padahal Buku Kas menampilkan sebulan | `app/(umkm)/umkm/laporan/page.tsx` |
| 4 | Notifikasi membaca kolom lama, tanpa filter batal dan batas, dan mengaku realtime | `app/(umkm)/umkm/notifikasi/page.tsx` |
| 5 | Menunggu proses AI di Catat berputar tanpa akhir setelah batas waktu | `app/(umkm)/umkm/catat/page.tsx` |
| 6 | Layar sukses Catat tidak bisa ditinggalkan lewat menu Catat; tidak ada "Catat lagi" | `app/(umkm)/umkm/catat/page.tsx` |
| 7 | Alamat tidak disimpan ke `profiles.alamat`, jadi kembali ke nilai lama dan C2 tidak naik | `app/(umkm)/umkm/profil/page.tsx` |
| 8 | Form Profil bisa disimpan dengan nilai bawaan sebelum data termuat | `app/(umkm)/umkm/profil/page.tsx` |
| 9 | Metodologi berputar tanpa akhir kalau pemuatan gagal | `app/(umkm)/umkm/kesiapan/metodologi/page.tsx` |
| 10 | Aksi kesiapan D1 menuju `/umkm/laporan`, bukan Kondisi awal | `modules/readiness/level-copy.ts` |
| 11 | Dialog tutup kas selalu berkata "hari ini" dan menampilkan tanggal ISO mentah | `app/(umkm)/umkm/laporan/page.tsx` |

## Fase 1 — Fondasi tampilan dan konsistensi

- **Token warna.** Variabel `--umkm-*` di `umkm-shell.module.css` tidak dipakai;
  setiap berkas menulis hex sendiri (±90 di Catat, ±67 di Laporan). Buang sisa
  palet ungu muda lama (`#bac3ff`, `#f3f2ff`, `#d8dcff`) dan kelas Tailwind
  bawaan `slate`/`emerald`/`blue-600`. Samakan `public/manifest.json`.
- **Ukuran.** Tidak ada teks di bawah 12px (label menu bawah 11px). Target
  sentuh minimal 44px: ikon edit/hapus Catat, tombol baris Laporan, chip bank
  Rekening, tombol foto profil.
- **Dialog bersama.** TransactionDialog, ClosingDialog, dialog persetujuan
  unggah, dan dialog tinjau OCR memakai satu komponen dengan perangkap fokus,
  Esc, dan `aria-labelledby`.
- **Tanggal.** Satu `formatTanggal()` untuk semua tanggal yang kini tampil ISO.
- **Bahasa.** Seragam memakai "Anda" (kesiapan, rekening, dan Catat masih
  "kamu/-mu"). Terjemahkan "Edit Caption", "Proses Ulang AI", "Item
  Teridentifikasi". Perbaiki "perbaikinya".
- **Satu `<h1>` per halaman**, tanpa judul ganda header + PageHeader di mobile.
- **Aksesibilitas.** Label form dengan `htmlFor` (Profil, Rekening),
  `aria-pressed` pada chip, CitySelect sebagai combobox yang bisa dipakai
  dengan papan ketik, `role="progressbar"` pada bilah pilar, `aria-current`
  pada tangga tingkat, `aria-label` pada tombol mikrofon dan kamera.

### Status Fase 0 dan 1 (23 September 2026)

Fase 0 selesai. Fase 1 selesai dengan catatan:

- Palet `--umkm-*` di `app/globals.css`, dipakai lewat `text-umkm-ink` dan
  seterusnya. Cakupan: `app/(umkm)`, `components/warung`,
  `components/documents`, rekening, kesiapan, izin pemilik.
  `components/dashboard` belum ikut karena dipakai juga portal lembaga dan
  admin.
- `FormDialog` (`components/ui/dialog.tsx`) menggantikan empat dialog rakitan.
  Fokus, Esc, dan konfirmasi yang terbuka di atasnya sudah diuji dengan
  Playwright pada peramban yang menggambar. Panel peramban yang tersembunyi
  tidak menjalankan `requestAnimationFrame`, jadi uji fokus di sana selalu
  gagal walau kodenya benar.
- Ukuran huruf dinaikkan secara mekanis (teks ≥12px, label kapital ≥11px).
  Belum diperiksa per layar dengan sesi UMKM yang masuk.
- Belum: tombol di kotak `confirm()` masih memakai `--primary` nila global,
  sehingga di Ruang Usaha warnanya berbeda dari tombol lain.

## Fase 2 — Perbaikan UX per layar

**Navigasi.** Gabungkan `/umkm/kesiapan` ke `/umkm/perjalanan` (redirect).
Rekening menjadi tab keempat Profil. Hapus rute mati `aktivitas` dari tabel
judul.

**Beranda.** Mobile ikut menampilkan Kesiapan, undangan dinas, tawaran dinas,
dan angka "Keluar". Baris aktivitas dan "Perlu perhatian" menaut ke item yang
bersangkutan. Tombol "…" menjadi pilihan suara/foto/tulis. Kesiapan cukup
dimuat sekali.

**Catat.** Pecah berkas 1.254 baris (`VoiceRecorder`, `PhotoCapture`,
`ReviewList`, `ItemEditor`, `useCapturePolling`). Tombol batal saat merekam,
batas durasi, meter level sungguhan. Pakai `VoiceDraftCard` yang sudah jadi
tapi belum dipakai. Pakai `drafts`/`questions` dari API untuk input tulisan.
Kolom tanggal, cara bayar, dan "+ Tambah baris" di tinjauan. Form manual
terstruktur tanpa AI. Contoh kalimat hanya mengisi kotak teks. Teks proses
disesuaikan untuk foto.

**Laporan.** Satu sistem kategori (form manual mengirim `emkmCategoryCode`).
Buku Kas: pencarian, filter jenis/kategori/cara bayar/status, paginasi. Riwayat
perubahan transaksi. "Unduh data" hanya di tab Buku Kas, CSV dengan kolom
kategori dan pihak lawan. Penjelasan edit dimatikan setelah tutup kas.

**Profil & Dokumen.** Kelengkapan profil (C2) ditampilkan. Tombol Simpan
menempel di mobile dan peringatan perubahan belum disimpan. Pengaturan data &
izin dipindah ke atas atau tab sendiri. Kartu Dinas diperbarui setelah kota
disimpan. Input masa berlaku dokumen. Label "Terverifikasi" diganti. Dokumen
ditolak tidak dihitung di rak. Galat lemari tampil. Daftar arsip.

**Panduan.** Teks "Tanya apa saja" diganti sampai fitur tanya-jawab ada.

**Mode akuntan.** Paginasi jurnal (kini berhenti di 100), neraca saldo memakai
"dari" atau diberi keterangan, galat bukti tampil.

## Fase 3 — Fitur baru

1. **Pusat pemberitahuan UMKM.** Basis data sudah menulis `consent_notice`,
   `consent_decision`, `consent_revoked`/`consent_expired`,
   `dossier_pdf_download`, dan `dinas_broadcast`, tetapi portal UMKM tidak
   membacanya. Pakai ulang `modules/consent/notification-center.tsx` dan
   gabungkan dengan transaksi, catatan gagal, dan dokumen ditolak.
2. **"Siapa yang bisa melihat data saya".** Satu layar untuk semua kontrol
   berbagi. Pemilik bisa mencabut izin lembaga sendiri (API sudah ada), daftar
   program yang diikuti dan tombol keluar, log akses dengan nama lembaga, pesan
   galat gabung program per penyebab.
3. **Daftar periksa persiapan** di Beranda: Profil, Dokumen fondasi, Kondisi
   awal, Rekening, transaksi pertama.
4. **Piutang & utang per kontak**: buku kontak, tandai lunas, jatuh tempo,
   pengingat, pesan tagihan WhatsApp yang dikirim sendiri oleh pemilik.
5. **Pengingat dokumen kedaluwarsa** lewat `fn_pending_reminders`.
6. **Riwayat undangan dinas** dan peringatan sebelum membuka tautan luar.
7. **Tahan sinyal buruk**: service worker dan antrean kirim ulang rekaman/foto.
8. **Transaksi berulang** dan deteksi transaksi ganda.
9. **Foto nota aktif bawaan** setelah OCR stabil.
10. **Panduan tanya-jawab**: FAQ yang bisa dicari dulu; asisten AI hanya bila
    menjawab dari data pengguna sendiri.

## Urutan pengerjaan

1. Fase 0 dalam satu PR kecil.
2. Fase 1 (token dan Dialog) supaya Fase 2 tidak menambah hex baru.
3. Fase 3 #1 dan #2 — backend sudah ada.
4. Fase 2 mulai dari Catat dan Laporan.
5. Sisa Fase 3.
