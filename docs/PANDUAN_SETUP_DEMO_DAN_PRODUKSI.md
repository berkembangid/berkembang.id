# Panduan setup: demo dan produksi

Satu kode, dua alamat, dua basis data.

```
www.berkembang.id    →  Vercel "berkembang"       →  Supabase ggudmwfhaqoqcguwgdac
demo.berkembang.id   →  Vercel "berkembang-demo"  →  Supabase ridutytfdwshvunodnzo
```

---

## Cara memakai panduan ini

Panduan ini **berurutan**. Kerjakan Langkah 1 sampai selesai, baru Langkah 2.
Melompat akan membuat langkah berikutnya gagal dengan pesan yang tidak
menyebutkan sebabnya.

Setiap langkah punya bentuk yang sama:

| Bagian | Artinya |
| --- | --- |
| **Di mana** | Panel atau terminal mana yang Anda buka |
| **Kerjakan** | Yang Anda lakukan |
| **Periksa** | Cara membuktikan langkahnya berhasil |
| **Kalau salah** | Gejala yang mungkin muncul, dan sebabnya |

**Jangan lanjut kalau "Periksa" belum sesuai.** Satu langkah yang setengah jadi
akan muncul lagi tiga langkah kemudian sebagai kegagalan yang membingungkan.

### Peta sembilan langkah

| # | Langkah | Di mana | Kira-kira | Status |
| --- | --- | --- | --- | --- |
| 1 | Pasang migrasi `0082`–`0092` ke produksi | Terminal | 10 menit | **selesai** |
| 2 | Commit, push, satukan ke cabang produksi | Terminal | 10 menit | **selesai** |
| 3 | Tambahkan `APP_MODE` di Vercel produksi | Vercel | 2 menit | **selesai** |
| 4 | Deploy produksi, baca lognya | Vercel | 5 menit | **selesai** |
| 5 | Buat Vercel project demo dan isi variabelnya | Vercel | 15 menit | **selesai** |
| 6 | Daftarkan `demo.berkembang.id` | Cloudflare | 10 menit + tunggu | **selesai** |
| 7 | Deploy demo, periksa tiga hal | Vercel + peramban | 5 menit | **selesai** |
| 8 | Masuk dengan Google, untuk kedua lingkungan | Supabase + Google | 15 menit | **selesai** |
| 9 | Isi demo dengan data contoh | Terminal | 5 menit | ← di sini, yang terakhir |

Tujuh langkah pertama sudah diperiksa langsung, bukan dianggap selesai:

```
produksi  migrasi 0092 terpasang, tabel_bisa_ditulis = 9
          www.berkembang.id      → 200, /api/v1/dinas-offer → 401
          tanpa spanduk demo, tanpa noindex          ← benar untuk produksi
          OAuth: site_url www, Google aktif

demo      demo.berkembang.id     → 200, /api/v1/dinas-offer → 401
          spanduk demo ada, noindex ada              ← benar untuk demo
          bundel peramban menunjuk ridutytfdwshvunodnzo
```

`/api/v1/dinas-offer` menjawab `401` di **kedua** alamat — itu buktinya
keduanya melayani kode yang sama dan terbaru. Rute itu baru ada di pekerjaan
terakhir; kalau salah satu masih `404`, berarti commit-nya tertinggal.

**Yang tersisa hanya dua, dan keduanya di sisi demo:**

- **Langkah 8 sudah beres untuk kedua lingkungan.** Proyek demo: `site_url` =
  `https://demo.berkembang.id`, daftar izin memuat localhost dan demo,
  penyedia Google aktif dengan OAuth client yang sama dengan produksi, dan
  callback demo sudah terdaftar di Google Cloud. Diukur, bukan diduga: kedua
  lingkungan menjawab ~890 KB dengan `redirect_uri_mismatch` = 0.

  **Satu client OAuth untuk keduanya**, bukan dua. Layar izin (Branding,
  Audience) milik PROJECT Google Cloud, bukan milik client, jadi client kedua
  di project yang sama tidak membuat demo terlihat berbeda sama sekali. Dan
  Client Secret tidak pernah sampai ke peramban — hanya dibaca server
  Supabase — sehingga memperagakan demo tidak memperbesar paparannya. Yang
  membuat pemisahan berarti adalah project Google Cloud tersendiri, dan itu
  baru perlu kalau demo diserahkan ke orang di luar tim.
- **Langkah 9 belum.** Basis data demo masih kosong: `usaha` = 0,
  `transaksi` = 0, `lembaga` = 0, `profil` = 0.

Langkah 6 bisa berhenti menunggu DNS menyebar. Kalau itu terjadi, Langkah 8
boleh dikerjakan sambil menunggu — hanya bagian pemeriksaannya yang perlu
domainnya sudah hidup.

---

## Sebelum mulai — dua hal yang harus dipahami

Lima menit di sini menghemat berjam-jam menebak nanti.

### A. Ada dua jenis variabel lingkungan, dan waktu bacanya berbeda

| Jenis | Contoh | Kapan dibaca |
| --- | --- | --- |
| Berawalan `NEXT_PUBLIC_` | `NEXT_PUBLIC_SUPABASE_URL` | **Saat build.** Nilainya ikut tertanam di berkas JavaScript yang diunduh peramban |
| Tanpa awalan itu | `APP_MODE`, `SUPABASE_SERVICE_ROLE_KEY` | **Saat berjalan**, di server |

Akibat praktisnya ada dua:

- Mengubah `NEXT_PUBLIC_*` di Vercel **tidak berlaku** sampai Anda deploy
  ulang. Mengubah `APP_MODE` berlaku pada restart berikutnya.
- Demo dan produksi **harus dua Vercel project**, bukan satu. Satu build hanya
  bisa memuat satu `NEXT_PUBLIC_SUPABASE_URL`, jadi tidak ada cara satu
  deployment melayani dua basis data.

### B. Empat pihak, masing-masing mengurus satu hal

Ini yang paling sering tertukar, karena namanya semua terasa seperti "tempat
website saya".

```
Hostinger    registrar. Tempat domainnya dibeli dan diperpanjang.
             TIDAK mengelola DNS berkembang.id. Tidak perlu disentuh.

Cloudflare   DNS. Yang menjawab "alamat apa untuk demo.berkembang.id".
             Juga yang mengalihkan berkembang.id → www.berkembang.id.

Vercel       Yang menjalankan aplikasinya. Dua project: produksi dan demo.

Supabase     Basis datanya. Dua proyek: produksi dan demo.
```

Nameserver `berkembang.id` menunjuk Cloudflare:

```
agustin.ns.cloudflare.com
edna.ns.cloudflare.com
```

**Karena itu, data DNS yang Anda tambahkan di panel Hostinger tidak akan
berpengaruh apa pun.** Panel Hostinger akan menerima isian Anda dan
menampilkannya dengan rapi, sementara dunia luar tidak pernah melihatnya. Ini
jenis kesalahan yang paling membingungkan justru karena tidak ada pesan galat
sama sekali.

### Yang sudah beres, jangan dikerjakan lagi

| Sudah ada | Keterangan |
| --- | --- |
| Proyek Supabase demo | `ridutytfdwshvunodnzo` |
| Skema demo | 92 migrasi terpasang, sama dengan produksi |
| `.env` | Lokal, menunjuk **produksi**, `APP_MODE=production` |
| `.env.demo` | Lokal, menunjuk **demo**, `APP_MODE=demo` |
| Vercel produksi | Sudah hidup; `www.berkembang.id` menjawab `200` dari Vercel |
| DNS `berkembang.id` | Cloudflare, apex sudah mengalihkan ke `www` |
| Penjaga `APP_MODE` | Hidup di produksi; menolak jalan kalau mode dan proyeknya tidak cocok |
| Spanduk demo + `noindex` | Hidup di kode; menyala sendiri ketika `APP_MODE=demo` |
| Migrasi produksi | Sudah sampai `0092`; `tabel_bisa_ditulis` = 9 |
| Kode produksi | Sudah di-deploy dan terbukti melayani versi baru |

Yang **belum**: seluruh sisi demo — Vercel project, domain, OAuth, dan data
contohnya. Itu Langkah 5 sampai 9.

---

## Langkah 1 — Pasang migrasi `0082`–`0092` ke produksi

Produksi masih di migrasi `0081`. Sebelas menunggu.

**Ini lebih dulu daripada deploy kode**, dan urutannya bukan selera: layar-layar
baru memanggil fungsi basis data yang dibuat migrasi ini. Kode baru di atas
basis data lama akan menampilkan galat kepada pengguna sungguhan.

### Di mana

Terminal, di folder proyek ini.

### Kerjakan

Satu per satu, berurutan. **Kalau salah satu gagal, berhenti** — jangan
lanjutkan ke berikutnya.

```bash
node scripts/supabase-sql.mjs --target production supabase/migrations/0082_ringkasan_wilayah_dinas.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0083_klik_angka_jadi_daftar.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0084_broadcast_pendampingan.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0085_kewenangan_disetel_admin_bukan_subjeknya.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0086_penyusutan_tanpa_nilai_residu.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0087_aset_tetap_pada_harga_perolehan.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0088_neraca_saldo_satu_kolom.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0089_umur_ekonomis_ditanyakan.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0090_sambutan_umkm_baru.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0091_tawaran_dinas_pembina.sql
node scripts/supabase-sql.mjs --target production supabase/migrations/0092_hak_tulis_hanya_yang_disengaja.sql
```

**Dua yang perlu Anda jalankan dengan sadar**, karena keduanya mengubah angka
yang sudah pernah dilihat orang:

- **`0086`** — nilai residu dihapus dari penyusutan (SAK EMKM 11.14). Beban
  penyusutan **naik**, untung bulanan **turun**. Itu koreksi yang benar, tetapi
  bukan yang enak muncul mendadak tanpa penjelasan kalau sudah ada pemilik
  usaha yang memakainya.
- **`0087`** — aset tetap disajikan pada harga perolehan dengan akumulasi
  penyusutan terpisah. Nilai bukunya **tidak berubah**; yang berubah cara
  menyajikannya.

**Satu hal setelah `0087`:** jurnal pembuka yang **sudah** tersimpan tetap
memuat satu baris bernilai bersih, karena jurnal tidak bisa disunting. Usaha
yang kondisi awalnya sudah tersimpan perlu **menyimpannya sekali lagi** dari
halaman Kondisi Usaha supaya penyajiannya terbelah. Penyusutan bulan-bulan
berikutnya sudah benar tanpa tindakan apa pun.

### Periksa

```bash
node scripts/supabase-sql.mjs --target production -e "select (select count(*) from information_schema.columns where table_schema='public' and table_name='fixed_assets' and column_name='opening_accumulated_depreciation_idr')::int as kolom_0087, (select count(distinct table_name) from information_schema.role_table_grants where table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE') and grantee in ('authenticated','anon'))::int as tabel_bisa_ditulis"
```

Yang benar: `kolom_0087` = **1**, `tabel_bisa_ditulis` = **9**.

Kedua angka itu sudah dibuktikan pada proyek demo yang memang sudah di `0092`,
jadi keduanya bukan perkiraan.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| `403` atau `401` | Tokennya milik proyek lain. Token satu proyek tidak berlaku di proyek lain |
| Migrasi berhenti dengan nama penjaga dalam huruf besar | Itu memang maksudnya. Laporkan pesannya utuh, jangan dilewati |
| `tabel_bisa_ditulis` lebih dari 9 | `0092` belum jalan, atau gagal separuh |

---

## Langkah 2 — Commit, push, dan satukan ke cabang produksi

**Vercel men-deploy dari GitHub, bukan dari folder di laptop Anda.** Selama
kodenya belum sampai ke cabang yang Vercel pantau, tidak ada tombol apa pun di
Vercel yang bisa menerbitkannya.

Hari ini: ada **92 berkas yang belum di-commit**, dan cabang `develop` sudah
**34 commit di depan `main`**.

### Di mana

Terminal.

### Kerjakan

**1. Pastikan semua gate hijau lebih dulu.** Ini lebih murah daripada
mengetahuinya dari build Vercel yang gagal.

```bash
npm run typecheck
npm run lint
npm run lint:terms
npm test
npm run build
```

Kelimanya sudah hijau saat panduan ini ditulis. `npm run lint` menyisakan 61
peringatan lama — peringatan tidak menggagalkan apa pun; yang harus nol adalah
**error**.

**2. Commit dan push.**

```bash
git add -A
git commit -m "pisahkan lingkungan demo dan produksi"
git push origin develop
```

**3. Cari tahu cabang mana yang dianggap produksi oleh Vercel.**

Vercel → project `berkembang` → **Settings → Git → Production Branch**.

Nilainya biasanya `main`. Selama Anda hanya push ke `develop`, Vercel akan
membuat **Preview Deployment** — alamat acak, bukan `www.berkembang.id`.

**4. Kalau cabang produksinya `main`, satukan.**

```bash
git checkout main
git merge develop
git push origin main
git checkout develop
```

Push ke `main` inilah yang memulai deployment produksi.

### Periksa

```bash
git status --porcelain   # harus kosong
git log --oneline -1     # commit terbaru Anda
```

Lalu di Vercel → **Deployments**: harus ada deployment baru berstatus
**Building**, dengan label **Production** — bukan Preview.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| Vercel diam saja setelah push | Anda push ke cabang yang bukan Production Branch |
| Deployment barunya berlabel **Preview** | Sama: itu `develop`, bukan cabang produksi |
| `git push` ditolak | Ada perubahan di remote yang belum Anda ambil. `git pull` dulu |

> **Deployment pertama ini akan gagal kalau Langkah 3 belum dikerjakan** — dan
> alasannya justru menyenangkan. Baca Langkah 3.

---

## Langkah 3 — Tambahkan `APP_MODE` di Vercel produksi

Kode baru memuat penjaga yang menolak berjalan kalau tidak tahu lingkungan mana
yang sedang dilayaninya. Penjaga itu dipanggil dari `next.config.ts`, jadi
**berjalan saat build** — sebelum satu halaman pun dibangun.

Artinya: tanpa variabel ini, deploy pertama kode baru akan **gagal**. Produksi
tetap hidup dengan versi sebelumnya dan tidak ada yang rusak.

**Judul galatnya tidak menyebut sebabnya**, dan ini perlu Anda ketahui sebelum
melihatnya. Vercel akan menampilkan:

```
⨯ Failed to load next.config.ts, see more info here https://nextjs.org/...
> Build error occurred
```

Sampai di situ kelihatan seperti berkas konfigurasinya rusak. **Sebabnya
tercetak beberapa baris di bawahnya** — gulir log-nya ke bawah:

```
Error: APP_MODE belum diisi. Setel production atau demo di berkas lingkungan
       ini supaya aplikasi bisa menyebutkan lingkungan mana yang sedang berjalan.
    at assertAppModeMatchesProject (lib/env/app-mode.ts:45:15)
    at assertAppModeFromEnv (lib/env/app-mode.ts:74:12)
```

Begitulah cara Next melaporkan galat apa pun yang dilempar saat memuat
`next.config.ts`: judulnya selalu sama, dan sebab sesungguhnya ada di bawah.

**Variabel dulu, deploy kemudian.** Kalau Langkah 2 sudah memulai deployment
yang gagal, tidak apa-apa: isi variabelnya, lalu **Redeploy**.

### Di mana

Vercel → project `berkembang` → **Settings → Environment Variables**.

### Kerjakan

Tambahkan satu variabel, untuk environment **Production**:

| Variabel | Nilai |
| --- | --- |
| `APP_MODE` | `production` |

Lalu pastikan sembilan ini juga sudah ada. Kalau produksi sudah berjalan selama
ini, semuanya kecuali `APP_URL` hampir pasti sudah terisi:

| Variabel | Nilai |
| --- | --- |
| `APP_URL` | `https://www.berkembang.id` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ggudmwfhaqoqcguwgdac.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dari `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | dari `.env` |
| `GROQ_API_KEY` | dari `.env` |
| `OPENAI_API_KEY` | dari `.env` |
| `GEMINI_API_KEY` | dari `.env` |
| `RESEND_API_KEY` | dari akun Resend |
| `RESEND_FROM_EMAIL` | `Berkembang.id <noreply@berkembang.id>` |

**`APP_URL` harus host yang benar-benar melayani aplikasi**, bukan yang
mengalihkan. Ini pernah salah, dan akibatnya sulit dilaporkan orang. Sudah
diperiksa:

```
berkembang.id       → 308 → www,  Server: cloudflare   (hanya mengalihkan)
www.berkembang.id   → 200,        Server: Vercel       (ini host aplikasinya)
```

Jadi `APP_URL` = **`https://www.berkembang.id`**, dengan `www`.

**Jangan pasang variabel ini di Vercel.** Tidak satu pun dibaca aplikasi saat
berjalan, dan yang pertama adalah kunci yang bisa mengubah seluruh proyek
Supabase Anda:

```
SUPABASE_ACCESS_TOKEN     SUPABASE_DB_PASSWORD
DATABASE_TEST_URL         E2E_EMAIL     E2E_PASSWORD
PLAYWRIGHT_BASE_URL
```

### Periksa

Hitung ulang: harus ada **10** variabel di environment Production.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| Build gagal, `Failed to load next.config.ts` | Hampir selalu ini: `APP_MODE` belum ada. Gulir lognya ke bawah untuk pesan sebenarnya |
| Build gagal, `APP_MODE belum diisi` | Variabelnya belum tersimpan, atau tersimpan di environment Preview saja |
| Sudah mengisi variabelnya, tetapi masih gagal | Variabel baru hanya terbaca oleh build **berikutnya**. Buka deployment yang gagal → **Redeploy**. Tidak perlu push lagi |
| Build gagal, `APP_MODE="demo" tetapi ... menunjuk proyek` | Nilainya `demo` di project produksi. Ubah ke `production` |

---

## Langkah 4 — Deploy produksi dan buktikan lingkungannya benar

### Di mana

Vercel → project `berkembang` → **Deployments**.

### Kerjakan

Kalau Langkah 2 sudah memulai deployment dan gagal karena `APP_MODE`, buka
deployment itu → **Redeploy**.

Kalau belum ada, push ke cabang produksi memulainya.

### Periksa

Ada dua penjaga, dan masing-masing meninggalkan bukti yang berbeda.

**1. Build yang berhasil sudah membuktikan penjaga pertama lolos.**

`next.config.ts` memanggil pemeriksanya saat build. Jadi kalau build-nya
**berhasil**, itu sendiri sudah bukti bahwa `APP_MODE` terpasang **dan** cocok
dengan `NEXT_PUBLIC_SUPABASE_URL`. Tidak ada cara build lolos dengan mode yang
salah — kegagalannya yang Anda lihat di Langkah 3 justru penjaga yang sama.

**2. Untuk penjaga kedua, panggil satu fungsi server:**

```bash
curl -s -o /dev/null -w "%{http_code}" https://www.berkembang.id/api/v1/accounting/trial-balance
```

Yang benar: **`401`**. Terdengar aneh sebagai "berhasil", tetapi `401` berarti
fungsinya **berjalan** lalu menolak Anda karena belum masuk — dan fungsi yang
berjalan berarti penjaga runtime-nya lolos. Kalau `APP_MODE` tidak cocok saat
berjalan, `register()` melempar galat dan jawabannya **`500`**.

Lalu pastikan mode-nya memang produksi, bukan demo:

```bash
curl -s https://www.berkembang.id/ | grep -c "LINGKUNGAN DEMO"   # harus 0
curl -s https://www.berkembang.id/ | grep -c 'name="robots"'     # harus 0
```

### Tentang baris log lingkungan

```
[berkembang.id] lingkungan Produksi, proyek Supabase ggudmwfhaqoqcguwgdac
```

Baris ini berguna, tetapi **tidak bisa dipakai sebagai pemeriksaan** — dan ini
koreksi atas versi panduan sebelumnya, yang menyuruh Anda menganggap
ketiadaannya sebagai kegagalan. Ada tiga sebab baris itu bisa tidak ada padahal
semuanya benar:

- **Log build bukan Runtime Logs.** Baris ini dicetak `instrumentation.ts`
  ketika server **menyala**, dan `register()` memang tidak berjalan saat
  `next build`. Di log build, baris ini tidak akan pernah ada. Bukanya:
  Deployment → tab **Runtime Logs** (bukan **Building**).
- **Halaman depan tidak menyalakan server apa pun.** `/` disajikan statis dari
  CDN, jadi membukanya tidak menghidupkan satu fungsi pun — dan tanpa fungsi
  yang menyala, tidak ada yang mencetak baris itu.
- **Serverless menyala hanya saat dibutuhkan.** Barisnya muncul pada *cold
  start*; permintaan berikutnya memakai instance yang sama dan tidak
  mencetaknya lagi.

Jadi kalau Anda memang ingin melihatnya: jalankan `curl` di atas lebih dulu —
permintaan itu menyalakan fungsinya — lalu buka **Runtime Logs**.

Pakai baris itu untuk **membaca** lingkungan mana yang naik, bukan untuk
menyimpulkan ada yang salah.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| `curl` di atas menjawab `500` | `APP_MODE` diubah di Vercel tanpa deploy ulang, jadi tidak lagi cocok dengan URL yang tertanam saat build. **Redeploy** |
| Spanduk cokelat muncul di `www.berkembang.id` | **Berhenti.** `APP_MODE` produksi bernilai `demo` — produksi sedang menulis ke basis data demo |
| Baris log itu tidak ada | Belum tentu masalah. Baca bagian di atas |
| Baris log itu menyebut proyek yang salah | `NEXT_PUBLIC_SUPABASE_URL` salah. Betulkan, lalu **deploy ulang** — nilai ini tertanam saat build |

---

## Langkah 5 — Buat Vercel project demo dan isi variabelnya

### Di mana

Vercel → **Add New** → **Project**.

### Kerjakan

**1. Import repo yang sama, lagi.** Repo dan cabangnya sama persis — ini bukan
salinan kode dan bukan cabang berbeda. Yang membedakan demo dari produksi
**hanya variabelnya**.

Beri nama `berkembang-demo`.

> **Segera sesudah import, betulkan cabangnya.** Vercel memilih **default
> branch** repo di GitHub, dan di repo ini itu `master` — bukan `main`.
> `master` tertinggal di belakang, jadi demo akan membangun kode lama tanpa
> memberi tahu Anda: situsnya hidup, alamatnya benar, basis datanya benar,
> tetapi layar-layar barunya tidak ada.
>
> **Settings → Environments → Production → Production Branch** → ubah ke
> `main`. (Bukan di halaman **Git** — di sana hanya sambungan repo.)
>
> Mengubah setelan ini **tidak** memicu deployment. Picu sendiri lewat form
> **Deploy Hooks** di halaman Git dengan branch `main`, atau dengan
> `git commit --allow-empty` lalu push ke `main`. "Redeploy" tidak menolong:
> ia membangun ulang commit yang sama, yang justru commit lamanya.

**2. Isi sepuluh variabel.** Perhatikan kolom paling kanan:

| Variabel | Nilai demo | Beda dari produksi? |
| --- | --- | --- |
| `APP_MODE` | `demo` | **BEDA** |
| `APP_URL` | `https://demo.berkembang.id` | **BEDA** |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ridutytfdwshvunodnzo.supabase.co` | **BEDA** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dari `.env.demo` | **BEDA** |
| `SUPABASE_SERVICE_ROLE_KEY` | dari `.env.demo` | **BEDA** |
| `GROQ_API_KEY` | boleh sama | sama |
| `OPENAI_API_KEY` | boleh sama | sama |
| `GEMINI_API_KEY` | boleh sama | sama |
| `RESEND_API_KEY` | boleh sama | sama |
| `RESEND_FROM_EMAIL` | `Berkembang.id (Demo) <demo@berkembang.id>` | **disarankan beda** |

**Lima baris pertama itu seluruh pemisahannya.** Kalau salah satu masih
menyimpan nilai produksi, demo akan menulis ke basis data sungguhan.

Penjaga `APP_MODE` menangkap kombinasi yang paling berbahaya — `APP_MODE=demo`
dengan URL produksi — dan menolak deploymentnya. Tetapi penjaga itu **tidak**
bisa menangkap anon key atau service role key yang salah, karena keduanya tidak
menyebutkan milik proyek mana. **Periksa kelimanya dengan mata.**

**Kenapa `RESEND_FROM_EMAIL` disarankan beda:** surel demo yang datang dari
alamat yang sama dengan produksi tidak bisa dibedakan penerimanya — dan
penerimanya bisa orang sungguhan yang alamatnya terpakai di data contoh.

**Pertimbangkan kunci AI terpisah** untuk demo. Bukan soal isolasi data: biaya
demo jadi terbaca sendiri, dan kunci yang bocor saat dipresentasikan bisa
dicabut tanpa mematikan produksi.

### Periksa

Sepuluh variabel terisi, dan lima yang bertanda **BEDA** semuanya bernilai
demo. Baca ulang sekali lagi sebelum lanjut — ini titik yang paling mahal kalau
salah.

---

## Langkah 6 — Daftarkan `demo.berkembang.id` di Cloudflare

Hari ini nama `demo.berkembang.id` belum ada sama sekali di DNS.

### Di mana

Vercel untuk mengambil nilainya, lalu **Cloudflare** untuk menambahkannya.

**Bukan Hostinger.** Lihat "Sebelum mulai — B" kalau perlu alasannya.

### Kerjakan

**1.** Vercel → project `berkembang-demo` → **Settings → Domains → Add** →
`demo.berkembang.id`.

**2.** Vercel menampilkan satu data CNAME. **Pakai nilai yang ditampilkan itu,
apa adanya.** Vercel sekarang memberi sasaran per-project, bukan satu nilai
umum: `www` Anda hari ini menunjuk `173317a3d20f53f1.vercel-dns-017.com`, bukan
`cname.vercel-dns.com` yang banyak beredar di panduan lama. Nilai untuk demo
akan berbeda lagi.

**3.** Cloudflare → **DNS → Records → Add record**:

```
Type      CNAME
Name      demo
Target    (nilai yang Vercel tampilkan)
Proxy     DNS only   ← abu-abu, BUKAN oranye
TTL       Auto
```

**Awan oranye harus mati**, dan ini bukan selera. `www.berkembang.id` hari ini
`DNS only` — responsnya bertuliskan `Server: Vercel` tanpa jejak Cloudflare
sama sekali — dan demo harus sama. Kalau proxy Cloudflare dinyalakan di atas
Vercel, sertifikat TLS diterbitkan dua kali oleh dua pihak; gejalanya berkisar
dari Vercel tidak pernah bisa memverifikasi domainnya sampai peramban
melaporkan terlalu banyak pengalihan. Keduanya sulit ditelusuri karena semuanya
"terlihat benar" di kedua panel.

**Jangan tambahkan pengalihan apa pun untuk `demo`.** Cloudflare sudah punya
aturan yang mengalihkan apex ke `www`; aturan itu berlaku untuk `berkembang.id`
saja dan tidak menyentuh subdomain. Demo dilayani langsung di
`demo.berkembang.id` — tanpa `www` di depannya, dan tanpa pengalihan.

**4.** Tunggu Vercel menandai domainnya **Valid**. Biasanya beberapa menit.

### Periksa

Dari terminal, **bukan dari peramban Anda** — peramban menyimpan DNS lama:

```bash
nslookup demo.berkembang.id 8.8.8.8
curl -sI https://demo.berkembang.id/ | grep -iE "^HTTP|^server"
```

Yang benar: namanya diteruskan ke sasaran `vercel-dns`, dan responsnya `200`
dengan `Server: Vercel`.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| Vercel tak pernah menandainya **Valid** | CNAME-nya ditambahkan di Hostinger, bukan Cloudflare — di sana tidak berpengaruh |
| `Server: cloudflare` yang muncul | Awan oranyenya masih menyala. Ubah ke `DNS only` |
| Galat sertifikat, atau terlalu banyak pengalihan | Sama: proxy Cloudflare menyala di atas Vercel |
| `Non-existent domain` | Datanya belum tersimpan, atau DNS-nya belum menyebar. Tunggu, lalu ulangi |

---

## Langkah 7 — Deploy demo dan periksa tiga hal

### Di mana

Vercel → project `berkembang-demo`, lalu peramban.

### Periksa

**1. Fungsi servernya berjalan** — ini yang membuktikan penjaga runtime lolos:

```bash
curl -s -o /dev/null -w "%{http_code}" https://demo.berkembang.id/api/v1/accounting/trial-balance
```

Harus **`401`**, bukan `500`. Seperti di Langkah 4: `401` berarti fungsinya
jalan lalu menolak Anda karena belum masuk.

**2. Spanduk demo terlihat, dan `noindex` ada:**

```bash
curl -s https://demo.berkembang.id/ | grep -c "LINGKUNGAN DEMO"   # harus 1
curl -s https://demo.berkembang.id/ | grep -o '<meta name="robots"[^>]*>'
```

Yang kedua harus mencetak:

```
<meta name="robots" content="noindex, nofollow, nocache"/>
```

Di peramban, spanduknya berbunyi: *"LINGKUNGAN DEMO — Datanya contoh dan bisa
dihapus kapan saja. Jangan memasukkan catatan usaha yang sungguhan."*

**3. Baris log lingkungannya** — opsional, dan hanya setelah `curl` di poin 1
menyalakan fungsinya. Buka **Runtime Logs** (bukan log build):

```
[berkembang.id] lingkungan Demo, proyek Supabase ridutytfdwshvunodnzo
```

Ketiadaan baris ini bukan bukti ada yang salah — sebabnya dijelaskan di
Langkah 4.

Poin 1 dan 2 sudah dibuktikan dengan menjalankan build demo secara lokal, jadi
kalau salah satu tidak sesuai, yang salah adalah setelan di Vercel — bukan
kodenya.

### Kalau demo menjalankan kode lama

Ini benar-benar terjadi saat panduan ini dipakai, dan gejalanya menyesatkan:
situsnya hidup, alamatnya benar, basis datanya benar — tetapi spanduk demo
tidak ada. Mudah disalahartikan sebagai `APP_MODE` yang salah.

Sebabnya lain: **Vercel project demo men-deploy commit yang lebih tua.** Saat
sebuah project baru diimpor, yang dibangun adalah commit yang ada di cabang
produksinya saat itu — bukan otomatis yang terbaru, dan bukan cabang yang
sedang Anda kerjakan.

**Cara memastikan**, dua rute yang hanya ada di kode baru:

```bash
curl -s -o /dev/null -w "%{http_code}" https://demo.berkembang.id/api/v1/dinas-offer
curl -s -o /dev/null -w "%{http_code}" https://demo.berkembang.id/api/v1/broadcasts
```

- **`401`** → kodenya baru. Kalau spanduknya tetap tidak ada, `APP_MODE` yang
  salah.
- **`404`** → rutenya tidak ada, jadi kodenya lama. Itu sebabnya.

Pemeriksaan lain yang sama cepatnya:

```bash
curl -sI "https://demo.berkembang.id/?code=uji" | head -1
```

Kode baru menjawab `307` (diteruskan ke `/auth/callback`); kode lama menjawab
`200`.

**Membetulkannya:**

1. **Pastikan `APP_MODE=demo` sudah tersimpan lebih dulu.** Ini penting: kode
   lama tidak punya penjaga, jadi build-nya lolos tanpa variabel itu. Begitu
   kode baru dibangun, build akan **gagal** kalau variabelnya belum ada —
   persis seperti yang terjadi di produksi pada Langkah 3.
2. Vercel → project `berkembang-demo` → **Settings → Git → Production Branch** —
   pastikan sama dengan cabang produksi Anda (`main`).
3. **Deployments** → deployment terbaru → **Redeploy**. Kalau daftarnya masih
   menunjuk commit lama, push apa pun ke cabang itu akan memicu build baru.
4. Ulangi pemeriksaan poin 1 dan 2 di atas.

**Spanduk itu tidak bisa ditutup, dan nilainya tidak pernah dikirim ke
peramban** — `APP_MODE` hanya dibaca di server. Jadi tidak ada yang bisa
mematikannya dari sisi pembaca, termasuk yang membuka alat pengembang.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| Spanduk tidak muncul, **dan** `noindex` juga tidak ada | Periksa dulu apakah kodenya versi lama — lihat "Kalau demo menjalankan kode lama" di bawah. Kalau kodenya baru, berarti `APP_MODE` bukan `demo` |
| Spanduk tidak muncul tetapi `noindex` ada | Aneh, dan tidak seharusnya mungkin. Laporkan |
| Spanduk muncul di `www.berkembang.id` | **Berhenti.** `APP_MODE` produksi bernilai `demo`. Produksi sedang menulis ke basis data demo |
| `noindex` tidak ada tetapi spanduknya ada | Tidak mungkin terjadi — keduanya dibaca dari satu nilai yang sama. Kalau muncul, laporkan |
| `curl` menjawab `500` | `APP_MODE` diubah tanpa deploy ulang. **Redeploy** |

---

## Langkah 8 — Masuk dengan Google, untuk kedua lingkungan

Ini bagian yang paling sering salah. Pahami pembagiannya lebih dulu, karena
arahnya berlawanan dari dugaan:

```
Google Cloud   →  perlu tahu alamat SUPABASE, bukan alamat aplikasi
Supabase       →  perlu tahu alamat APLIKASI
```

### Kerjakan

**1. Sisi Supabase.** Dari terminal:

```bash
node scripts/setup-oauth-urls.mjs --target production https://www.berkembang.id
node scripts/setup-oauth-urls.mjs --target demo https://demo.berkembang.id
```

Skrip ini **mempertahankan** alamat yang sudah ada di daftar, jadi aman
dijalankan berulang. `--target` wajib disebut — tanpa itu skripnya berhenti,
supaya daftar izin produksi tidak pernah disetel sambil mengira sedang menyetel
demo.

Keluarannya menyebutkan alamat callback Supabase yang Anda perlukan di langkah
berikut.

**2. Sisi Google Cloud.** **APIs & Services → Credentials → OAuth 2.0 Client ID
→ Authorized redirect URIs.** Tambahkan **dua** alamat:

```
https://ggudmwfhaqoqcguwgdac.supabase.co/auth/v1/callback
https://ridutytfdwshvunodnzo.supabase.co/auth/v1/callback
```

Dua, karena setiap proyek Supabase punya alamat callback-nya sendiri. Kalau
hanya satu yang didaftarkan, masuk dengan Google gagal di lingkungan yang lain
— dengan pesan dari Google, bukan dari aplikasi ini, sehingga tidak ada
petunjuk apa pun di log Anda.

**Cara memeriksanya tanpa harus mencoba masuk**, berguna karena galatnya datang
dari Google dan tidak meninggalkan jejak di log Anda:

```bash
REF=ridutytfdwshvunodnzo   # ganti dengan ref proyek yang mau diperiksa
LOC=$(curl -si "https://$REF.supabase.co/auth/v1/authorize?provider=google"   | tr -d '
' | awk '/^[Ll]ocation: /{print substr($0,11)}')
curl -sL "$LOC" -o /tmp/g.html -w "ukuran %{size_download}
"
grep -c redirect_uri_mismatch /tmp/g.html
```

Bacanya:

| Hasil | Artinya |
| --- | --- |
| ~890 KB, `redirect_uri_mismatch` = 0 | Callbacknya **terdaftar**. Itu halaman masuk Google yang sesungguhnya |
| ~775 KB, `redirect_uri_mismatch` ≥ 1 | Callbacknya **belum terdaftar** di Google Cloud |

Perbedaan ukurannya bukan kebetulan: halaman galat Google jauh lebih kecil
daripada layar masuknya. Uji ini sudah dikalibrasi dengan tiga kasus — callback
produksi yang memang jalan, callback demo, dan satu alamat ngawur sebagai
kontrol — karena tanpa kontrol itu, `302` dari Google mudah disalahartikan
sebagai "diterima": Google menjawab `302` pada kedua keadaan, dan bedanya baru
terlihat setelah redirect-nya diikuti sampai habis.

**3. Nyalakan penyedia Google di proyek demo.** Supabase dashboard proyek demo →
**Authentication → Providers → Google** → nyalakan, lalu isikan Client ID dan
Client Secret **yang sama** dengan produksi. Boleh sama karena keduanya memakai
OAuth client Google yang sama.

### Periksa

Buka `https://demo.berkembang.id/auth/login` dan masuk dengan Google. Yang
benar adalah **tiga langkah**, bukan satu:

```
1. Layar izin Google
2. /auth/lengkapi   -- pilih peran, isi nama usaha, kota, dan seterusnya
3. /umkm/profil     -- dengan perkenalan singkat
```

Langkah 2 muncul karena akun Google tidak membawa jawaban apa pun tentang
usahanya. Ini disengaja dan sama dengan jalur surel: mendaftar lewat Google
**tidak** melompati pertanyaan-pertanyaan itu. Kalau Anda masuk dengan akun
Google yang sudah pernah mendaftar lewat surel, langkah 2 dilewati — jawabannya
sudah ada.

Langkah 3 hanya sekali. Masuk berikutnya membawa Anda langsung ke Beranda.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| Mendarat di halaman depan dengan `?code=...` | Daftar izin Supabase menyebut host yang salah. Aplikasi meneruskan Anda sendiri — halaman depan mengalihkan `?code=` ke `/auth/callback` — jadi Anda tetap masuk. **Tetap betulkan**: tautan di dalam surel tidak punya penerusan seperti itu |
| Pesan galat dari Google, bukan dari aplikasi | Alamat callback Supabase belum didaftarkan di Google Cloud |
| Tombol Google tidak ada di demo | Penyedia Google belum dinyalakan di proyek Supabase demo |

---

## Langkah 9 — Isi demo dengan data contoh

Demo yang kosong tidak bisa didemokan. Yang paling bernilai: satu UMKM dengan
catatan beberapa bulan, sehingga laporannya punya angka.

### Di mana

Terminal.

### Kerjakan

Skrip seed membaca env dari `.env` atau `.env.local` — **bukan** dari
`.env.demo`. Jadi nilai demo dikirim lewat baris perintah, yang menimpa isi
berkas. Cara ini tidak menyentuh `.env` Anda sama sekali.

**PowerShell:**

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://ridutytfdwshvunodnzo.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<anon key dari .env.demo>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service role key dari .env.demo>"
$env:DEMO_PASSWORD = "sandi-demo-minimal-12-karakter"
npm run seed:demo -- --project ridutytfdwshvunodnzo
```

Empat hal tentang perintah itu:

- **`--project` wajib**, dan harus cocok dengan ref di dalam
  `NEXT_PUBLIC_SUPABASE_URL`. Skripnya menolak jalan kalau tidak cocok — dan
  penjaga itulah yang mencegah data contoh mendarat di produksi.
- **`DEMO_PASSWORD` minimal 12 karakter**, dan tidak pernah ada di repositori.
  Ini sandi akun demo yang akan Anda pakai saat presentasi.
- **`$env:` di PowerShell berlaku sampai jendela ditutup.** Tutup terminalnya
  sesudah selesai, supaya perintah berikutnya tidak diam-diam masih menunjuk
  demo.
- Kalau memakai bash atau Git Bash, bentuknya
  `VAR=nilai npm run seed:demo -- --project ...` dalam satu baris — di situ
  nilainya hanya berlaku untuk perintah itu.

Skripnya mencetak enam akun ketika selesai: UMKM, koperasi, bank, BNI Ventures,
dinas, dan sandinya. **Simpan keluaran itu** — itu daftar login untuk
presentasi Anda.

### Periksa

```bash
node scripts/supabase-sql.mjs --target demo -e "select (select count(*) from public.businesses)::int as usaha, (select count(*) from public.transactions)::int as transaksi, (select count(*) from public.institutions)::int as lembaga"
```

Ketiganya harus lebih dari 0.

### Satu hal yang harus Anda TIDAK lakukan

Ada menu di Ruang Mesin untuk menandai sebuah usaha sebagai akun demo. **Jangan
pakai untuk usaha di proyek demo ini.**

Tanda itu mengeluarkan usahanya dari **setiap** angka: dasbor dinas, ringkasan
wilayah, metrik Ruang Mesin. Di proyek demo, satu-satunya usaha yang ada adalah
usaha demo — jadi menandainya membuat semua layar dinas menunjukkan nol, yaitu
justru layar yang paling ingin Anda pertunjukkan.

Tanda itu ada untuk keadaan yang berbeda: akun peraga yang hidup **di dalam
produksi**, berdampingan dengan usaha sungguhan, yang angkanya tidak boleh ikut
terhitung. Sejak demo punya proyeknya sendiri, keadaan itu tidak berlaku lagi
di sini.

### Kalau salah

| Gejala | Sebab |
| --- | --- |
| `DEMO_PASSWORD belum diisi, atau kurang dari 12 karakter` | Persis itu. Panjangkan sandinya |
| `Sasaran harus disebut secara eksplisit` | `--project` tidak ada, atau tidak cocok dengan ref di URL-nya |
| `usaha` = 0 padahal skripnya bilang selesai | Yang Anda seed bukan proyek demo. Periksa `NEXT_PUBLIC_SUPABASE_URL` yang tadi disetel |
| Layar dinas di demo semuanya nol | Usahanya tertandai sebagai akun demo. Lepas tandanya |

---

## Sesudah semuanya jalan

### Menambah migrasi baru

**Selalu demo lebih dulu.** Demo adalah gladi resiknya — migrasi yang rusak
ketemu di data yang tidak ada yang peduli.

```bash
npm run db:test                                                                      # 1. lokal
node scripts/supabase-sql.mjs --target demo supabase/migrations/00XX_nama.sql        # 2. demo
# buka demo.berkembang.id, pastikan layarnya masih benar
node scripts/supabase-sql.mjs --target production supabase/migrations/00XX_nama.sql   # 3. produksi
```

### Berpindah target di komputer sendiri

Hanya `.env` yang dibaca aplikasi. Untuk menunjuk demo dari laptop:

```bash
cp .env .env.produksi.simpanan   # sekali saja, supaya tidak hilang
cp .env.demo .env                # tunjuk demo
cp .env.produksi.simpanan .env   # kembali ke produksi
```

Setelah menyalin, `npm run dev` akan mencetak lingkungan mana yang aktif. Kalau
`APP_MODE` dan URL-nya tidak cocok, aplikasinya menolak berjalan dan
menyebutkan keduanya.

**Jangan** menamai berkasnya `.env.production` atau `.env.development`. Next
memuat nama-nama itu otomatis berdasarkan **mode build**, bukan lingkungan
deployment — jadi `.env.production` akan ikut termuat setiap kali Anda
`npm run build` di laptop, betapa pun Anda sedang menguji demo.

---

## Daftar periksa akhir

```
Langkah 1  [ ] Produksi terpasang sampai 0092, tabel_bisa_ditulis = 9
Langkah 2  [ ] git status kosong, cabang produksi sudah memuat kodenya
Langkah 3  [ ] Vercel produksi: 10 variabel, APP_MODE=production
Langkah 4  [ ] /api/v1/accounting/trial-balance menjawab 401, bukan 500
Langkah 4  [ ] www.berkembang.id TIDAK memuat spanduk cokelat, dan tanpa noindex
Langkah 5  [ ] Vercel demo: 10 variabel, lima di antaranya BEDA
Langkah 6  [ ] demo.berkembang.id menjawab 200 dengan Server: Vercel
Langkah 7  [ ] Log demo menyebut "lingkungan Demo" (picu cold start dulu)
Langkah 7  [ ] Spanduk cokelat terlihat, dan noindex ada di sumber halaman
Langkah 8  [ ] setup-oauth-urls dijalankan untuk KEDUA target
Langkah 8  [ ] Google Cloud memuat DUA alamat callback Supabase
Langkah 8  [ ] Masuk dengan Google berhasil di kedua alamat
Langkah 9  [ ] Demo punya data contoh (usaha, transaksi, lembaga > 0)
Langkah 9  [ ] Usaha demo TIDAK ditandai sebagai akun demo di Ruang Mesin
```

---

## Kalau ada yang salah — ringkasan

| Gejala | Sebab yang paling sering |
| --- | --- |
| Deployment gagal, `Failed to load next.config.ts` | `APP_MODE` belum ada di Vercel (Langkah 3). Sebab sesungguhnya tercetak di bawah `Build error occurred` |
| Deployment gagal, `APP_MODE belum diisi` | Variabelnya belum ditambahkan di Vercel (Langkah 3) |
| Deployment gagal, `APP_MODE="demo" tetapi ... menunjuk proyek` | `NEXT_PUBLIC_SUPABASE_URL` masih nilai produksi |
| Vercel diam saja setelah `git push` | Anda push ke cabang yang bukan Production Branch (Langkah 2) |
| Demo hidup, basis datanya benar, tetapi layar barunya tidak ada | Production Branch project demo masih `master` (default GitHub), bukan `main` (Langkah 5) |
| Spanduk demo tidak muncul di demo | `APP_MODE` bukan `demo`, atau belum deploy ulang |
| Vercel tak pernah menandai `demo.berkembang.id` Valid | CNAME-nya ditambahkan di Hostinger, bukan Cloudflare |
| `demo.berkembang.id` galat sertifikat atau terlalu banyak pengalihan | Awan oranye Cloudflare menyala. Harus `DNS only` |
| Mendarat di halaman depan dengan `?code=` | Daftar izin Supabase menyebut host yang salah (Langkah 8) |
| Masuk Google gagal dengan pesan dari Google | Alamat callback Supabase belum didaftarkan di Google Cloud |
| `supabase-sql.mjs` menjawab 403 | Tokennya milik proyek lain. Token satu proyek tidak berlaku di proyek lain |
| Layar dinas di demo semuanya nol | Usaha demo tertandai sebagai akun demo. Lepas tandanya |
| **Demo menampilkan data produksi** | **Berhenti.** Salah satu dari lima variabel `BEDA` masih bernilai produksi |

Baris terakhir itu yang paling penting. Kalau terjadi, jangan perbaiki sambil
demo tetap hidup — matikan deployment demo dulu, betulkan variabelnya, baru
nyalakan lagi.

---

## Lampiran — kalau Vercel produksi harus dibuat ulang

Tidak perlu hari ini; produksi sudah hidup. Disimpan di sini untuk keadaan
kalau project-nya kelak hilang atau dibuat ulang.

1. Vercel → **Add New** → **Project** → pilih repo ini → **Import**.
2. Framework terdeteksi Next.js sendiri. **Jangan ubah build command.**
3. **Settings → Git → Production Branch** — pastikan sesuai cabang yang Anda
   pakai untuk produksi.
4. Isi sepuluh variabel seperti Langkah 3.
5. **Settings → Domains** → tambahkan `www.berkembang.id`, lalu di Cloudflare
   arahkan CNAME `www` ke nilai yang Vercel tampilkan, dengan **DNS only**.
6. Pengalihan apex → `www` sudah diatur di Cloudflare dan tidak perlu diubah.
