# Menyiapkan masuk dan daftar dengan Google

Untuk lokal dan produksi. Proyek Supabase: `ggudmwfhaqoqcguwgdac`.

## Hal pertama yang sering disalahpahami

**Client ID dan Client Secret Google TIDAK masuk ke `.env`.**

Aplikasi ini tidak pernah berbicara langsung dengan Google. Yang berbicara
dengan Google adalah Supabase; aplikasi hanya meminta Supabase memulainya.
Karena itu kredensialnya disimpan di dasbor Supabase, dan `.env` tidak perlu
ditambah satu baris pun.

Alurnya:

```
Peramban  --(1)-->  Supabase  --(2)-->  Google
                                          |
                                        (3) setuju
                                          |
          <--(5)--  Supabase  <--(4)------+
             |
             v
  /auth/callback  --(6)-->  tukar kode jadi sesi  -->  /auth/continue
```

Yang didaftarkan di Google Cloud adalah alamat pada langkah (4), yaitu milik
**Supabase** — bukan `localhost:3000` dan bukan domain produksi Anda:

```
https://ggudmwfhaqoqcguwgdac.supabase.co/auth/v1/callback
```

Alamat itu **sama untuk lokal dan produksi**. Hanya perlu didaftarkan sekali.

Yang berbeda antara lokal dan produksi adalah langkah (5): ke mana Supabase
mengembalikan orang sesudahnya. Itu diatur di sisi Supabase, bukan Google.

## Bagian A — sekali saja, di Google Cloud

1. Buka [console.cloud.google.com](https://console.cloud.google.com), pilih atau
   buat proyek.
2. **APIs & Services → OAuth consent screen**. Pilih **External**, isi nama
   aplikasi (`Berkembang.id`), surel dukungan, dan surel pengembang. Simpan.
   - Selama status masih **Testing**, hanya akun yang Anda daftarkan di
     **Test users** yang bisa masuk. Untuk mencoba, tambahkan surel Anda
     sendiri di sana. Terbitkan (**Publish app**) ketika sudah siap dipakai
     umum.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - **Application type**: Web application
   - **Name**: bebas, misalnya `Berkembang.id — Supabase`
   - **Authorized redirect URIs** → **Add URI**:
     ```
     https://ggudmwfhaqoqcguwgdac.supabase.co/auth/v1/callback
     ```
     Persis begitu. Tanpa garis miring di ujung, tanpa spasi.
   - **Authorized JavaScript origins** boleh dibiarkan kosong: alur ini
     berjalan lewat pengalihan halaman, bukan dari JavaScript di peramban.
4. Salin **Client ID** dan **Client secret**.

## Bagian B — sekali saja, di Supabase

**Dashboard → Authentication → Sign In / Providers → Google**

1. Nyalakan **Enable Sign in with Google**.
2. Tempel **Client ID** dan **Client Secret** dari Bagian A.
3. Simpan.

Sampai langkah ini selesai, tombolnya tetap ada di aplikasi dan menjelaskan
dirinya sendiri: *"Masuk dengan Google belum diaktifkan pada aplikasi ini."*

## Bagian C — alamat yang boleh dituju

Supabase menolak mengembalikan sesi ke alamat yang tidak ada di daftar izin.
Tanpa daftar itu, siapa pun bisa memulai alur masuk yang mengembalikan sesi ke
alamatnya sendiri — jadi penolakannya memang benar, dan daftarnya harus diisi.

### Lokal

Sudah terpasang pada 6 September 2026:

```
node scripts/setup-oauth-urls.mjs
```

Hasilnya `http://localhost:3000/**` masuk daftar izin, dan `site_url`
dibiarkan apa adanya.

### Produksi

Setelah domainnya ada:

```
node scripts/setup-oauth-urls.mjs https://domain-anda.com
```

Perintah itu menambahkan `https://domain-anda.com/**` ke daftar izin **tanpa
menghapus yang sudah ada**, lalu memindahkan `site_url` ke domain produksi.

`site_url` bukan hal yang sama dengan daftar izin. Ia alamat bawaan ketika
aplikasi tidak meminta tujuan tertentu, dan ia juga yang mengisi
`{{ .SiteURL }}` di dalam surel. **Selama ia masih menunjuk ke
`http://localhost:3000`, setiap tautan di surel yang diterima pengguna
sungguhan menuju komputer mereka sendiri.**

Alamat produksi tidak ditebak oleh skrip mana pun di sini. Ia tidak tercatat di
repo, dan mengarangnya berarti mengirim orang ke tempat yang salah.

## Bagian D — tidak ada yang perlu diubah di aplikasi

Tombolnya sudah terpasang di halaman masuk dan halaman daftar, dan
`app/auth/callback/route.ts` sudah menukar kodenya menjadi sesi di sisi server
supaya kukinya `httpOnly`.

Alamat kembalinya dihitung dari `window.location.origin`, jadi **satu kode yang
sama bekerja di localhost maupun di produksi** tanpa variabel lingkungan
tambahan.

Satu hal yang tidak dimiliki pendaftaran lewat surel: akun Google tidak membawa
metadata pendaftaran, jadi sistem tidak tahu ini pemilik usaha atau lembaga.
Menebaknya berarti separuh akun lembaga lahir sebagai usaha. Akun Google baru
karena itu diantar sekali ke `/auth/lengkapi` untuk menjawabnya sendiri; akun
yang sudah punya usaha langsung masuk tanpa ditanya apa pun.

## Menguji

1. Jalankan `npm run dev`.
2. Buka `http://localhost:3000/auth/login`, tekan **Masuk dengan Google**.
3. Pilih akun yang terdaftar sebagai **Test user** (jika consent screen masih
   berstatus Testing).
4. Yang seharusnya terjadi: kembali ke `/auth/callback`, lalu ke
   `/auth/lengkapi` untuk akun baru, atau langsung ke portal untuk akun lama.

Periksa keadaan konfigurasinya kapan saja:

```
node scripts/supabase-auth-config.mjs
```

## Bila gagal

| Yang terlihat | Sebab yang paling mungkin |
| --- | --- |
| `redirect_uri_mismatch` dari Google | Alamat di **Authorized redirect URIs** tidak persis sama. Periksa garis miring di ujung dan salah ketik. |
| Kembali ke `/auth/login?error=oauth_gagal` | Kode gagal ditukar menjadi sesi. Biasanya alamat kembali belum ada di daftar izin — jalankan Bagian C. |
| "Masuk dengan Google belum diaktifkan" | Bagian B belum selesai. |
| Google menolak dengan "app not verified" | Consent screen masih Testing dan akun itu bukan Test user. |
| Setelah menyetujui, mendarat di localhost padahal membuka dari produksi | `site_url` masih localhost. Jalankan Bagian C dengan alamat produksi. |

## Yang tidak dicakup panduan ini

Masuk dengan Google **tidak** membutuhkan SMTP dan tidak terpengaruh oleh batas
pengiriman surel — akun Google sudah terverifikasi oleh Google. Verifikasi surel
untuk pendaftaran biasa adalah urusan terpisah; lihat
`docs/HANDOVER_AUTENTIKASI_2026-09-06.md`.
