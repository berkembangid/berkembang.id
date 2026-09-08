# Reset basis data produksi dan skema dasar

Tanggal: 5 September 2026 · Proyek Supabase: `ggudmwfhaqoqcguwgdac`

## Apa yang dilakukan

Enam puluh dua migrasi dipadatkan menjadi satu berkas skema dasar, dibuktikan
setara dengan hasil migrasi, lalu dipasang ke produksi yang sudah dikosongkan.

## Kenapa baseline dibangun dari basis data, bukan disalin tangan

Enam puluh dua migrasi menuliskan ulang fungsi yang sama sampai empat kali,
menambah kolom lalu membatasinya, dan menjatuhkan tanda tangan lama. Yang
berlaku hanya keadaan AKHIR-nya. Menyusunnya ulang dengan tangan berarti
menebak, dan satu tebakan yang meleset menghasilkan skema yang tampak benar
sampai sebuah kolom ternyata hilang di produksi.

Jadi `npm run db:baseline` memasang seluruh migrasi ke basis data lokal kosong,
lalu membaca hasilnya dengan `pg_dump`. Yang dihasilkan bukan pendapat tentang
skemanya — ia salinan skemanya.

## Perintah

| Perintah | Kegunaan |
| --- | --- |
| `npm run db:baseline` | Membangun ulang `supabase/baseline/0001_baseline_schema.sql` |
| `npm run db:baseline:verify` | Membuktikan baseline setara dengan hasil migrasi |
| `BASELINE=1 npm run db:test` | Menjalankan seluruh skenario perilaku di atas baseline |

Ketiganya menolak berjalan di luar `localhost` dan di luar basis data `*_test`.

## Bukti kesetaraan

```
Skema dasar setara dengan hasil 62 migrasi.
  8424 baris definisi dibandingkan.
  2 baris berbeda HANYA pada tanda kurung berlebih yang dinormalkan
  Postgres saat membaca ulang definisinya; klausa, operator, dan nilainya identik.
```

Perbandingan dump saja tidak cukup — ia hanya melihat `public` dan `private`.
Yang menemukan sisanya adalah menjalankan seluruh skenario perilaku di atas
baseline. Empat hal lolos dari perbandingan dump dan hanya ketahuan di sana:

1. **Bucket penyimpanan dan kebijakannya** hidup di skema `storage`, yang
   dikecualikan dari dump. Tanpa itu tidak ada satu dokumen pun yang bisa
   diunggah.
2. **Hak akses atas skema `storage`** — kebijakan RLS tanpa `grant` tidak
   menghasilkan apa-apa.
3. **`pg_dump` menuliskan `SET row_security = off`** di kepala berkas. Itu
   setelan sesi miliknya sendiri, dan `SET` tanpa `LOCAL` berlaku sampai
   koneksinya ditutup. Sesi yang memasang baseline lalu bekerja sebagai
   `authenticated` ditolak dengan « query would be affected by row-level
   security policy » — galat yang tidak menyebut penyebabnya sama sekali.
4. **`public.chart_of_accounts` tidak pernah ada**; namanya `coa_accounts`.
   `pg_dump` mengabaikan pola tabel yang tidak cocok tanpa bersuara, jadi 28
   baris bagan akun hilang diam-diam. Sekarang dipakai `--strict-names`.

## Temuan yang berlaku juga untuk migrasi: `0062`

`0013` memberi hak akses secara borongan:

```sql
grant select on all tables in schema public to authenticated;
grant all    on all tables in schema public to service_role;
```

`all tables` berarti "semua tabel yang ada detik ini" — bukan aturan yang
berlaku terus. **Dua puluh lima tabel yang dibuat `0014` sampai `0061` tidak
pernah menerimanya.**

Ini tidak pernah ketahuan karena uji migrasi memasang seluruh migrasi **dua
kali** untuk membuktikan pemasangan ulang aman. Pada pemasangan kedua, baris
borongan `0013` berjalan lagi — dan kali ini seluruh tabel sudah ada. Basis
data uji selalu lengkap; basis data yang dipasang sekali jalan, yaitu produksi,
tidak.

Yang rusak karenanya nyata: `app/api/v1/institution/dossiers/route.ts` dan
`modules/consent/consent-repository.ts` membaca `public.discovery_optins`
langsung, dan `lib/auth/bootstrap.ts` menulis ke `profiles`, `businesses`,
`institutions`, dan `institution_members` sebagai `service_role`.

Daftar di `0062` tidak disusun dengan tangan: ia selisih yang dihitung dengan
memasang migrasi sekali dan dua kali ke dua basis data terpisah, lalu
membandingkan `pg_class.relacl` keduanya. Pencabutan yang disengaja — `0023`
atas `dossier_items`, `0047` atas `readiness_daily` dan
`business_readiness_state` — tidak diusik. `alter default privileges` di
bagian akhir menutup lubangnya untuk tabel yang belum ditulis.

## Skema dasar sengaja tidak idempoten

Ia salinan `pg_dump`, yang menulis `create table` polos — bukan `if not
exists`. Membuatnya idempoten berarti menyunting 14 ribu baris hasil dump
dengan tangan, dan berkas yang setengah disunting lebih berbahaya daripada
berkas yang jujur menolak.

Jadi ia menolak, di baris pertama, dengan `BASELINE_SCHEMA_ALREADY_APPLIED`
bila `public.businesses` sudah ada. Perubahan berikutnya ditulis sebagai
migrasi baru di `supabase/migrations/`, lalu baseline dibangun ulang.

## Keadaan produksi setelah reset

Dibuang: seluruh skema `public` dan `private` beserta **570 baris** di 39
tabel. Cadangannya ada di
`test-results/produksi-cadangan/public-sebelum-reset.json`.

Dipertahankan: `auth.users` (19 akun — semua orang masih bisa masuk, dan
`lib/auth/bootstrap.ts` membuat ulang profilnya saat login berikutnya),
ekstensi, dan berkas di penyimpanan.

Hasil pemasangan: 60 tabel · 135 fungsi · 97 kebijakan RLS · 0 tabel tanpa RLS
· 28 baris bagan akun · 38 template kategori · 3 bucket.

`supabase_migrations.schema_migrations` dikosongkan dan diisi satu baris
`20260905000000 baseline_schema_dari_0001_sampai_0062`.

## Tiga hal yang menunggu keputusan Anda

1. **`platform_admins` kosong.** Dua baris hilang bersama yang lain, jadi
   sekarang tidak ada yang berstatus admin platform. Kedua `user_id`-nya
   masih hidup di `auth.users` dan tercatat di berkas cadangan; satu `insert`
   mengembalikannya. Saya tidak melakukannya sendiri karena Anda meminta
   semuanya dihapus.
2. **Sembilan berkas di penyimpanan masih ada.** Supabase menolak penghapusan
   langsung dari `storage.objects` — penjaga yang benar, supaya berkasnya
   tidak menjadi yatim. Pemiliknya sudah tidak ada, jadi berkas itu tidak
   terjangkau siapa pun. Menghapusnya perlu Storage API atau dasbor.
3. **Tiga kebijakan storage bawaan dasbor** (`Public Avatars Access`,
   `Authenticated Upload Avatars`, `Authenticated Update Avatars`) tidak
   dibuat migrasi kita dan tetap ada. Ketiganya hanya menyentuh bucket
   `avatars`, yang memang publik.

## Yang belum diuji

Berkas spesifikasi E2E Playwright (`lemari-dokumen`, `lemari-lima-rak`,
`tingkat-kesiapan`, `mobile-layout`, `voice-typed-capture`, `beranda-d0`) sudah
ditulis tetapi belum pernah dijalankan — belum ada `E2E_EMAIL` dan
`E2E_PASSWORD`.
