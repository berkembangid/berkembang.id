# Lupa kata sandi, masuk dengan Google, verifikasi surel

Tanggal: 6 September 2026

## Keadaan sebelum ini

Sekali baca konfigurasi proyek sudah menjelaskan kenapa ketiga hal ini belum
ada, dan satu di antaranya mengejutkan:

| Yang dibaca | Nilainya | Artinya |
| --- | --- | --- |
| `mailer_autoconfirm` | `true` | **Alamat surel tidak pernah diverifikasi.** Siapa pun bisa mendaftar dengan alamat milik orang lain. |
| `smtp_host` | kosong | Memakai pengirim bawaan Supabase: **2 surel per jam**, dan hanya ke anggota tim proyek. |
| `external_google_enabled` | `false` | Tidak ada kredensial OAuth. |
| `mailer_otp_length` | `8` | |
| `password_min_length` | `6` | Antarmuka menjanjikan minimal 8; server menerima 6. Janji yang tidak ditegakkan. **Sudah diperbaiki menjadi 8.** |

## Yang sudah dibangun

### Verifikasi surel dengan kode

Pendaftaran mendapat satu langkah baru di ujungnya, dan ikut terhitung di
penunjuk langkah — langkah yang tidak muncul di penunjuk terasa seperti
hambatan yang tidak dijanjikan.

Kode dipakai, bukan tautan konfirmasi. Tautan mengharuskan surel dibuka di
peramban yang sama; kode bisa dibaca di ponsel lalu diketik di komputer.

Layar kodenya (`components/auth/OtpInput.tsx`) dipakai bersama halaman lupa
kata sandi: satu kotak per angka, menempel kode penuh mengisi seluruhnya,
menghapus melompat mundur sendiri, dan tombol kirim ulang menghitung mundur
60 detik karena Supabase menolak permintaan yang terlalu rapat.

**Jalur lama dipertahankan dengan sengaja.** Selama `mailer_autoconfirm` masih
`true`, `signUp` mengembalikan sesi dan pendaftaran langsung selesai seperti
sebelumnya. Tanpa itu, orang akan tertahan di layar kode yang tidak akan pernah
menerima apa pun.

### Lupa kata sandi

`app/auth/lupa-sandi/page.tsx` — tiga langkah pada satu layar, bukan tiga
halaman: alamat surel yang baru diketik harus tetap terlihat saat kode
dimasukkan.

Sesi yang lahir dari kode pemulihan **tidak** dipakai untuk masuk. Setelah kata
sandi baru tersimpan, sesinya ditutup dan orang diminta masuk sekali — supaya
ia tahu yang tersimpan memang yang ia ingat.

### Masuk dengan Google

`components/auth/GoogleButton.tsx` di halaman masuk dan daftar, dengan
`app/auth/callback/route.ts` menukar kode menjadi sesi **di server**, supaya
kukinya `httpOnly` dan tidak ditulis lewat JavaScript.

Satu hal yang tidak dimiliki pendaftaran lewat surel: akun Google tidak membawa
metadata pendaftaran, jadi `bootstrap` tidak tahu ini pemilik usaha atau
lembaga. Menebaknya berarti separuh akun lembaga lahir sebagai usaha. Jadi akun
baru diantar ke `/auth/lengkapi` untuk menjawabnya sendiri; akun yang sudah
punya usaha langsung masuk tanpa ditanya apa pun.

### Templat surel

Lima templat di `supabase/email-templates/`, dibangun dari satu kerangka di
`scripts/email-templates.mjs`. Disalin lima kali, satu perubahan warna merek
berarti lima suntingan dan satu berkas yang terlupa.

Tabel dan gaya sebaris, bukan CSS modern: Gmail membuang `<style>` di banyak
konteks dan Outlook memakai mesin render Word. **Tidak ada gambar, fon web,
maupun berkas eksternal** — setiap surel berdiri sendiri di bawah 3,2 KB, dan
itulah arti "tetap ringan" di sini. Sebuah uji menjaganya: berkas yang menyebut
`<img`, `<link`, `<script`, atau `url(` akan menggagalkannya.

| Templat | Ukuran |
| --- | --- |
| confirmation | 3,1 KB |
| recovery | 3,1 KB |
| magic_link | 2,9 KB |
| email_change | 2,7 KB |
| invite | 2,5 KB |

### Satu perbaikan yang ikut terbawa

`.field-input` hidup di dalam `style jsx` halaman pendaftaran, jadi terkurung
di sana: halaman lupa kata sandi yang memakai kelas yang sama tampil tanpa gaya
sama sekali. Aturannya pindah ke `app/globals.css`. Sebuah primitif yang
dipakai lebih dari satu layar tidak boleh tinggal di dalam salah satunya.

## Yang harus Anda lakukan — tiga langkah

### 1. Pasang SMTP sendiri — prasyarat, bukan saran

Percobaan mendorong templat pada 6 September ditolak Supabase:

> Email template modification is not available for free tier projects using the
> default email provider. Please upgrade your plan or configure a custom SMTP
> provider.

Jadi ini bukan sekadar soal batas kirim. **Selama masih memakai pengirim bawaan
di paket gratis, templat tidak bisa disunting sama sekali** — dan tanpa templat
berisi `{{ .Token }}`, tidak ada kode yang pernah sampai ke surel siapa pun.

Yang lebih berbahaya: mematikan `mailer_autoconfirm` tetap berhasil meski
templatnya ditolak. Pendaftaran akan mulai menuntut kode sementara pengirim
bawaan hanya melayani anggota tim proyek dan dibatasi 2 surel per jam —
pendaftaran tertutup untuk semua orang, tanpa satu pun galat yang menyebutkan
sebabnya. `scripts/push-email-templates.mjs` karena itu menolak menyalakan
verifikasi selama `smtp_host` masih kosong.

Isi SMTP di **Dashboard → Authentication → Emails → SMTP Settings**. Paket
gratis yang lazim untuk volume awal:

| Penyedia | Kuota gratis |
| --- | --- |
| Resend | 3.000 surel/bulan |
| Brevo | 300 surel/hari |
| Mailgun | 100 surel/hari |

Ketiganya menuntut verifikasi domain pengirim. Untuk mencoba lebih dulu, Resend
menyediakan domain uji yang hanya bisa mengirim ke alamat Anda sendiri.

Naikkan juga `rate_limit_email_sent` setelah SMTP terpasang; nilainya masih 2.

### 2. Dorong templat dan nyalakan verifikasi

```
node scripts/push-email-templates.mjs --push
```

Sesudah SMTP terisi, perintah ini mendorong kelima templat sekaligus menyetel
`mailer_autoconfirm` menjadi `false`, panjang kode 6 angka, dan masa berlaku
1 jam. Periksa hasilnya dengan `node scripts/supabase-auth-config.mjs`.

Akun lama yang sudah terkonfirmasi tidak terpengaruh.

**Sudah selesai:** `password_min_length` sudah dinaikkan dari 6 menjadi 8 —
setelan itu tidak bergantung pada surel, jadi skrip mendorongnya sendiri saat
menemukan SMTP masih kosong. Antarmuka yang menjanjikan minimal 8 karakter kini
benar-benar ditegakkan server.

### 3. Aktifkan Google

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
   ID** → tipe **Web application**.
2. Pada **Authorized redirect URIs**, isi:
   `https://ggudmwfhaqoqcguwgdac.supabase.co/auth/v1/callback`
3. Salin Client ID dan Client Secret ke **Dashboard → Authentication →
   Sign In / Providers → Google**, lalu aktifkan.
4. **Dashboard → Authentication → URL Configuration**: `Site URL` saat ini
   masih `http://localhost:3000` dan `Redirect URLs` kosong. Tambahkan alamat
   produksi beserta `/auth/callback`-nya, jika tidak, orang akan dikembalikan
   ke localhost setelah menyetujui di Google.

Sampai langkah ini selesai, tombolnya tetap ada dan menjelaskan dirinya:
"Masuk dengan Google belum diaktifkan pada aplikasi ini."

## Yang belum diuji dari ujung ke ujung

Alur kode sungguhan — daftar, terima surel, masukkan kode — belum pernah
dijalankan, karena mengirim surel membutuhkan langkah 1 dan 2 di atas. Yang
sudah diuji: seluruh logika kode (panjang, penempelan, penerjemahan galat),
tampilan ketiga layar pada 1440px dan 390px, hasil render kedua templat surel,
dan keberadaan setiap sambungan antar-layar.
