# Satu akun, satu akses

Tanggal: 5 September 2026 · Migrasi: `0063_satu_akun_satu_akses.sql`

## Yang dihapus

Sisi UMKM punya empat tingkat peran — `owner`, `manager`, `staff`, `viewer` —
di kolom `business_members.role`. Tidak satu pun pernah dipakai.

Di produksi ada 17 usaha dan **nol** baris `business_members`. Akses selama ini
berjalan lewat jalur cadangan di dalam `private.business_role()`, yang membaca
`businesses.legacy_profile_id` bila tidak menemukan baris anggota. Tabel
keanggotaannya kosong sejak hari pertama, dan tidak ada satu layar pun yang
bisa mengisinya: nol kode aplikasi menyentuh `business_members`.

`manager` bahkan sudah menjadi nilai mati sebelum ini: ia ada di `CHECK` tetapi
kebijakan `business_members_insert` hanya mengizinkan `staff` dan `viewer`.

Aturan barunya satu kalimat: **sebuah usaha milik satu akun, dan akun itu bisa
melakukan segalanya atas usahanya.** Tidak ada tingkat di bawahnya.

## Bentuk barunya

| Lama | Baru |
| --- | --- |
| `private.business_role(uuid) returns text` | `private.business_access(uuid) returns boolean` |
| `private.has_any_business_role(text[])` | `private.has_any_business()` |
| `business_members.role`, `business_members.invited_by` | dibuang |
| `business_members_insert/update/delete` | dibuang — klien tidak bisa menulis sama sekali |

`private.accounting_business_access()` tetap ada dengan nama lamanya, meneruskan
ke `business_access()` ditambah admin platform. Ia dipakai delapan RPC pembukuan
dan tidak perlu ditulis ulang hari ini; ketika salah satunya disentuh lagi,
panggilannya dipindah dan nama itu bisa hilang.

Admin platform sengaja **tidak** ikut ke dalam `business_access()`. Ia tetap
ditulis terpisah di setiap kebijakan yang memang memberinya akses, supaya
kewenangannya persis seperti sebelumnya dan tidak diam-diam melebar ke
kebijakan tulis.

Satu indeks unik `business_members_one_per_business_idx` membuat "satu akun satu
akses" berhenti menjadi janji di dalam kode dan menjadi sesuatu yang tidak punya
jalan untuk dilanggar.

## Dua hal yang ikut sembuh

1. **Lubang `viewer`.** `private.accounting_business_access()` — gerbang delapan
   RPC pembukuan termasuk `cancel_ledger_transaction` dan `dispose_fixed_asset`
   — buta peran: ia menerima anggota aktif mana pun. Seorang `viewer`, peran
   yang namanya menjanjikan hanya-baca, bisa membatalkan transaksi. Lubang itu
   hilang bersama peran yang membukanya.

2. **Pemberitahuan ke pemilik yang tidak pernah sampai.**
   `notify_consent_grant_change`, `notify_dossier_download`, dan
   `notify_dossier_request_change` mencari baris `business_members` ber-peran
   `owner` untuk tahu siapa yang harus diberi tahu. Tabel itu kosong, jadi tidak
   ada pemberitahuan yang pernah terkirim. Migrasi ini mengisi baris yang
   hilang, dan ketiganya mulai bekerja.

## Cara migrasinya dibuat

Empat puluh kebijakan dan dua puluh fungsi ditulis ulang. Definisinya **dibaca
dari basis data** lalu polanya diganti secara mekanis, bukan disalin dengan
tangan: sebuah fungsi bisa ditulis ulang empat kali oleh empat migrasi berbeda,
dan yang berlaku hanya yang terakhir. Hasilnya berkas statis yang bisa dibaca.

Beberapa kebijakan menjadi berulang setelah diruntuhkan, misalnya
`A or (user_id = auth.uid() and A)`. Cabang keduanya termuat di cabang pertama,
jadi ditulis `A` saja. Yang dihilangkan hanya pengulangan; tidak ada satu pun
syarat yang hilang.

Penjaga di ujung migrasi membatalkan seluruhnya bila masih ada satu fungsi, satu
kebijakan, atau satu kolom yang menyebut peran usaha. Penggantian yang meleset
diam-diam persis cara sebuah izin berubah tanpa ada yang tahu.

## Rantai migrasi kini satu arah

Lima belas migrasi lama menyebut kolom atau fungsi yang dibuang `0063`, jadi
tidak satu pun bisa dijalankan ulang. Yang lebih berbahaya daripada gagal:
beberapa migrasi lama **berhasil** dijalankan ulang, dan sambil berhasil mereka
menulis ulang fungsi ke definisi lamanya — memasang rantai dua kali kini justru
membatalkan `0063`.

`scripts/verify-database-migrations.mjs` karena itu hanya memasang ulang migrasi
yang lahir **setelah migrasi satu-arah terakhir**, dengan daftar dan alasannya
tertulis di `migrasiSatuArah`. Batasnya bergerak sendiri: menambah migrasi satu
arah baru ke daftar itu otomatis mempersempit apa yang diuji.

Larangan DDL merusak di `tests/integration/database-migrations.contract.test.ts`
juga tetap berlaku untuk semua migrasi kecuali `0063`, yang dicatat di
`migrasiBolehMembuang` beserta alasannya — supaya izin itu harus diminta, bukan
didapat diam-diam.

## Yang TIDAK disentuh

Peran lembaga (`institution_members.role`: `admin`, `analyst`, `reviewer`,
`viewer`) dan `profiles.role` (`umkm`, `institution`, `admin`) tetap seperti
adanya. Yang pertama milik portal lembaga; yang kedua menentukan aplikasi mana
yang dimasuki, bukan tingkat kewenangan di dalam sebuah usaha.

## Status pemasangan

Lokal: `db:test`, `BASELINE=1 db:test`, dan kesetaraan baseline dengan 63
migrasi — semuanya hijau.

**Produksi: terpasang 5 September 2026.** Diverifikasi lewat kueri baca dan
cocok persis dengan hasil lokal:

| Yang diperiksa | Hasil |
| --- | --- |
| kolom `business_members.role` dan `invited_by` | tidak ada |
| `private.business_role`, `private.has_any_business_role` | tidak ada |
| `private.business_access`, `private.has_any_business` | ada, dengan hak eksekusi untuk `authenticated` |
| indeks `business_members_one_per_business_idx` | terpasang |
| kebijakan RLS | 94 |
| kebijakan atau fungsi yang masih menyebut peran usaha | 0 |
| hak tulis `authenticated` atas `business_members` | dicabut |
| tabel `public` tanpa RLS | 0 |

Cache skema PostgREST sudah disegarkan (`notify pgrst, 'reload schema'`).
