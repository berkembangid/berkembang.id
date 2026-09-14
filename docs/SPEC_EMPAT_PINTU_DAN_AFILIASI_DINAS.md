# Empat pintu, satu tulang punggung izin

**Usulan desain · 12 September 2026**
Menanggapi permintaan Dinas UMKM Kota Bandung dan masukan Garly, serta memperbaiki `0076` yang sudah terpasang.

> **Satu kalimat untuk dipegang:**
> Afiliasi dinas bukan kolom di profil — ia **izin**, dengan bentuk yang sama seperti izin lembaga yang sudah kita punya: dipilih pemiliknya, bisa dicabut, dan setiap pembukaan tercatat serta terlihat olehnya.

---

## 0. Yang harus diperbaiki lebih dulu

`0076_restrict_institution_bank_except_dinas.sql` **sudah terpasang di produksi**, dan ia menentukan kewenangan seperti ini:

```sql
if lower(institution_type_value) like '%dinas%'
   or lower(institution_name_value) like '%dinas%'
   or lower(institution_type_value) like '%pemerintah%'
   or lower(institution_name_value) like '%pemerintah%' then
  is_dinas_bool := true;
end if;
```

Bila benar, lembaga itu menerima `business.name`, `profile.name` (nama pemilik), dan `business.phone` untuk **seluruh UMKM aktif** — melewati `discovery_optins`, melewati `consent_grants`, tanpa batas wilayah, dan tanpa satu baris pun masuk ke jejak akses.

Tiga hal yang salah, berurut dari yang paling serius:

| # | Masalah | Akibat |
| --- | --- | --- |
| 1 | **Kewenangan dari potongan kata pada nama.** | Lembaga bernama "Koperasi Dinas Sejahtera" lolos. Kewenangan melihat nomor telepon puluhan ribu orang seharusnya tidak pernah bergantung pada `like '%dinas%'`. |
| 2 | **Tidak ada batas wilayah.** | Dinas Kota Bandung melihat UMKM Surabaya. Tidak ada dasar kepentingan apa pun untuk itu. |
| 3 | **Tidak ada izin, tidak ada jejak.** | Pemilik tidak pernah menyetujui, tidak pernah tahu, dan tidak bisa mencabut. Ini persis paparan PDP yang hendak dihindari. |

Perbaikannya bukan menambal kondisinya, melainkan **memindahkan kewenangan ke kolom yang disetel admin dengan sengaja**. Detailnya di §5.

## 0a. Lubang kedua, yang lahir dari perbaikan lubang pertama

Ditemukan saat mengerjakan langkah 6, dan ia **kelalaian `0080` sendiri** — migrasi yang dibuat untuk
menutup §0.

`0080` menambahkan tiga kolom **kewenangan** ke `institution_entitlements`. Yang tidak diperiksa:
siapa yang boleh menulis tabel itu. Jawabannya, dari `0056`, bertahun sebelumnya:

```sql
grant update on institution_entitlements to authenticated;
policy institution_entitlements_admin_update
  using (private.institution_role(institution_id) = 'admin' or ...)
```

Admin sebuah **bank** bisa menulis barisnya sendiri. Yang bisa ia lakukan, tanpa menyentuh apa pun
selain layar biasa:

| # | Yang ia setel sendiri | Akibatnya |
| --- | --- | --- |
| 1 | `region_wide_visibility := true` | Melihat **seluruh** UMKM aktif di kotanya, melewati `discovery_optins` sama sekali. Opt-in itu satu-satunya izin pemilik untuk bisa ditemukan, dan ia menjadi tidak berarti. |
| 2 | `min_readiness_level := null` | Melebarkan kolamnya sendiri melewati batas langganannya. Patokan di `0080` membaca kolom ini — dan mematok terhadap nilai yang bisa ditulis sendiri bukan patokan. |
| 3 | `can_see_affiliated_identity := true` bersama (1) | Lembaga itu lolos syarat `region_wide_visibility` di `list_my_dinas_options()`, jadi ia **muncul sebagai pilihan “dinas pembina”** di layar Profil pemilik usaha. Pemilik yang memilihnya menyerahkan identitasnya kepada bank yang menyamar menjadi dinas. |
| 4 | `dossier_credits := 9999` | Cacat penagihan yang sudah ada sejak `0056`, terpisah dari privasi: lembaga yang bisa menambah kreditnya sendiri tidak pernah perlu membayar. |

Nomor 3 adalah lubang §0 itu sendiri, kembali lewat pintu yang lain. Dan seluruh asimetri peran di
`0070` — menyalakan butuh SUPER_ADMIN, mematikan cukup OPS — menjadi hiasan kalau subjeknya sendiri
bisa menyalakan tanpa peran apa pun.

**Pelajarannya, dan ia berlaku di luar migrasi ini:** menambahkan kolom kewenangan ke tabel yang
sudah ada bukan perubahan kecil. Yang menentukan artinya bukan kolomnya, melainkan daftar siapa yang
bisa menulisnya — dan daftar itu biasanya ditulis jauh sebelumnya, untuk kolom yang artinya sama
sekali lain. Di sini: untuk kursi dan kredit.

`0085` mencabut jalur tulis `authenticated` atas tabel itu **seluruhnya**, bukan hanya untuk tiga
kolom kewenangan, dan menggantinya dengan satu pintu yang beralasan dan tercatat. Tidak ada satu pun
layar yang kehilangan fungsi: jalur admin yang ada memakai service role, dan portal lembaga hanya
membaca tabel ini.

---

## 1. Kenapa "kolom Afiliasi" tidak cukup

Usulan awal: tambahkan kolom Afiliasi di profil UMKM, pemilik mengisi nama dinasnya, dinas hanya melihat yang terafiliasi dengannya.

Arah berpikirnya benar — **pembatas aksesnya harus berasal dari pemilik.** Yang tidak cukup adalah bentuknya, karena kolom teks tidak bisa melakukan empat hal yang justru menjadi syarat:

1. **Bukan dasar hukum.** UU PDP 27/2022 menuntut persetujuan yang eksplisit, terinformasi, spesifik, dan dapat ditarik. Kolom isian di formulir profil bukan salah satunya — pemilik mengisi nama dinasnya tanpa pernah diberi tahu apa akibatnya.
2. **Tidak bisa dicabut.** Menghapus teks tidak menghapus apa pun yang sudah dilihat, dan tidak ada tanggal berlakunya.
3. **Tidak bisa dicocokkan.** "Dinas KUMKM Bandung", "dinas umkm kota bandung", "DISKUMKM" — teks bebas berarti pencocokan dengan `ilike`, dan pencocokan `ilike` adalah masalah nomor 1 di §0 yang berulang.
4. **Tidak terlihat pemiliknya.** Layar "siapa yang bisa melihat usaha saya" tidak akan pernah menampilkannya, karena ia bukan izin — ia metadata.

**Usul: afiliasi adalah `consent_grant` dengan ruang lingkup `dinas_binaan`.** Bentuknya sudah ada di basis data ini sejak `0021`, lengkap dengan pencabutan, kedaluwarsa, dan jejak akses.

Yang berubah di layar pemilik hanya satu: di Profil ada **"Dinas pembina"** — pilihan dari daftar (bukan isian bebas), disertai kalimat yang menyebutkan akibatnya, dan tombol cabut di layar yang sama.

> "Dinas yang Anda pilih dapat melihat nama usaha, nama Anda, dan nomor kontak — supaya bisa mengundang Anda ke program pendampingan. Mereka tidak bisa melihat catatan keuangan Anda. Setiap kali mereka membuka data Anda, Anda melihatnya di riwayat akses. Bisa dicabut kapan saja."

**Nilainya untuk model bisnis:** dinas menjadi kanal akuisisi. Dinas mendaftarkan UMKM binaannya → UMKM berafiliasi → dasbor dinas terisi. Dinas punya kepentingan langsung untuk merekrut, dan itu lingkaran pertumbuhan yang tidak perlu kita bayar.

### 1.1 Menanggapi Harsya: "dibuat fieldnya di profil, jadi langsung terkategorikan"

**Harsya benar soal tampilannya, dan usul ini tidak bertabrakan dengannya.**

Yang dilihat pemilik usaha tetap **satu baris di halaman Profil** — "Dinas pembina" — persis seperti yang Harsya minta. Yang berbeda hanya apa yang tersimpan di baliknya: sebuah catatan izin bertanggal yang bisa dicabut, bukan sepotong teks.

Satu hal yang justru memperkuat usul Harsya: **teks bebas tidak pernah "langsung terkategorikan".** "Dinas KUMKM Kota Bandung", "dinas umkm bdg", dan "DISKUMKM" adalah tiga teks berbeda untuk satu dinas yang sama, dan mengelompokkannya berarti mencocokkan teks — masalah nomor 1 di §0 yang berulang. Yang benar-benar mengkategorikan adalah **pilihan dari daftar yang menunjuk ke satu `institution_id`.** Jadi sasaran Harsya tercapai justru lewat pilihan, bukan lewat isian.

**Biayanya, supaya jujur:** kolom teks selesai dalam dua jam. Catatan izin perlu satu tabel, satu fungsi tulis, dan satu tombol cabut — sekitar satu hari. Selisih setengah hari itu yang membedakan "ada dasar hukumnya" dari "tidak ada".

---

## 2. Empat pintu, satu tulang punggung

| Peran | Kolam yang terlihat | Identitas | Cara identitas terbuka |
| --- | --- | --- | --- |
| **UMKM** | miliknya | miliknya | — |
| **Dinas pembina** (mis. Dinas UMKM) | seluruh UMKM **di wilayahnya** | terafiliasi: terbuka · tidak terafiliasi: **anonim selamanya** | afiliasi (izin) dari pemiliknya |
| **Dinas pengamat** (mis. Dinas Penanaman Modal) | seluruh UMKM **di wilayahnya** | **tidak pernah, sama sekali** — hanya grafik | tidak ada. Nama muncul hanya di daftar peserta acara yang diikuti sukarela |
| **Investor / offtaker** | yang opt-in **dan** tingkat ≥ ambang | anonim | permintaan per-UMKM → izin → dossier beku |
| **Admin** | semua | metadata saja | tiket Mode Dukungan 30 menit, terlihat pemiliknya |

### 2.1 Menanggapi Garly: dinas bukan satu jenis

Masukan Garly — "dinas tuh ga dinas umkm aja, tapi dinas penanaman modal, nah itu dibuat anonim semua, cuma munculin grafik" — **membetulkan sebuah keliru dalam usul awal saya.** Saya menulis "dinas" seolah satu peran. Ternyata bukan, dan yang membedakannya bukan nama lembaganya melainkan **kepentingan sahnya**:

| Dinas | Kepentingannya | Butuh identitas? |
| --- | --- | --- |
| Dinas UMKM / Koperasi | membina UMKM **binaannya sendiri** | ya, untuk yang berafiliasi |
| Dinas Penanaman Modal | cakupan **perizinan** di kotanya | **tidak, sama sekali** |

Dinas Penanaman Modal tidak perlu tahu warung mana yang belum punya NIB. Ia perlu tahu **berapa persen** yang belum, supaya bisa menyelenggarakan layanan perizinan. Grafik sudah menjawab seluruh tugasnya.

**Penting: ini tidak menuntut mekanisme baru.** Ia setelan yang sama dengan §5 — `can_see_affiliated_identity` menyala untuk pembina, mati untuk pengamat. Bahwa masukan Garly jatuh persis ke setelan yang sudah dirancang adalah tanda arsitekturnya benar.

**Dan satu akibat yang menyenangkan:** keberatan Pak Hadi (§6) **tidak berlaku sama sekali** untuk pintu pengamat. Tidak ada identitas yang bisa dibocorkan ke bank, karena tidak ada identitas yang pernah masuk ke layarnya.

**Usul penamaan:** jangan menamai jenisnya menurut nama lembaganya (`dinas_umkm`, `dinas_penanaman_modal`), melainkan menurut **yang boleh ia lihat** — `pembina` dan `pengamat`. Dengan begitu dinas keempat atau kelima yang datang nanti tidak menuntut jalur kode baru; admin cukup memilih ia pembina atau pengamat.

Tiga hal yang membuat tabel ini bekerja:

**Dinas dibatasi wilayah, bukan "melihat semuanya".** `institutions.location` sudah ada. Satu predikat, dan paparan terbesar di §0 hilang.

**UMKM tidak terafiliasi tetap ada di angka, selamanya anonim.** Inilah bagian terkuat dari usulan Garly: dinas berhak tahu "ada 1.240 UMKM di kota ini, 18% belum pernah mencatat". Angka itu bukan data pribadi. Yang tidak boleh adalah menyentuh barisnya.

**Investor tidak butuh mekanisme baru.** Ia alur lembaga yang sudah ada, dengan kolam yang dibatasi entitlement. Lihat §4.

---

## 3. Dasbor dinas

### 3.1 Angka dulu, dan namanya bukan penghakiman

Permintaannya: "berapa persen UMKM yang sehat, bermasalah, dan sebagainya."

**Kata "sehat" dan "bermasalah" tidak boleh dipakai**, dan ini bukan kehati-hatian berlebihan — `npm run lint:terms` akan menggagalkan build-nya. Alasannya: penilaian atas sebuah usaha yang diucapkan lembaga pemerintah terbaca sebagai penilaian kelayakan, dan itu garis yang produk ini tidak boleh lewati (POJK 29/2024). Lebih penting lagi: kita **tidak mengukur kesehatan usaha.** Kita mengukur kebiasaan mencatat.

Jadi yang ditampilkan adalah keadaan operasional — fakta tentang perilaku, bukan putusan tentang usahanya:

| Keadaan | Definisi | Sudah bisa dihitung? |
| --- | --- | --- |
| Rutin mencatat | ≥ 20 hari dalam 30 hari | ✅ `0076` sudah menghitungnya |
| Mulai rutin | 8–19 hari | ✅ |
| Jarang mencatat | 1–7 hari | ✅ |
| Belum mulai | 0 hari | ✅ |

### 3.1a Menanggapi Garly: bukan hanya kebiasaan mencatat

Masukan Garly benar: "selain pencatatan kita juga kan ada penilaian di segi dokumen legalitas nya berapa persen."

**Dua sumbu, dan keduanya tidak boleh pernah dijumlahkan menjadi satu angka.** Menjumlahkannya melahirkan satu "nilai usaha" — dan satu nilai tunggal atas sebuah usaha adalah tepat yang tidak boleh produk ini keluarkan (POJK 29/2024, dan `lint:terms` yang menjaganya).

| | Sumbu 1 — kebiasaan mencatat | Sumbu 2 — kelengkapan legalitas |
| --- | --- | --- |
| Isinya | rutin · mulai rutin · jarang · belum mulai | berapa dari dokumen yang berlaku bagi sektornya |
| Sumbernya | hari mencatat dalam 30 hari | `documents` per jenis, per syarat sektor |
| Sudah ada? | ✅ `recordingActivity` | ✅ `legalComplete` + `legalEvidenceCount` |

**Dan silangkan keduanya** — di sinilah dasbor berubah dari laporan menjadi daftar kerja:

|  | Legalitas lengkap | Legalitas belum |
| --- | --- | --- |
| **Rutin mencatat** | 12% — siap naik kelas | 23% — **undang ke layanan perizinan** |
| **Jarang / belum mulai** | 8% | 31% — **undang ke pendampingan pembukuan** |

Dua kotak yang ditebalkan itu menjawab pertanyaan yang sebenarnya dibawa dinas ke rapat: *siapa yang harus saya undang ke acara apa.* Dan keduanya bisa dihitung tanpa menyentuh satu nama pun — Dinas Penanaman Modal bisa memakai tabel yang sama persis, hanya tanpa bisa mengkliknya sampai ke baris.

Keduanya sudah dihitung di `list_anonymous_business_candidates` hari ini. Yang perlu dibuat hanya agregat dan silangannya.

### 3.2 Batas sel minimum — yang belum disebut siapa pun

"Tidak terafiliasi tetap anonim" benar, tetapi **anonim akan bocor lewat penyaring.**

Kalau dinas menyaring `Kecamatan Coblong + pangan olahan + belum mulai` dan hasilnya **satu baris**, baris "anonim" itu sudah teridentifikasi — semua orang di kelurahan itu tahu warung mana. Tidak ada nama yang ditampilkan, dan identitasnya tetap terbuka.

**Aturan keras: sel minimum 5.**

- Setiap rincian atau daftar yang akan mengembalikan **kurang dari 5** baris tidak terafiliasi menampilkan "kurang dari 5 usaha" alih-alih barisnya.
- Ditegakkan **di dalam RPC**, bukan di layar. Penyaring bisa dikirim langsung ke API; aturan yang hidup di React bukan aturan.
- UMKM terafiliasi dikecualikan — identitasnya memang sudah terbuka atas izinnya sendiri.

**Koreksi setelah dikerjakan: ini BUKAN satu `having count(*) >= 5`.**

Perkiraan awal di dokumen ini keliru, dan kekeliruannya penting. Menyembunyikan
satu sel saja tidak menyembunyikan apa pun: jumlah barisnya dikurangi sel-sel
yang masih terlihat mengembalikan angkanya persis. 34 dikurangi 31 tetap 3.

Jadi aturannya bertambah satu: **setiap baris dan setiap kolom yang punya satu
sel tersembunyi diberi yang kedua** — yang anonimnya paling kecil, supaya yang
paling sedikit merugikan kegunaan. Di silangan empat × dua, satu baris hanya
berisi dua sel, jadi satu tersembunyi berarti keduanya tersembunyi. Penjaga yang
bisa dikelilingi dengan pengurangan lebih buruk daripada tidak ada penjaga,
karena ia membuat orang merasa aman.

**Dan satu batas yang disebut terus terang, bukan disembunyikan.** Fungsi ini
tidak menjanjikan kerahasiaan statistik yang lengkap. Dengan jumlah baris,
jumlah kolom, dan total kota di tangan, nilai sel yang tersembunyi masih bisa
dikurung dalam rentang sempit — yang direbut penyerang paling jauh adalah
*jumlah* usaha anonim dalam satu kelompok, bukan nama siapa pun. Garis identitas
yang sesungguhnya bukan di sini, melainkan di `list_anonymous_business_candidates`,
yang tidak pernah mengembalikan nama usaha yang tidak berafiliasi — berapa pun
jumlah selnya.

**Satu penyebut untuk satu pertanyaan.** Ringkasan mengecualikan akun demo;
daftarnya semula tidak. Kalau dibiarkan, dinas mengklik angka “14” lalu mendapat
15 baris — dan angka yang tidak cocok dengan daftarnya membuat orang berhenti
mempercayai keduanya. `0082` mengecualikan akun demo di kedua tempat, dan ambang
kedua band dipindah ke satu fungsi bersama (`private.recording_band`,
`private.legal_is_complete`) supaya keduanya tidak bisa berselisih diam-diam
pada perubahan berikutnya.

### 3.3 Klik angka → daftar

Sesuai masukan Garly: setiap persentase bisa diklik dan membuka daftarnya.

- **Terafiliasi**: nama usaha, nama pemilik, kontak, keadaan mencatat, legalitas.
- **Tidak terafiliasi**: kode kandidat, sektor, wilayah **umum** (kecamatan, bukan alamat), keadaan mencatat. Tanpa nama, tanpa kontak, selamanya — bukan "sampai diminta".
- **Tidak ada rupiah sama sekali** di kedua kolom. Isi keuangan bukan bagian dari kepentingan pembinaan, dan membukanya menuntut izin terpisah seperti lembaga lain.
- **Tidak ada nomor kontak** di kedua kolom. Itu keputusan §6.2, dan drill-down tidak boleh menjadi pengecualiannya.

### 3.3a Lubang yang ditemukan saat mengerjakan langkah 4

Sel minimum di §3.2 menjaga **angka**. Drill-down melepas **baris**. Dan banyaknya
baris adalah angka itu.

Jadi kalau drill-down melepas baris untuk sel yang jumlahnya disembunyikan
ringkasan, penjaganya batal — bukan dilemahkan, tetapi batal, lewat pintu kedua.
Contohnya persis yang ada di fixture uji: sel berisi **enam** usaha anonim tidak
sempit sama sekali, tetapi ia tersembunyi di ringkasan karena pasangan barisnya
berisi dua. Melepas keenam barisnya mengembalikan angka 6, lalu 8 dikurangi 6
tetap 2 — dan yang dilindungi sejak awal justru angka 2 itu.

**Akibatnya pada rancangan: keputusan “sel ini tersembunyi” harus SATU.** Ia
dipindah ke `private.dinas_region_cells`, dan ringkasan ditulis ulang untuk
memanggilnya. Dua salinan berarti dua jawaban, dan yang kedua akan berselisih
pada perubahan berikutnya tanpa ada yang menyadarinya. Ada penjaga migrasi yang
menolak pemasangan bila salah satu fungsi berhenti memakainya.

**Satu aturan untuk seluruh pelepasan baris:**

> Baris anonim dilepas hanya bila **setiap** sel yang diminta terlihat.

Itu menutup dua jalan sekaligus. Diklik satu sel: selnya harus terlihat. Diklik
satu band — yaitu jumlah barisnya — kedua selnya harus terlihat, karena setiap
baris yang dikembalikan memuat legalitasnya sendiri; daftar delapan baris
membocorkan belahan 2 dan 6 persis seperti angkanya.

Dan ketika tersembunyi, **jumlahnya pun tidak dilaporkan.** Menjawab “3 usaha,
barisnya tidak ditampilkan” sudah menyerahkan angka yang justru dilindungi.

**Yang terafiliasi tidak pernah ikut dibatasi,** dan uji `db:test` menunjukkan
kenapa dengan baik: usaha Bu Ani sendirian di selnya, jadi sel itu tertutup
selama ia anonim. Begitu pemiliknya memilih dinas itu sebagai pembina, yang
dilindungi sudah tidak ada lagi — anonim di sel itu menjadi **nol**, dan nol
tidak menunjuk siapa pun. Selnya terbuka dan namanya muncul, atas izinnya
sendiri.

**Drill-down hanya untuk dinas pembina.** Dinas pengamat (Penanaman Modal)
berhenti di angka: `region_wide_visibility` tanpa `can_see_affiliated_identity`.
Daftar baris anonim tidak menambah apa pun di atas angkanya bagi mereka, dan
hanya memperluas permukaan identifikasi ulang. Layar ringkasan menyembunyikan
tautannya, dan fungsinya menolak dengan `BUKAN_DINAS_PEMBINA` — karena angka
yang tampak bisa diklik lalu menolak lebih buruk daripada angka biasa.

---

## 4. Broadcast pendampingan — bagian terbaik dari usulan

Masukan Garly: kalau sebuah UMKM tidak sehat, dinas mengajukan broadcast pendampingan lewat platform, *by request*.

Ini bagian terkuat dari seluruh diskusi, karena ia menyelesaikan masalah yang sebenarnya: **dinas tidak butuh identitas untuk menolong.** Yang ia butuh adalah UMKM itu datang.

```
1. Dinas memilih kohort berdasarkan KEADAAN, bukan nama
   "jarang mencatat · pangan olahan · Kec. Coblong"  → 34 usaha

2. Dinas menulis tawarannya
   "Pendampingan pembukuan, 20 Sept, Balai Kota. Gratis."

3. Platform mengantarkannya sebagai kartu di Beranda UMKM

4. UMKM menekan "Saya ikut"
   → SAAT ITU identitasnya terbuka ke dinas, ber-lingkup, tercatat

5. Dinas melihat: 34 diundang · 11 ikut · 11 nama
```

Empat keuntungan sekaligus:

- **Izin pada saat dibutuhkan.** Tidak ada daftar nama yang dibagikan sebelum ada yang bersedia.
- **Dinas dapat KPI yang nyata**: tingkat respons undangan, bukan jumlah data yang diunduh.
- **UMKM dapat manfaat langsung**, dan itu alasan kenapa ia mau berafiliasi sejak awal.
- **Hampir tanpa mesin baru** — `notifications` dan tulang punggung izin sudah ada.

### 4.1 Menanggapi Garly: "broadcast pure aja, ada field buat ngisi pesannya, kayak Edlink"

**Setuju pada kolom pesannya** — dinas harus bisa menulis sendiri, bukan memilih dari templat. Acara perizinan, pelatihan kemasan, bantuan alat: isinya tidak bisa kita duga, dan templat akan selalu kurang.

**Satu keberatan pada kata "pure", dan bukan soal privasi.** Kalau setiap pengumuman pergi ke semua UMKM di kota, kartunya akan berhenti dibuka dalam sebulan. Itu bukan dugaan; itu yang terjadi pada setiap saluran pengumuman yang tidak disaring.

Dan penyaringnya **gratis dari sisi privasi** — menyaring berdasarkan *keadaan* (belum punya NIB, jarang mencatat) tidak menyentuh satu nama pun. Jadi tidak ada yang perlu ditukar.

**Usul: kolom pesan bebas + penyaring opsional.**

```
Kepada   : ( ) Semua UMKM di Kota Bandung          → 1.240
           (•) Yang legalitasnya belum lengkap     →   672
           ( ) Yang jarang/belum mencatat          →   381

Pesan    : [ teks bebas, ditulis dinas ]

Lampiran : tanggal · tempat · tautan pendaftaran (opsional)
```

Bawaannya "semua" supaya tetap sesederhana Edlink, tetapi dinas yang tahu sasarannya bisa mempersempit. Untuk Dinas Penanaman Modal, sasaran alaminya justru **"yang belum punya NIB"** — dan itu datang langsung dari sumbu legalitas di §3.1a. Ketiga masukan Garly menyambung satu sama lain.

### 4.2 Daftar peserta: nama muncul setelah menekan "ikut"

Ini persis usul Garly, dan ia **benar secara hukum, bukan cuma enak dipakai.** Menekan "Saya ikut" adalah peristiwa izin: pada detik itu nama pemilik dan nama usahanya masuk ke daftar peserta yang dilihat dinas.

Tiga hal yang mengikutinya:

- Tercatat sebagai izin ber-lingkup, bukan sekadar pendaftaran acara.
- **Bisa dibatalkan.** UMKM yang berubah pikiran menekan "Batal ikut", dan namanya keluar dari daftar.
- Berlaku juga untuk **dinas pengamat**. Inilah satu-satunya jalan Dinas Penanaman Modal pernah melihat sebuah nama — dan jalan itu dibuka UMKM-nya sendiri.

### 4.3 Persetujuan admin

**Setuju penuh** dengan Garly, dan polanya sudah ada di sistem ini (permintaan akses ditinjau admin lebih dulu). Ditambah kuota per periode.

Satu biaya operasional yang harus disadari sejak sekarang: persetujuan berarti **ada orang yang harus meninjau.** Broadcast yang menunggu tiga hari akan membuat dinas menyimpulkan fiturnya mati, lalu kembali menelepon satu-satu — yang justru keadaan yang mau kita hindari. Perlu SLA, sama seperti tinjauan permintaan akses di §6.7.

Yang terpasang untuk itu: antrean admin mengurutkan dari yang **paling lama menunggu**, dan umur
permintaan ditampilkan lebih menonjol daripada isinya — dengan warna yang berubah setelah dua hari.
Itu bukan SLA, tetapi ia membuat ketiadaan SLA terlihat. Yang membuat fitur ini gagal bukan
keputusan yang salah, melainkan keputusan yang tidak pernah diambil.

Satu keputusan teknis yang mengikutinya: **pengiriman terjadi di dalam fungsi tinjauan**, bukan di
pekerjaan latar. Broadcast yang berstatus “sudah disetujui” tetapi belum sampai adalah keadaan yang
tidak bisa dijelaskan kepada siapa pun — dinas melihat disetujui, UMKM tidak menerima apa-apa, dan
tidak ada yang tahu di mana ia tersangkut.

Dan satu lagi: **kohort diputuskan saat disetujui, bukan saat diminta.** Di antara keduanya ada
usaha yang mulai mencatat atau mengunggah izin. Angka yang dilihat dinas saat menulis pesannya
disimpan sebagai potret dan tidak dipakai mengirim; antrean admin menampilkan keduanya bila berbeda.

### 4.4 Pintu ketiga untuk sel minimum

`0082` menjaga **angka**. `0083` menjaga **baris**. Jumlah penerima broadcast adalah **bacaan ketiga**
atas sel yang sama — dan itu yang paling mudah terlewat, karena ia tidak terasa seperti membaca data.

Kalau dinas bisa mengirim broadcast ke satu sel lalu membaca “6 diundang”, ia mendapat angka yang
ringkasan sembunyikan; lalu 8 dikurangi 6 tetap 2, persis lubang yang §3.3a tutup. Jadi jumlah
penerima memakai keputusan yang sama. Tersembunyi berarti dinas **tetap boleh mengirim** — pesannya
sampai, dan itu gunanya — tetapi jumlahnya tidak dilaporkan kepadanya.

Aturannya dirumuskan ulang di sini, dan perumusan inilah yang benar:

> Sebuah himpunan sel boleh dihitung bila ringkasan **memang sudah** melaporkan angka himpunan itu.

Percobaan pertama memakai aturan yang lebih kasar — “tolak bila ada satu saja sel tersembunyi di
dalamnya” — dan `db:test` langsung menunjukkan kesalahannya: broadcast ke **seluruh kota** menjadi
tersembunyi, padahal total kota selalu dilaporkan ringkasan dan justru pilihan bawaannya. Aturan yang
menahan angka yang sudah terbuka tidak melindungi apa pun; ia hanya membuat fiturnya terasa rusak,
dan fitur yang terasa rusak akan dimatikan orang bersama penjaganya.

**Yang tidak tunduk pada sel minimum: jumlah dan nama peserta.** Peserta menekan “Saya ikut” — izin
yang diberikan orangnya sendiri. Prinsipnya sama dengan usaha berafiliasi: pengungkapan atas izin
tidak pernah tunduk pada aturan yang melindungi orang yang belum mengizinkan.

### 4.5 Koreksi `0083`: penyembunyian pelengkap yang merambat terlalu jauh

Uji `0084` menemukan cacat di `0083`, bukan di dirinya sendiri. `0083` menerapkan penyembunyian
pelengkap pada **setiap** baris dan kolom yang punya satu sel tersembunyi. Itu terlalu kasar: begitu
satu pemilik memberi izin afiliasi, aturan itu merambat — kolom yang jumlahnya sendiri sudah
disembunyikan tetap memaksa sel kedua ditutup, lalu barisnya, lalu sel berisi **lima** yang
seharusnya terlihat pun tertutup. Dinas kehilangan angka yang tidak melindungi siapa pun.

Sebabnya satu kalimat: penyembunyian pelengkap hanya diperlukan ketika jumlah baris atau kolomnya
**diterbitkan**. Serangannya adalah “jumlah dikurangi sel-sel yang terlihat”; kalau jumlahnya sendiri
tidak pernah keluar, tidak ada yang bisa dikurangkan.

Satu penjaga baru ikut masuk, yang `0083` lewatkan: **total kota selalu diterbitkan**, jadi kalau di
seluruh tabel hanya ada satu sel tersembunyi, ia bisa dihitung dari total dikurangi tujuh sel
lainnya. Karena itu tidak boleh pernah ada tepat satu sel tersembunyi.

**Akibatnya pada kata-kata di layar, dan ini bukan soal gaya.** Sel yang tersembunyi sebagai
pelengkap bisa bernilai apa saja — nol, atau enam. Jadi layar tidak boleh menuliskannya
“kurang dari 5”: itu benar untuk penyembunyian utama dan **salah** untuk pelengkap. Yang dipakai
sekarang adalah tanda netral tanpa menyebutkan besarannya. Membedakan kedua sebab di layar justru
membocorkan: tahu bahwa sebuah sel disembunyikan “karena kecil” sama dengan tahu isinya 1 sampai 4.
Jumlah baris dan kolom tetap boleh berbunyi “kurang dari 5”, karena marginal hanya pernah
disembunyikan oleh sebab utama.

---

## 5. Investor dan offtaker

Tidak butuh mekanisme baru sama sekali. Ia alur lembaga yang sudah berjalan:

```
opt-in pemilik → daftar anonim → permintaan ber-lingkup → tinjauan admin
→ izin pemilik → dossier BEKU + watermark + setiap pembukaan tercatat
```

Yang perlu ditambah cuma **ambang kolam**, dan ia dijadikan kolom entitlement, bukan angka di dalam kode:

```sql
alter table public.institution_entitlements
  add column min_readiness_level text,     -- mis. 'PERAK' untuk investor
  add column can_see_affiliated_identity boolean not null default false;
```

Kolom kedua itulah pengganti pencocokan `like '%dinas%'`:

| Peran | `min_readiness_level` | `can_see_affiliated_identity` |
| --- | --- | --- |
| Dinas **pembina** (UMKM/Koperasi) | `null` (semua tingkat) | **true**, dibatasi wilayah + afiliasi |
| Dinas **pengamat** (Penanaman Modal) | `null` (semua tingkat) | **false** — grafik saja |
| Bank / koperasi | `PERAK` | false |
| Investor / offtaker | `PERAK` atau `EMAS` | false |

Perhatikan baris kedua: **dinas pengamat dan bank memakai setelan identitas yang sama persis.** Yang membedakannya hanya kolam — pengamat melihat seluruh kota sebagai angka, bank hanya melihat yang opt-in dan sudah lewat ambang. Satu mekanisme, empat perilaku.

**Kewenangan berasal dari kolom yang disetel admin dengan sengaja, beralasan, dan tercatat** — mesinnya sudah ada di `0069` (`admin_action_logs`, alasan wajib, append-only). Tidak pernah lagi dari potongan kata pada sebuah nama.

### 5.1 Yang terpasang untuk itu (`0085`)

Satu pintu: `admin_set_institution_authority(lembaga, wilayah, identitas, tingkat, alasan, kuota)`.

- **Asimetri peran**, pola yang sama dengan sakelar fitur `0070`: **melonggarkan butuh SUPER_ADMIN,
  mengencangkan cukup OPS.** Arah yang aman harus selalu murah — kalau menutup kewenangan juga
  menuntut peran tertinggi, orang akan menundanya sampai besok. Melonggarkan berarti: wilayah
  dinyalakan, identitas dinyalakan, atau batas kolam diturunkan (dikosongkan adalah yang paling
  longgar, jadi peringkatnya nol).
- **Kuota broadcast sengaja di luar asimetri itu.** Ia menentukan berapa pesan yang diterima pemilik
  usaha, bukan siapa yang bisa melihat mereka; dan setiap broadcast masih ditinjau satu per satu.
  Menuntut SUPER_ADMIN untuk menaikkan kuota kota pilot dari 4 ke 5 hanya menyangkutkan pekerjaan.
- **Dua penjaga bentuk**, dan keduanya menahan lubang lama:
  - `can_see_affiliated_identity` **tidak bisa** dinyalakan tanpa `region_wide_visibility` — itu
    lubang §0 secara persis: kewenangan melihat nama tanpa kepentingan yang membatasinya.
  - `region_wide_visibility` **tidak bisa** dinyalakan sebelum `institutions.location` terisi. Ini
    mengubah kegagalan diam-diam menjadi galat yang menyebutkan apa yang harus diisi, kepada orang
    yang memang bisa mengisinya. Tanpanya dasbornya kosong dan tidak ada yang bisa menjelaskan kenapa.
- **Luas akibatnya dibaca sebelum sakelarnya ditekan.** `admin_institution_authority` mengembalikan
  berapa usaha ada di wilayah itu dan berapa yang sudah memilih lembaga ini sebagai pembina, dan
  dialog konfirmasinya menyebut angkanya: “membuka angka atas 1.240 usaha di Kota Bandung, termasuk
  yang tidak pernah mendaftar sukarela”. Sakelar yang akibatnya tidak terbaca akan ditekan karena
  ada, bukan karena diputuskan.
- **Mencabut kewenangan tidak menghapus izin pemilik.** Afiliasi yang sudah diberikan tetap tinggal
  sebagai riwayat; yang tertutup adalah layarnya. Keduanya hal berbeda — yang satu izin orang, yang
  lain setelan kita — dan menghapus izin orang karena alasan administratif menghilangkan jejak yang
  justru ia berhak tahu. Layarnya sendiri tertutup pada **panggilan berikutnya**, bukan pada sesi
  berikutnya, dan itu diuji.

Dan model bisnisnya jatuh dengan sendirinya:

| Peran | Yang dibayar | Kenapa |
| --- | --- | --- |
| Dinas | langganan kursi, atau gratis di kota pilot | Ia **kanal akuisisi**, bukan sumber pendapatan |
| Bank / investor / offtaker | kredit per dossier (`dossier_credits`, sudah ada) | Ia membayar untuk permintaan yang sudah terkurasi |

Dinas membawa pasokan, investor membayar untuk permintaan. Asimetri itu model bisnisnya.

---

## 6. "Kalau langsung dibuka, bank bisa main dengan dinas" — komentar Pak Hadi

Ini keberatan paling tajam dari seluruh diskusi, dan jawabannya harus dimulai dari satu pengakuan.

### 6.1 Batas yang tidak bisa ditembus perangkat lunak

**Begitu seorang petugas dinas melihat nama dan nomor di layarnya, tidak ada kendali teknis apa pun yang bisa menghentikannya menyalin itu ke WhatsApp.** Tidak ada. Watermark tidak, enkripsi tidak, mematikan ekspor tidak. Siapa pun yang menjanjikan sebaliknya sedang menjual sesuatu.

Jadi sasarannya **bukan** membuat kebocoran mustahil. Sasarannya empat hal yang bisa benar-benar kita kerjakan:

1. **Menghapus yang layak dibocorkan** — supaya kebocoran tidak bernilai.
2. **Membuatnya bisa dilacak** — supaya kalau terjadi, kita bisa menunjukkan siapa.
3. **Membuat penyedotan massal berisik** — supaya tidak bisa dilakukan diam-diam.
4. **Membuat pintu depan lebih murah daripada pintu belakang** — supaya bank tidak punya alasan berputar.

### 6.2 Jawaban terkuat: dinas dapat SALURAN, bukan KONTAK

Yang bank mau beli bukan nama. Yang ia mau beli adalah **prospek yang bisa dihubungi dan sudah tersaring.** Nama tanpa nomor telepon nilainya mendekati nol — bank bisa mendapatkannya dari survei pasar biasa.

Maka: **dinas tidak pernah melihat nomor telepon, surel, atau alamat lengkap.**

| Dinas melihat | Dinas tidak melihat |
| --- | --- |
| Nama usaha, nama pemilik | Nomor telepon, surel |
| Kecamatan | Alamat lengkap |
| Keadaan mencatat, legalitas lengkap/belum | Rupiah apa pun, dokumen apa pun, dossier |

Cara menghubungi: **lewat platform** (§4). Dinas menulis undangan, platform yang mengantarkan, UMKM yang memutuskan menjawab.

Dan dinas tidak kehilangan apa pun yang benar-benar ia butuhkan — pekerjaannya pembinaan, yang berjalan lewat program, bukan lewat telepon satu-satu.

> **Ini perubahan konkret pada `0076`.** Fungsi itu sekarang mengembalikan `business.phone` sebagai `contactPhone` untuk dinas. Kolom itu harus dicabut.

### 6.3 Yang paling bernilai memang tidak bisa dibocorkan dinas

Aset yang sesungguhnya bukan identitas, melainkan **dossier**: catatan keuangan beku, ber-SAK EMKM, bernomor dokumen, yang bisa dimasukkan bank ke berkas kreditnya dan dipertanggungjawabkan ke auditornya sendiri.

Dossier itu **hanya lahir dari izin pemiliknya.** Dinas tidak memilikinya, tidak bisa melihatnya, dan tidak bisa menerbitkannya.

Jadi seandainya seorang petugas membocorkan seribu nama, bank tetap tidak punya satu pun berkas yang bisa ia arsipkan. Ia masih harus datang ke pintu depan. **Kebocoran nama tidak memotong jalan bank sama sekali** — ia hanya memindahkan pekerjaan akuisisi, yang memang sudah pekerjaannya.

### 6.4 Membuatnya bisa dilacak: jejak yang dilihat pemilik, dan baris penanda

**Jejak yang dilihat pemilik.** Setiap pembukaan identitas tercatat: anggota dinas mana, UMKM mana, kapan. Pemilik usaha melihatnya di riwayat aksesnya. Kalau sebuah UMKM mulai ditelepon bank, kita bisa menelusuri: anggota dinas mana yang membuka profil itu belakangan ini. Itu jejak penyelidikan yang nyata, bukan dugaan.

**Baris penanda (canary).** Beberapa "UMKM" sintetis yang hanya terlihat oleh satu dinas tertentu, dan tidak pernah ikut dalam agregat mana pun — polanya sama dengan pengecualian `demo_accounts` yang sudah ada. Kalau suatu hari ada bank yang mengajukan permintaan atas salah satu baris penanda itu, kebocorannya **terbukti dan sumbernya tertunjuk.**

Ini jawaban jujur atas pertanyaan yang selalu menyusul: "kalau bocor, memangnya kita tahu dari mana?"

### 6.5 Membuat penyedotan massal berisik

Dinas yang benar-benar membina membuka mungkin beberapa lusin profil sepekan. Dinas yang menyedot membuka ratusan dalam sejam. Polanya sangat berbeda, dan itu bisa dideteksi:

- **Batas harian** pembukaan identitas per anggota dan per lembaga.
- **Lampu anomali di Ruang Mesin**: jumlah pembukaan per lembaga per hari, dibandingkan kebiasaannya sendiri. Melonjak → admin memeriksa.
- Pembukaan berurutan dan cepat adalah tanda tangan penyedotan; itu terlihat.

Penyedotan berubah dari tak terlihat menjadi terdengar.

### 6.6 Pemisahan peran

- Satu lembaga punya **satu jenis**: `dinas` **atau** `bank`. Tidak pernah keduanya (§5).
- Satu akun tidak boleh menjadi anggota aktif lembaga berjenis `dinas` **dan** `bank`/`investor`/`offtaker` sekaligus. Penjaga di basis data pada `institution_members`.

Ini mematikan versi kongkalikong yang paling malas: satu orang memakai dua topi.

*Keputusan kebijakan:* batasan ini sengaja hanya untuk pasangan dinas↔pemberi dana. Universitas yang juga menasihati bank tidak punya benturan yang sama.

### 6.7 Pintu depan dibuat lebih murah daripada pintu belakang

Ini jawaban paling tahan lama, dan ia komersial, bukan teknis:

| | Lewat pintu depan | Lewat kebocoran |
| --- | --- | --- |
| Yang didapat bank | Dossier beku, bernomor, bisa masuk berkas kredit | Nama, tanpa kontak, tanpa berkas |
| Bisa dipertanggungjawabkan ke auditor bank? | Ya | Tidak |
| Paparan hukum bank (PDP) | Nol — ada izin tertulis | Penuh |
| Biayanya | Kredit dossier | "Gratis", lalu risiko sanksi |

Kebocoran **hampir tidak menghemat apa pun** bagi bank, sementara paparan hukumnya penuh. Asimetri itulah penggentar yang sebenarnya — bukan watermark.

Konsekuensinya untuk kita: **jalur resmi harus cepat dan murah.** Permintaan yang ditinjau berhari-hari adalah alasan orang mencari jalan pintas. Tinjauan admin perlu SLA.

### 6.8 Perjanjian dan akibatnya

- Dinas menandatangani perjanjian pemrosesan data: tanpa pengalihan lanjutan, tujuan tertulis (pembinaan), dan hak audit di pihak kami.
- Platform bisa menonaktifkan sebuah lembaga dengan alasan tercatat — mesinnya sudah ada (`set_institution_active`, `admin_action_logs`).
- Karena pemilik usaha melihat sendiri siapa yang membuka datanya, **ia menjadi pihak dalam penegakan**, bukan penonton.

### 6.9 Ringkasnya, untuk dijawab ke Pak Hadi

> Kita tidak bisa mencegah seorang petugas menyalin nama ke WhatsApp, dan tidak ada platform yang bisa. Yang kita lakukan: **dinas tidak pernah memegang nomor teleponnya** — ia hanya bisa mengundang lewat platform. **Dossier tidak pernah bisa ia terbitkan** — hanya izin pemilik yang bisa. Jadi yang bisa bocor cuma nama tanpa kontak, yang tidak memotong satu langkah pun bagi bank. Dan kalau tetap bocor: setiap pembukaan tercatat dan dilihat pemiliknya, ada baris penanda yang membuktikan sumbernya, dan lembaganya bisa dinonaktifkan.

---

## 7. Ekspor

| Yang diekspor | Boleh? | Bentuk |
| --- | --- | --- |
| Agregat (persentase, jumlah per keadaan) | ✅ | CSV. Bukan data pribadi. |
| Daftar terafiliasi | ✅ | PDF ber-watermark, bernomor, unduhan tercatat |
| Daftar tidak terafiliasi | ❌ | Tidak ada bentuk apa pun |
| Isi keuangan per UMKM | ❌ dari pintu dinas | Hanya lewat jalur izin seperti lembaga lain |

Satu hal yang harus dikatakan terus terang, terutama ke dinas: **watermark menggentarkan, bukan mencegah.** Satu tangkapan layar mengalahkan watermark apa pun, dan menjualnya sebagai keamanan adalah janji yang tidak bisa kita tepati. Pengaman yang sebenarnya ada di tempat lain, dan ia sudah ada: **setiap pembukaan tercatat, dan pemilik usahanya melihat catatan itu.** Orang berhati-hati bukan karena berkasnya ditandai, melainkan karena ada yang tahu ia membukanya.

---

## 8. Urutan kerja

| # | Isi | Kenapa lebih dulu |
| --- | --- | --- |
| **1** ✅ | Ganti pencocokan `like '%dinas%'` dengan `institution_entitlements.can_see_affiliated_identity` + batas wilayah, **dan cabut `contactPhone`** | Ini **memperbaiki paparan yang sedang berjalan**, bukan menambah fitur. Pencabutan nomor telepon (§6.2) ikut di sini karena ia menyentuh fungsi yang sama |
| **2** ✅ | Izin afiliasi + layar "Dinas pembina" di Profil UMKM + tombol cabut | Tanpa ini, kolam terafiliasi selalu kosong |
| **3** ✅ | Agregat dua sumbu + silangannya + sel minimum 5 | Yang diminta dinas, dan batasnya lahir bersamaan — bukan ditambal setelah. Ini juga **seluruh** kebutuhan dinas pengamat: setelah langkah ini, Dinas Penanaman Modal sudah bisa dilayani penuh |
| **4** ✅ | Klik angka → daftar dua kolom (terafiliasi / anonim), khusus dinas pembina | |
| **5** ✅ | Broadcast: kolom pesan + penyaring opsional + persetujuan admin + daftar peserta | Bagian yang mengubah privasi menjadi fitur |
| **6** ✅ | `min_readiness_level` untuk kolam investor | Ia hanya menyempitkan yang sudah jalan — tetapi memeriksa SIAPA yang bisa menulis kolomnya memunculkan lubang yang lebih besar daripada langkahnya sendiri; lihat §0a |

Langkah 1 layak dikerjakan **hari ini** dan berdiri sendiri walau sisanya ditunda.

### Sudah terpasang di kode (belum di produksi)

| Migrasi | Isi |
| --- | --- |
| `0080_kewenangan_dinas_dari_kolom_bukan_nama.sql` | Tiga kolom kewenangan, batas wilayah, `contactPhone` dicabut, tabel afiliasi (lahir kosong), penjaga yang membaca teks sumber fungsinya sendiri |
| `0081_afiliasi_dinas_diberikan_pemilik.sql` | `list_my_dinas_options` · `set_my_dinas_affiliation` · `revoke_my_dinas_affiliation`, semuanya tercatat di `audit_events` |
| `0082_ringkasan_wilayah_dinas.sql` | `dinas_region_summary()`, ambang band dipindah ke `private.recording_band` / `private.legal_is_complete` / `private.min_cell_size` supaya ringkasan dan daftar tidak bisa berselisih, dan `list_my_institutions` menyebutkan `regionWide` |
| `0083_klik_angka_jadi_daftar.sql` | `private.dinas_region_cells` — keputusan penyembunyian dipindah ke satu tempat supaya ringkasan dan drill-down tidak bisa berselisih; `dinas_region_drilldown`; `list_my_institutions` menyebutkan `canSeeIdentity` |
| `0084_broadcast_pendampingan.sql` | `dinas_broadcasts` · `dinas_broadcast_recipients` · `dinas_broadcast_participants`; `private.dinas_cohort` (satu definisi untuk pratinjau dan pengiriman) · `private.dinas_cohort_countable` (pintu ketiga); kuota bulanan; dan **koreksi `0083`** pada penyembunyian pelengkap |
| `0085_kewenangan_disetel_admin_bukan_subjeknya.sql` | Mencabut jalur tulis lembaga atas `institution_entitlements`; `admin_set_institution_authority` (asimetri SUPER_ADMIN/OPS, alasan wajib, tercatat) · `admin_institution_authority` (luas akibat sebelum sakelarnya ditekan) |

Layarnya: `components/warung/DinasAffiliationCard.tsx`, dipasang di atas formulir
halaman Profil — bukan di dalamnya, karena ia izin yang berlaku saat ditekan,
bukan bidang yang ikut tersimpan bersama profil.

**Penyimpangan dari §1:** afiliasi memakai tabelnya sendiri, bukan
`consent_grants`. Kolom `request_id` di tabel itu wajib dan menunjuk ke
`dossier_requests`; memakainya berarti memalsukan permintaan dossier untuk
setiap afiliasi, dan antrean tinjauan admin akan terisi permintaan hantu.
Sifat yang penting tetap sama: dipilih pemiliknya, bisa dicabut, riwayatnya
tersimpan, setiap pemberian dan pencabutan tercatat.

**Layar ringkasan:** `app/(dashboard)/institusi/wilayah/page.tsx`, muncul di menu
samping hanya bagi lembaga yang `regionWide`-nya benar. Menu yang menjanjikan
layar lalu menjawab 403 lebih buruk daripada menu yang tidak ada — jadi itemnya
disaring, bukan dinonaktifkan. Jawaban “lembaga ini berwilayah atau tidak”
ditambahkan ke `list_my_institutions`, fungsi yang memang sudah menjawab
“lembaga apa ini”, bukan lewat permintaan kedua ke endpoint ringkasan.

Satu kekecualian yang disengaja: menunya tetap muncul walau
`institutions.location` masih kosong. Di layar itulah tertulis “wilayah kerja
lembaga belum diisi”, dan menyembunyikan menunya membuat satu-satunya orang yang
bisa melaporkan masalah itu tidak pernah melihat masalahnya. Layar itu juga
membedakan “wilayah belum diisi” dari “kota ini memang kosong” — dasbor yang
menampilkan nol untuk keduanya membuat pengelola mengira platformnya kosong.

**Dinas Penanaman Modal sudah bisa dilayani penuh** sesudah ini: layar itu tidak
memuat satu pun nama usaha, nama pemilik, atau angka rupiah, jadi tidak ada dasar
hukum tambahan yang perlu diminta untuk membukanya.

**Pembuktian di `db:test`,** termasuk yang paling penting: fixture-nya
memuat lembaga bernama "Koperasi Dinas Sejahtera" — namanya memuat "dinas",
jenisnya bank. Di `0076` ia menerima nama, nama pemilik, dan nomor telepon
seluruh UMKM aktif se-Indonesia. Sekarang ia menerima nol.

Dan untuk `0082`, yang paling menentukan: fixture-nya menaruh **enam** usaha di
satu sel yang pasangan barisnya hanya berisi **dua**. Sel berisi enam itu tidak
sempit; ia tetap harus tertutup, semata karena pasangannya sempit. Tanpa aturan
itu, 8 dikurangi 6 tetap 2. Diuji juga: sel selebar lima melaporkan jumlahnya,
sel kosong tetap melaporkan nol (ketiadaan tidak menunjuk siapa pun), penyebut
ringkasan sama dengan penyebut daftar, dan band di daftar dihitung dengan ambang
yang sama seperti di ringkasan.

---

## 9. Yang perlu diputuskan manusia, bukan saya

1. **Ambang sel minimum 5** — angka lazim, tetapi ini keputusan kebijakan. Kalau dinas menolak, tawarkan 3 dengan catatan risikonya.
2. **Apakah dinas berbayar** di luar kota pilot. Saya mengusulkan gratis sebagai kanal akuisisi; itu keputusan bisnis.
3. **Wilayah dinas** diambil dari `institutions.location` yang sekarang teks bebas. Untuk dibatasi dengan benar ia perlu kode wilayah (kode Kemendagri), dan itu pekerjaan tersendiri.
4. **Satu UMKM, berapa dinas?** Usul: satu dinas pembina aktif pada satu waktu, riwayat disimpan. Lebih dari satu membuat "siapa yang boleh melihat" sulit dijelaskan ke pemiliknya.
5. **Batas harian pembukaan identitas** (§6.5). Saya tidak tahu berapa profil yang dibuka petugas pembinaan dalam sehari — angkanya harus datang dari dinas sendiri, bukan dari saya. Mulai longgar, perketat setelah sebulan melihat kebiasaannya.
6. **Baris penanda** (§6.4) perlu disetujui sebagai kebijakan lebih dulu. Ia menaruh data sintetis di produksi, dan siapa pun yang menemukannya tanpa tahu alasannya akan mengira basis datanya kotor.
