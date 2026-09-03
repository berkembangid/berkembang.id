# Catatan pengembangan — hal yang terlihat seperti bug tapi bukan

Berkas ini ada supaya orang berikutnya tidak menghabiskan satu jam mengejar
sesuatu yang sudah pernah ditelusuri sampai tuntas.

## Peringatan hidrasi berisi `bis_skin_checked`

**Gejalanya.** Konsol mode dev menampilkan berulang kali:

> A tree hydrated but some attributes of the server rendered HTML didn't match
> the client properties.

Di dalam diff-nya, setiap baris yang ditandai `-` berbunyi
`bis_skin_checked="1"`. Kadang disertai
`unhandledRejection: TypeError: Cannot read properties of undefined (reading 'M_ID')`
dengan jejak yang dimulai dari `chrome-extension://…`.

**Sebabnya bukan kode ini.** `bis_skin_checked` disuntikkan sebuah ekstensi
peramban ke hampir setiap `<div>` sebelum React sempat melakukan hidrasi.
React membandingkan HTML dari server dengan DOM yang sudah disunting ekstensi,
menemukan atribut asing, dan melaporkannya. Galat `M_ID` datang dari berkas
ekstensi itu sendiri — alamatnya `chrome-extension://`, bukan berkas kita.

**Sudah dibuktikan.** Keempat halaman publik dijalankan pada Chromium bersih
tanpa ekstensi (Playwright), sambil menangkap setiap pesan konsol dan galat
halaman:

| Halaman | Temuan |
|---|---|
| `/` | 0 |
| `/terms` | 0 |
| `/auth/login` | 0 |
| `/auth/register` | 0 |

**Kenapa `suppressHydrationWarning` tidak menyelesaikannya.** Penanda itu
hanya berlaku satu tingkat: pada elemen tempat ia dipasang, bukan pada
keturunannya. Ia sudah terpasang di `<html>` dan `<body>` (`app/layout.tsx`),
dan tetap tidak menutup ratusan `<div>` yang disentuh ekstensi. Memasangnya di
setiap `<div>` berarti mematikan penjaga yang suatu saat menangkap
ketidakcocokan sungguhan — pernah terjadi: "Invalid time value" di Beranda
tertangkap justru oleh mekanisme ini.

**Cara menghilangkannya dari konsol Anda.** Ubah perambannya, bukan kodenya:

1. Buka `chrome://extensions/?id=eppiocemhmnlbhjplcgkofciiegomcon` untuk
   melihat ekstensi mana yang melakukannya.
2. Pada **Site access**, pilih *On click* — atau kecualikan `localhost`.
3. Atau: pakai profil peramban terpisah tanpa ekstensi untuk pengembangan,
   atau buka aplikasinya di jendela Samaran.

Peringatan ini hanya ada di mode dev, dan pengguna yang tidak memakai ekstensi
itu tidak pernah melihatnya.

## Peringatan Next yang MEMANG milik kita

Satu-satunya yang pernah muncul di log dan benar-benar perlu diperbaiki:

> Detected `scroll-behavior: smooth` on the `<html>` element.

Sudah diperbaiki dengan `data-scroll-behavior="smooth"` di `app/layout.tsx`.
Tanpa penanda itu, perpindahan rute ikut dianimasikan dan halaman baru
terlihat menggulir dari posisi halaman sebelumnya.

## Cara membedakan sendiri lain kali

Baca baris `-` di dalam diff-nya. Kalau **semuanya** atribut yang tidak pernah
Anda tulis (`bis_skin_checked`, `data-gr-`, `spellcheck` yang tiba-tiba ada,
`__processed_...`), itu ekstensi. Kalau ada `href`, `title`, `className`, atau
teks yang memang berasal dari kode kita, itu bug kita — dan biasanya
penyebabnya `new Date()`, `Math.random()`, atau `localStorage` yang dipanggil
saat render.
