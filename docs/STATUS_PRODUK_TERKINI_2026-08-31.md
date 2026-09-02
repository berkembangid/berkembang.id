# Status Produk Terkini BERKEMBANG.ID

Tanggal audit: 31 Agustus 2026; diperbarui 1 September 2026 (Asia/Jakarta)  
Commit yang diperiksa: `f2548ab` (`fix(db): perbaiki function capture roleless yang broken di migration 0027`)  
Lingkup: kondisi repository setelah pembaruan terbaru, bukan hanya klaim proposal atau handoff lama.

## 1. Ringkasan eksekutif

BERKEMBANG.ID saat ini adalah aplikasi web pendamping UMKM untuk membangun **Kesiapan Data Usaha**. Produk membantu pemilik usaha:

1. mencatat pemasukan dan pengeluaran melalui suara atau teks;
2. memeriksa hasil pembacaan AI sebelum menyimpannya;
3. menyimpan dan membaca dokumen usaha secara privat;
4. mengonfirmasi hasil OCR tanpa menyebutnya sebagai verifikasi keaslian;
5. melihat buku kas, laporan, dan tutup kas harian;
6. melihat nilai kesiapan berbasis bukti serta misi perbaikan;
7. memberikan izin terbatas kepada institusi untuk melihat ringkasan profil usaha.

Fondasi MVP utama sudah tersedia di repository: autentikasi, database, RLS, penyimpanan privat, lifecycle AI, audit, idempotensi, portal UMKM, portal institusi, dan portal admin. Kesalahan sintaks migrasi `0028` yang ditemukan saat audit sudah diperbaiki pada working tree tanggal 1 September 2026 dan dilindungi regression test. Repository tetap **belum layak langsung disebut release-ready** sampai fresh database test, lint, dan verifikasi migration history remote selesai.

Kesimpulan singkat:

| Area | Status saat ini |
| --- | --- |
| Alur utama UMKM | Sudah dibangun dan sebagian besar memakai data nyata |
| Voice-to-ledger | Sudah dibangun; perbaikan `0028` lulus contract test, fresh database test masih diperlukan |
| Dokumen privat dan OCR | Sudah dibangun; OCR PDF belum tersedia dengan konfigurasi provider saat ini |
| Buku kas dan laporan | Sudah dibangun dengan transaksi terkonfirmasi |
| Kesiapan Data Usaha dan misi | Sudah dibangun dengan mesin aturan transparan |
| Izin akses institusi | Sudah dibangun secara granular dan auditable |
| Admin | CRUD/operasi utama tersedia; sebagian analytics masih simulasi |
| RAG, vector database, XGBoost, multi-agent | Belum diimplementasikan; masih target proposal |
| Microservices terpisah | Belum; aplikasi sekarang modular monolith |
| Chatbot/AI Copilot | Tidak aktif; route diarahkan kembali ke beranda |
| Kesiapan deployment terbaru | Database percobaan sinkron `0001–0028`; regression test aplikasi masih diperlukan |

## 2. Posisi produk yang benar

BERKEMBANG.ID bukan bank, bukan pemberi pinjaman, bukan biro kredit, dan tidak mengambil keputusan kredit. Posisi produk MVP yang paling aman dan sesuai implementasi adalah:

> Pendamping UMKM untuk membentuk catatan usaha, melengkapi bukti, memahami kekurangan data, dan membagikan ringkasan yang disetujui kepada institusi.

Istilah yang digunakan dalam produk:

| Hindari | Gunakan |
| --- | --- |
| Skor kelayakan kredit | Nilai Kesiapan Data Usaha |
| AI memverifikasi dokumen | AI membaca dan menyiapkan data untuk diperiksa |
| Dokumen otomatis terverifikasi | Data dokumen berhasil dibaca dan dikonfirmasi pemilik |
| Pasti diterima pembiayaan | Membantu menyiapkan data sebelum menghubungi lembaga pembiayaan |
| AI menyimpan transaksi | AI menyiapkan draft; pemilik memeriksa dan menyimpan |

Keputusan pembiayaan tetap sepenuhnya berada pada lembaga pembiayaan. Konfirmasi pemilik juga bukan bukti keaslian dokumen.

## 3. Pengguna dan portal

### 3.1 Pelaku UMKM

Portal utama berada di `/umkm`. Untuk pengalaman sederhana, akun UMKM diperlakukan sebagai usaha mandiri satu pemilik. Pembaruan `0024–0028` menambahkan pemulihan dan auto-provision agar akun UMKM lama maupun baru tidak berhenti hanya karena baris membership belum terbentuk.

### 3.2 Institusi

Portal berada di `/institusi`. Institusi dapat mencari kandidat anonim, mengirim permintaan akses, lalu membuka hanya bagian profil yang disetujui pemilik dan masih berada dalam masa berlaku.

### 3.3 Admin platform

Portal berada di `/admin`. Authority admin berasal dari tabel `platform_admins`, bukan pilihan tab login atau metadata browser. Operasi istimewa dijalankan melalui endpoint server.

## 4. Fitur UMKM yang tersedia

### 4.1 Pendaftaran, login, dan pemulihan akun

Tersedia:

- pendaftaran UMKM dan institusi melalui Supabase Auth;
- login email dan kata sandi;
- bootstrap profil setelah sesi tersedia;
- pembuatan otomatis entitas usaha untuk akun UMKM;
- redirect portal berdasarkan authority database;
- pemulihan akun UMKM lama yang belum memiliki membership internal.

Catatan:

- UMKM sengaja dibuat sederhana tanpa istilah role di UI;
- institusi dan admin tetap menggunakan membership/authority server;
- verifikasi kelayakan institusi sebagai organisasi terpercaya belum menjadi onboarding terpisah yang matang. Saat ini bootstrap institusi dapat membuat institusi aktif, sehingga ini perlu diperketat sebelum menerima institusi publik tanpa kurasi.

### 4.2 Beranda UMKM

Beranda `/umkm` menampilkan data nyata dari beberapa sumber:

- ringkasan transaksi hari ini;
- nilai Kesiapan Data Usaha terbaru;
- misi prioritas;
- catatan suara yang perlu diperiksa, gagal, atau masih diproses;
- dokumen yang sedang dibaca atau perlu diganti;
- permintaan akses institusi yang menunggu keputusan;
- aktivitas terbaru dari transaksi, dokumen, dan snapshot kesiapan.

Beranda tidak lagi bergantung pada daftar aktivitas finansial buatan.

### 4.3 Catat transaksi dengan suara atau teks

Halaman `/umkm/catat` mendukung dua cara input:

- rekam suara melalui browser;
- tulis transaksi secara manual dengan bahasa sehari-hari.

Lifecycle yang disimpan di database:

```text
draft -> queued -> processing -> needs_review -> confirmed
                                  |
                                  +-> failed

draft/queued/processing/needs_review/failed -> cancelled
```

Alur suara:

1. browser merekam audio;
2. server membuat capture dan path privat;
3. browser mengunggah audio dengan signed upload token;
4. worker mentranskripsikan audio;
5. AI mengekstrak jenis transaksi, nominal, tanggal, kategori, kuantitas, dan informasi pendukung;
6. hasil tampil sebagai draft;
7. pemilik memeriksa, mengoreksi, atau menghapus item;
8. transaksi baru masuk buku kas setelah tombol konfirmasi ditekan.

Pengamanan:

- MIME audio dibatasi ke WebM, MP4, OGG, atau MP3;
- batas audio 10 MiB;
- tidak ada nominal fallback atau transaksi fiktif saat AI gagal;
- maksimal tiga attempt provider;
- timeout, retry, fallback provider, dan circuit breaker tersedia;
- satu capture tidak dapat menghasilkan transaksi ganda;
- konfirmasi dijalankan atomik di database;
- audio dibersihkan setelah sukses atau gagal terminal;
- audio dan transkrip mentah tidak dimasukkan ke audit log.

Provider yang terdeteksi pada environment lokal saat audit:

| Provider | Konfigurasi |
| --- | --- |
| Groq | Aktif |
| OpenAI | Tidak diisi |
| Gemini | Tidak diisi |

Dengan konfigurasi tersebut, jalur utama memakai Groq Whisper untuk suara dan model Groq untuk ekstraksi transaksi.

Status khusus setelah pull:

- kode aplikasi sudah menjalankan worker sebelum endpoint proses selesai agar job tidak tertinggal pada callback serverless;
- migrasi `0028` memperbaiki function capture roleless dari `0027`;
- push pertama `0028` gagal karena penutup `)` hilang sebelum `returning * into v_job`;
- penutup tersebut sudah ditambahkan dan integration test khusus sekarang memastikan blok `VALUES` ditutup sebelum `RETURNING`.

### 4.3.1 Parser nominal deterministik dan router dua jalur — Tahap V-A (2 September 2026)

Migrasi `0039_capture_text_only_path.sql`, paket `modules/nominal-parser`, modul `modules/ledger/capture-routing.ts`.

**Kalimat yang menjelaskan seluruhnya.** Suara bukan fitur transkripsi. Suara adalah cara tercepat menghasilkan satu baris jurnal yang benar, dan metrik utamanya bukan word error rate melainkan persen ucapan yang dikonfirmasi tanpa diedit.

**Angka hanya lahir dari parser.** Ini keputusan yang menahan seluruh fitur. Model bahasa tidak pernah menghasilkan, memperbaiki, atau membulatkan nominal — tugasnya paling jauh menebak kategori 1–10. `parseLlmCategory` menolak keras payload model yang memuat medan berbau nominal dan menghitung pelanggarannya; targetnya nol, selamanya. Dan karena jalur yang justru melewati model adalah jalur Whisper, `capture-amount-guard.ts` membaca ulang transkrip dengan parser dan **menimpa** setiap nominal yang dikembalikan model. Tanpa itu, aturannya hanya berlaku di tempat yang paling tidak membutuhkannya.

**Yang sekarang berjalan:**

- **`modules/nominal-parser`** — TypeScript murni, tanpa dependensi runtime, tanpa jaringan, tanpa basis data. Kesebelas aturan spek Bagian 3.1: kata bilangan penuh, campuran digit, prefiks se-, desimal lokal, slang, ambiguitas dua kandidat, fuzzy Levenshtein, multi-transaksi, tanggal relatif Asia/Jakarta, satuan kuantitas, dan larangan nol/negatif. Seluruh kosakata ditulis sebagai konstanta terekspor, bukan regex yang tersebar, sehingga slang daerah dapat ditambah tanpa menyentuh logika. **168 uji**, termasuk property test untuk kapitalisasi, spasi ganda, tanda baca, dan determinisme.
- **Router dua jalur** di `POST /api/v1/captures`. Transkrip peramban berkeyakinan ≥ ambang **dan** memuat nominal → diproses sebagai teks: tanpa unggah audio, tanpa Whisper. Selain itu → audio ke Whisper lewat jalur yang sudah ada. Ambangnya `VOICE_CLIENT_TRANSCRIPT_MIN_CONF` (bawaan 0,85), konfigurasi bukan konstanta.
- **Gating tiga tingkat** dan **maksimal satu pertanyaan** per respons. Tidak pernah ada tingkat yang menyimpan otomatis.
- **Jalur ketik memakai router yang sama** (`engine: "typed"`, keyakinan penuh), sehingga pemilik tanpa mikrofon mendapat perilaku yang persis sama — dan itulah jalur yang dipakai demo.
- **Kartu draf menyorot buktinya**: kata yang menghasilkan nominal dan kata yang memicu kategori ditandai di transkripnya. Pemilik melihat *kenapa* sistem menebak, bukan hanya bahwa ia menebak.
- **`client_hints` tidak pernah dipercaya** — hanya dibandingkan untuk telemetry divergensi. Klien bisa dimodifikasi; angka yang masuk pembukuan tidak boleh berasal dari sana.
- **Anggaran bundel** dijaga `npm run check:voice-bundle`: batas atas 5.875 B gzip, 38% dari 15 KB.

**Tiga kerusakan yang ditemukan rangkaian uji, bukan dugaan:**

1. **`"barang lama"` menghasilkan nominal Rp5.000** — "lama" berjarak satu huruf dari "lima". **`"hari rabu"` kehilangan tanggalnya** — "rabu" berjarak satu huruf dari "satu". Keduanya lolos penjagaan panjang kata dan daftar kata terlindungi. Perbaikannya bukan menambah kata ke daftar, melainkan mempersempit kapan fuzzy boleh bekerja: hanya di dalam ungkapan angka yang sudah berjalan. Yang membedakan angka dari kata biasa bukan ejaannya, melainkan tetangganya.
2. **`"dua juta tiga ratus"` menghasilkan 2.000.300**, bukan 2.300.000. Kelompok yang menggantung setelah skala besar mewarisi skala satu tingkat di bawahnya. Salahnya seribu kali lipat, pada ucapan yang justru paling lazim di warung.
3. **Worker menolak setiap capture bermetode `voice` tanpa audio** — benar sampai jalur TEXT_ONLY ada, dan salah sesudahnya, karena itu justru bentuk capture yang dihasilkan jalur baru.

**Migrasi `0039` melonggarkan satu asumsi yang sudah tidak benar.** Basis data memegang keyakinan bahwa capture bermetode `voice` pasti punya audio. Sekarang `voice` sah dengan audio **atau** transkrip, `source_text` disimpan untuk keduanya, `storage_path` hanya dibuat bila audionya memang akan diunggah, dan kolom `capture_path` membuat rasio TEXT_ONLY — metrik Bagian 7 spek — benar-benar dapat dihitung, bukan ditaksir dari log.

**Yang BELUM diverifikasi.** Uji Playwright lima skenario ketik sudah ditulis (`tests/e2e/voice-typed-capture.spec.ts`) tetapi **belum pernah dijalankan**: ia menuntut aplikasi berjalan beserta `PLAYWRIGHT_BASE_URL`/`E2E_EMAIL`/`E2E_PASSWORD`, dan basis data yang sudah dimigrasi sampai `0039` — sementara remote masih di `0031`. Yang sudah terverifikasi penuh: parser (168 uji), router dan gating (44 uji), sorotan bukti (7 uji), dan seluruh migrasi terhadap PostgreSQL sungguhan.

**Yang ditunda ke Tahap V-B:** `SpeechRecognition`, caption interim, chip nominal langsung, `MediaRecorder` paralel, deteksi kemampuan perangkat, antrean luring IndexedDB, dan toggle caption beserta penjelasan privasinya. **Tahap V-C:** golden set 300 ucapan di CI, penyetelan ambang, slang daerah, dan prior "lima ratus" berbasis data pilot — bukan tebakan.

### 4.4 Buku Kas dan Laporan

Halaman `/umkm/laporan` menyediakan:

- daftar transaksi terkonfirmasi;
- filter hari ini, tujuh hari, bulan ini, atau rentang tanggal;
- total pemasukan, pengeluaran, selisih, dan hari aktif;
- distribusi berdasarkan kategori dan cara pembayaran;
- input transaksi manual;
- koreksi transaksi dengan alasan;
- pembatalan transaksi tanpa hard delete;
- tutup kas harian;
- ekspor CSV yang diamankan dari formula spreadsheet.

Aturan penting:

- transaksi berstatus batal tetap menjadi riwayat tetapi tidak dihitung pada total;
- transaksi tidak dapat diedit setelah tanggalnya ditutup;
- pembatalan masih dapat dilakukan dengan alasan agar koreksi operasional tetap tersedia;
- batas hari mengikuti zona waktu Asia/Jakarta;
- nominal disimpan sebagai bilangan rupiah bulat.

### 4.4.1 Mesin jurnal SAK EMKM — Tahap A (1 September 2026)

Migrasi `0029_accounting_journal_foundation.sql` menambahkan mesin pembukuan ganda di belakang buku kas yang sudah ada. Pemilik usaha tetap menjawab satu pertanyaan, "uang ini untuk apa"; sistem yang menyusun jurnalnya.

Yang sudah berjalan:

- **Sepuluh kategori bahasa warung** (Laku/Jualan, Pemasukan lain, Piutang dibayar, Modal masuk, Pinjaman masuk, Belanja bahan, Biaya usaha dengan sembilan sub-biaya, Bayar utang/cicilan, Beli alat, Ambil untuk rumah, Ngutangin pelanggan) tersimpan sebagai tabel `category_templates`, bukan sebagai prompt.
- **Bagan akun SAK EMKM versi mikro** 28 akun (`coa_accounts`, kode 1100–5400).
- **Jurnal ganda** `journal_entries` + `journal_lines`. Trigger menolak entry yang tidak seimbang atau berbaris kurang dari dua, dan menolak setiap UPDATE/DELETE. Koreksi dan pembatalan menghasilkan jurnal pembalik bertanggal hari posting, bukan mengubah jurnal lama.
- **Posting dalam transaksi database yang sama** dengan konfirmasi: `create_ledger_transaction`, `update_ledger_transaction`, `cancel_ledger_transaction`, dan `confirm_transaction_capture` memanggil `fn_post_transaction_journal`.
- **Pemisahan bunga** pada kategori 7: pokok masuk ke akun utang, bunga ke `5310`.
- **Backfill** semua transaksi lama: uang masuk jadi kategori 1, uang keluar jadi kategori 6 sub-biaya `5290`, keduanya ditandai `needs_reclass`. Migrasi membatalkan dirinya sendiri kalau total per arah bergeser, ada transaksi yang tidak terposting, atau ada entry yang tidak seimbang.
- **Laporan**: `v_general_ledger`, `fn_trial_balance`, `fn_income_statement`, `fn_warung_monthly` — semuanya `security invoker` sehingga tunduk RLS.
- **Mode Warung** di `/umkm/laporan` tab "Bulan Ini": empat kotak (Uang masuk dari jualan · Belanja & biaya · Untung bersih · Diambil untuk rumah), satu kalimat interpretasi berbasis aturan (bukan model bahasa), grafik untung enam bulan, perbandingan dengan bulan lalu, dan daftar pelanggan yang belum bayar.
- **Layar konfirmasi** menampilkan chip kategori bahasa warung, chip sub-biaya yang muncul hanya untuk kategori 6, kolom nama pelanggan untuk piutang, dan kolom bunga untuk cicilan.
- **Kartu beranda** "X catatan lama perlu dicek kategorinya" dengan pembetulan satu ketuk.
- **Lint kata terlarang** (`npm run lint:terms`) menggagalkan build kalau bahasa penilaian kelayakan pinjaman muncul di antarmuka, laporan, atau pesan error.

Tiga perbaikan yang ikut dibawa karena alur konfirmasi berdiri di atasnya:

1. `confirm_transaction_capture` versi `0027` menulis empat kolom yang tidak ada di skema — `transactions.profile_id`, `transactions.capture_item_index`, `transaction_captures.draft_items`, dan `ai_jobs.result` — sehingga gagal 42703 saat dijalankan, dan memakai nilai `category_group` (`cogs`, `operations`, `wages`) di luar CHECK constraint `0021`. Fungsi itu ditulis ulang di atas skema yang sebenarnya. Artinya alur konfirmasi capture memang belum pernah berhasil sejak `0027`.
2. Daftar `categoryCode` aplikasi (`sales`, `materials`, `payroll`) sebelumnya ditolak fungsi basis data. Sekarang diterima.
3. Tabel akuntansi baru memakai helper isolasi ketat `private.accounting_business_access()`, bukan `private.business_role()`.

Enam kerusakan lain yang ditemukan setelah `npm run db:test` akhirnya bisa dijalankan diperbaiki di `0030_restore_business_isolation.sql`; lihat Bagian 10.3.

Yang **belum** dikerjakan dan menunggu Tahap B:

- wizard saldo awal enam pertanyaan;
- register alat usaha, penyusutan bulanan otomatis, register pinjaman;
- hitung stok akhir bulan dan koreksi persediaan;
- Laporan Posisi Keuangan, Arus Kas, dan CALK;
- PDF SAK EMKM dua kolom;
- tab "Hari Ini" dengan selisih kas dan tab "Kondisi Usaha".

Yang menunggu Tahap C: Mode Akuntan penuh (jurnal umum, buku besar, neraca saldo di layar), ekspor CSV berkolom akun, estimasi pajak, `indicator_monthly`, dan template kategori untuk tujuh sektor SIAPIK lainnya.

### 4.4.2 Posisi Keuangan, Arus Kas, dan CALK — Tahap B (2 September 2026)

Migrasi `0031_accounting_period_reports.sql` melengkapi apa yang dibutuhkan supaya Laporan Posisi Keuangan bisa disusun dan jujur.

Yang sudah berjalan:

- **Wizard kondisi awal usaha**, enam pertanyaan satu layar per pertanyaan (uang di laci, saldo rekening, siapa yang berutang ke Anda, Anda berutang ke siapa, nilai stok, alat usaha yang dipunya). Sekali isi, menghasilkan satu entry jurnal `OPENING`; modal menjadi penyeimbangnya dan boleh negatif kalau utang lebih besar dari harta. Catatan bertanggal sebelum tanggal mulai ditolak, karena angkanya sudah terhitung di saldo awal.
- **Alat usaha dan penyusutan garis lurus**. Membeli alat (kategori 8) langsung mendaftarkannya; umur manfaat mengikuti kelompok fiskal (peralatan 48 bulan, mesin dan kendaraan 96, bangunan 240). Penyusutan diposting per bulan lewat `ensure_depreciation_posted()`, idempoten dengan `UNIQUE(asset_id, period_month)`.
- **Pinjaman**. Pinjaman yang cair (kategori 4b) mendaftar sendiri; membayar cicilan (kategori 7) mengurangi sisa pinjaman dan memisahkan bunganya ke akun beban bunga.
- **Hitungan stok akhir bulan**. Belanja bahan dibebankan saat dibeli; hitungan fisik akhir bulan mengoreksinya. Hitungan ulang membalik koreksi lama di dalam periode yang sama, bukan menimpanya.
- **`fn_balance_sheet`, `fn_cash_flow`, `fn_notes_data`**. Posisi Keuangan mengembalikan angka yang sudah bertanda sesuai bagiannya, sehingga akun kontra otomatis menjadi pengurang dan invarian JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS bisa diuji langsung di SQL. Arus kas metode langsung memisahkan bunga cicilan ke aktivitas operasi walau pokoknya pendanaan.
- **Tab "Kondisi Usaha"** di `/umkm/laporan`: "Yang saya punya", "Yang harus saya bayar", dan "Milik saya bersih", tanpa satu pun kata neraca, aset, liabilitas, atau ekuitas.
- **Tab "Untuk Bank"**: satu tombol menghasilkan berkas laporan keuangan lengkap berisi Laporan Posisi Keuangan, Laba Rugi, Arus Kas, Catatan atas Laporan Keuangan bernomor 1–13, lampiran indikator enam bulan, dan lampiran metodologi pemetaan kategori ke akun. Dua kolom pembanding pada Posisi Keuangan dan Laba Rugi.
- **Tutup kas** kini juga menyimpan saldo buku kas dan bank pada tanggal itu serta selisihnya terhadap uang fisik. Selisih ditampilkan, tidak pernah dijurnal otomatis. Kolom lama sengaja dipertahankan supaya angka yang sudah pernah dilihat pemilik tidak berubah.

**Berkas laporan adalah PDF sungguhan.** `POST /api/v1/reports/financial-statements` merender byte PDF di server memakai `@react-pdf/renderer` 4.9.0 dan mengembalikannya sebagai unduhan (`Content-Disposition: attachment`). Berkasnya delapan halaman: sampul, tiga laporan SAK EMKM, arus kas, CALK, dan dua lampiran. Setiap halaman memuat nama usaha, periode, nomor halaman, ID dokumen, dan pernyataan bahwa laporan belum diaudit. Karena dirender di server, bentuknya sama dari perangkat mana pun — tidak bergantung pada menu cetak peramban.

Route-nya berjalan di runtime Node dan `@react-pdf/renderer` didaftarkan sebagai `serverExternalPackages` di `next.config.ts`, karena paket itu memuat metrik font bawaan dari berkas di dalam dirinya sendiri. Paket ini tidak menambah kerentanan baru pada `npm audit`; sebelas temuan yang ada semuanya berasal dari `eslint`, `shadcn`, dan `next`.

Uji `tests/unit/statement-pdf.test.ts` membongkar kembali byte PDF yang dihasilkan, mendekompresi stream-nya, dan membaca teks yang benar-benar tercetak — sehingga yang diuji adalah isi laporannya, bukan sekadar keberadaan berkasnya.

Yang masih menunggu Tahap C: Mode Akuntan penuh (jurnal umum, buku besar, neraca saldo di layar), ekspor CSV berkolom akun, estimasi pajak, `indicator_monthly` materialized, template kategori untuk tujuh sektor SIAPIK lainnya, dan pengingat otomatis hitung stok.

### 4.4.3 Kondisi awal yang bisa diperbaiki, register alat & pinjaman — 2 September 2026

Migrasi `0032_opening_balance_correction.sql`.

**Masalah yang ditutup.** `save_opening_balances` berhenti di baris pertama bila kondisi awal sudah pernah diisi dan mengembalikan `idempotent: true`. Wizard tetap menampilkan "Mulai" berhasil, layar berganti, dan tidak ada satu angka pun yang berubah — tidak ada caller yang memeriksa penanda itu. Pemilik yang salah ketik terkunci selamanya. Ini menjadi mendesak justru setelah 14 kolom rupiah tanpa awalan `Rp` diperbaiki: siapa pun yang sempat mengetik `78` alih-alih `78.000` tidak punya jalan keluar.

**Yang sekarang berjalan:**

- **`correct_opening_balances`** — entry `OPENING` lama dibalik **bertanggal `start_date` aslinya**, penyusutan yang terlanjur diposting dibongkar, semuanya disusun ulang dari angka baru, lalu penyusutannya dipasang kembali. Semua dalam satu transaksi, sehingga tidak pernah ada yang sempat melihat pembukuan setengah dihitung ulang. Alasan wajib 3–240 karakter, seperti setiap koreksi lain.
- **Riwayat pembayaran cicilan dipertahankan.** `sudah dibayar = pokok lama − sisa lama`; sisa baru = `pokok baru − sudah dibayar`. Pinjaman yang sudah pernah dicicil tidak bisa dihilangkan dari kondisi awal, dan penolakannya membatalkan seluruh koreksi.
- **`start_date`** boleh dimundurkan bebas; dimajukan hanya bila tidak ada transaksi terkonfirmasi yang jadi terkurung di belakangnya.
- **Register alat & pinjaman**: ubah nama, kelompok, dan sisa umur alat (memicu hitung ulang penyusutan); tandai alat yang sudah dijual atau rusak (`disposed_on` — kolom yang sebelumnya tidak pernah ditulis siapa pun) dengan hasil jual masuk kas dan selisihnya jadi untung/rugi; ubah nama, cicilan, dan bunga pinjaman.
- **Harga perolehan dan sisa pinjaman sengaja tidak dapat diketik di register.** Harga alat ikut sumbernya, sisa pinjaman ikut cicilan yang dicatat. Satu angka, satu sumber.
- **Layar**: tombol "Perbaiki kondisi awal usaha" dan "Alat usaha & pinjaman" di tab Kondisi Usaha; wizard yang sama dipakai ulang dalam mode koreksi, terisi **jawaban yang dulu diketik pemilik** (bukan hasil hitungan sistem), kata "sekarang" diganti tanggal mulai mencatat, disertai peringatan akibat dan kolom alasan.

**Empat kerusakan lama yang ikut tertutup:**

1. **Sisa pinjaman berkurang dua kali.** `update_ledger_transaction` membalik jurnal lalu memposting ulang, tetapi pembalikan tidak pernah mengembalikan pengurangan yang pertama. Dibuktikan dengan mematikan sementara perbaikannya: hasilnya `560000` padahal seharusnya `780000`.
2. **Alat dan pinjaman yatim.** Membatalkan transaksi beli alat atau pinjaman cair membalik jurnalnya tetapi meninggalkan baris `fixed_assets`/`loans` yang dibuat otomatis — dan alat itu terus disusutkan tiap bulan.
3. **Penyusutan mendahului pembukuan.** Alat yang dibeli sebelum pemilik mulai mencatat disusutkan untuk bulan-bulan sebelum harganya masuk buku, sehingga Posisi Keuangan menampilkan **harta bernilai minus** pada tanggal-tanggal itu. Uji lama justru mengunci perilaku keliru ini (`"July and August must both be depreciated"`).
4. **`register_fixed_asset` / `register_loan` menyisipkan baris tanpa jurnal apa pun**, sehingga alat tetap disusutkan padahal harganya tidak pernah masuk pembukuan. Tidak ada layar yang memanggilnya, jadi izinnya dicabut.

Perbaikan (1) dan (2) dikerjakan lewat **satu trigger** pada `journal_entries`, bukan menambah pemanggilan helper di tiga RPC buku kas: pembalikan jurnal transaksi adalah peristiwa yang sama di mana pun ia dipicu, jadi menautkannya ke peristiwa itu membuatnya mustahil terlupakan di jalur tulis yang ditambahkan kemudian.

**Nilai alat lama.** Alat yang sudah dipakai bertahun-tahun sebelum pencatatan dimulai kini masuk buku sebesar **nilai pakainya pada hari pertama mencatat** (`harga beli × sisa umur ÷ umur manfaat`), disusutkan selama sisa umurnya. Kulkas Rp3.000.000 yang dibeli dua bulan sebelum mulai mencatat masuk sebagai Rp2.968.750 dengan sisa umur 95 bulan, dan nilainya habis tepat delapan tahun setelah dibeli, bukan sepuluh. Wizard tidak berubah sedikit pun — pemilik tetap ditanya "beli kapan, harganya berapa".

**Yang dibuktikan `npm run db:test`**, bukan diklaim: Posisi Keuangan seimbang di enam tanggal historis setelah koreksi; saldo akun 1690 di jurnal (termasuk seluruh pembalikannya) sama persis dengan jumlah `depreciation_postings`; harga baru menggerakkan penyusutan baru sementara alat lain keluar identik; pembayaran cicilan selamat beserta lawan transaksinya; tiga koreksi berturut-turut semuanya seimbang; penghapusan pinjaman yang sudah dicicil ditolak dan seluruh koreksi dibatalkan; alat yang dilepas berhenti disusutkan; dan jurnal tetap tidak bisa disentuh setelah semuanya.

**Yang belum:** pelepasan alat belum mencatat laba/rugi pelepasan secara terpisah di CALK.

### 4.4.4 Batas bawah alat usaha — 2 September 2026

Migrasi `0033_fixed_asset_threshold.sql`.

**Masalah yang ditutup.** Apa pun yang dicatat sebagai "Beli alat / aset" diperlakukan sebagai alat usaha dan disusutkan bertahun-tahun, tanpa batas bawah. Pisau seharga Rp15.000 masuk daftar alat, menghasilkan 48 baris jurnal penyusutan sebesar Rp312 sebulan, dan ikut tercetak di catatan laporan keuangan sebagai alat usaha — semuanya untuk uang yang sudah habis terpakai bulan itu juga.

**Yang sekarang berjalan:**

- **Ambangnya Rp500.000**, dan aturannya "kurang dari", bukan "sampai dengan": belanja tepat Rp500.000 masih alat usaha. Angka itu cukup rendah untuk tetap menangkap etalase, kompor, dan gerobak; cukup tinggi untuk menyingkirkan pisau, ember, dan baskom.
- **Di bawah ambang, belanjanya langsung menjadi biaya usaha bulan berjalan** (kategori 6, "Biaya usaha lainnya"). Tidak ada baris di daftar alat, tidak ada penyusutan, dan untung bulan itu langsung berkurang sebesar harganya.
- **Baris transaksinya ikut pindah, bukan hanya jurnalnya**, sehingga daftar catatan dan layar koreksi memperlihatkan kategori yang benar-benar dipakai — bukan kategori yang tadi dipilih tapi tidak jadi dipakai.
- **Pemilik diberi tahu, tidak diam-diam dipindahkan.** Satu kalimat muncul di layar konfirmasi begitu nominal dan kategorinya bertemu: *"Rp120.000 terlalu kecil untuk dihitung sebagai alat usaha, jadi dicatat sebagai biaya bulan ini saja. Untung bulan ini berkurang sebesar itu, dan barangnya tidak masuk daftar alat. Batasnya Rp500.000."* Ini pilihan sadar atas alternatifnya — memindahkan tanpa berkata apa-apa — dan sejalan dengan aturan yang sudah dipegang sejak awal: jelaskan akibatnya, jangan diam-diam mengubah.

**Dua keputusan yang perlu dicatat.**

Ambangnya dipasang di `fn_post_transaction_journal`, satu-satunya corong yang dilewati **setiap** jalur tulis — catat baru, koreksi transaksi, konfirmasi hasil rekam suara, dan perbaikan kategori catatan lama. Menaruhnya di masing-masing RPC berarti aturan yang sama ditulis empat kali, dan lupa sekali saja cukup untuk membocorkan pisau ke daftar alat.

Angkanya hidup di basis data sebagai `private.fixed_asset_threshold_idr()`; `modules/accounting/templates.ts` hanya mencerminkannya sebagai `fixedAssetMinimumIdr` supaya layar konfirmasi bisa menjelaskan tanpa menunggu jaringan. Bila keduanya berselisih, `tests/integration/database-migrations.contract.test.ts` gagal — pola yang sama dengan bagan akun dan tabel template.

**Yang dibuktikan `npm run db:test`:** belanja Rp120.000 berkategori alat tidak menghasilkan satu pun baris `fixed_assets`, seluruh nominalnya mendarat di akun biaya, tidak sepeser pun menyentuh akun alat usaha, baris transaksinya benar-benar berpindah kategori, dan belanja tepat Rp500.000 tetap terdaftar sebagai alat.

### 4.4.5 Mode Akuntan — 2 September 2026

Migrasi `0034_general_ledger_ordering.sql`, halaman `/umkm/akuntan`, endpoint `GET /api/v1/accounting/ledger/:kodeAkun` dan `GET /api/v1/accounting/export.csv`.

**Wajah kedua dari mesin yang sama.** Mode Warung menjawab "usaha saya untung berapa" dalam bahasa pemiliknya. Mode Akuntan menjawab "tunjukkan pembukuannya" — untuk pendamping, koperasi, atau petugas yang duduk di sebelah pemilik dan perlu menelusuri satu angka sampai ke catatan hariannya. Tautannya kecil dan berada di bawah tab "Untuk Bank", sengaja tidak menonjol: pemilik warung tidak perlu ke sana.

**Yang sekarang berjalan:**

- **Jurnal Umum** — setiap entri beserta baris debit dan kreditnya, disaring rentang tanggal.
- **Buku Besar** — mutasi satu akun dari 28 akun bagan akun, lengkap dengan saldo awal periode, saldo berjalan tiap baris, dan jumlah periode.
- **Neraca Saldo** — posisi seluruh akun pada tanggal pilihan, dengan penanda seimbang/tidak seimbang.
- **Ekspor CSV berkolom akun** — `kode_akun, nama_akun, debit, kredit, tanggal, sumber, memo`, persis urutan yang diminta spek supaya berkasnya dapat diimpor ke SI APIK atau sistem pembukuan bank tanpa disunting lebih dulu. Diunduh sebagai lampiran dengan `nosniff`, dan setiap selnya dikutip lewat `csvCell` sehingga memo yang diawali `=` tidak pernah dieksekusi sebagai rumus di komputer penerimanya.

**Layar ini hanya membaca.** Tidak ada satu tombol pun yang mengubah angka; yang membetulkan catatan tetap Mode Warung, dalam bahasa pemiliknya. Dua pintu masuk ke pembukuan yang sama adalah cara tercepat membuat keduanya berselisih. Istilah akuntansi — debit, kredit, buku besar — boleh muncul di sini dan hanya di sini, karena itu kosakata pembacanya; larangan bahasa penilaian kredit tetap berlaku penuh dan tetap dijaga `lint:terms`.

**Satu kerusakan yang ditemukan saat membangunnya.** `v_general_ledger` menghitung saldo berjalan dengan window yang diurutkan `entry_date, posted_at, line_order, line.id`, tetapi tiga kunci terakhir tidak pernah ikut dikeluarkan — pembacanya hanya punya `entry_date`. Pada hari yang sama, urutan barisnya menjadi acak dan kolom "Saldo" menampilkan angka milik baris yang kebetulan terpilih. Di basis data uji, akun 1100 punya tujuh baris bertanggal sama: mengurutkan dengan tanggal saja menghasilkan saldo `83.000`, padahal saldo akun itu `3.083.000`. Migrasi `0034` menambahkan ketiga kunci itu ke view, dan pembacanya kini mengurutkan dengan kunci yang persis sama dengan window-nya.

**Yang dibuktikan `npm run db:test`:** jumlah debit dan kredit dari view buku besar sama persis dengan `fn_trial_balance` pada tanggal yang sama — inilah invarian 9 spek, bahwa angka di layar, di berkas CSV, dan di laporan tidak pernah bercerita berbeda; saldo berjalan baris terakhir tiap akun sama dengan saldo akun itu di neraca saldo; view buku besar ikut RLS sehingga usaha lain tidak pernah terbaca; dan view-nya bahkan tidak dapat ditulis.

**Tahap C selesai.** Enam sektor SI APIK sisanya menunggu daftar kanoniknya; lihat Bagian 4.4.9.

### 4.4.6 Perkiraan pajak penghasilan — 2 September 2026

Migrasi `0035_tax_estimate.sql`, endpoint `GET /api/v1/reports/tax-estimate`.

**Masalah yang ditutup.** Akun `5400` (Beban Pajak Penghasilan) dan `2400` (Utang Pajak) sudah ada sejak `0029`, tetapi tidak ada satu pun yang pernah mengisinya. Baris "Beban pajak penghasilan" di Laporan Laba Rugi selalu nol, sehingga **"LABA SETELAH PAJAK" selama ini sama persis dengan "LABA SEBELUM PAJAK"** — dua baris yang menjanjikan hal berbeda tetapi menampilkan angka yang sama. Berkas yang dikirim ke bank memuat kejanggalan itu di setiap halaman.

**Aturan yang dipakai.** Peredaran bruto usaha dalam satu tahun takwim; Rp500.000.000 pertama tidak dikenai pajak (WP Orang Pribadi); selebihnya PPh final 0,5% (PP 55/2022).

**Lima keputusan yang perlu dicatat.**

1. **Dasarnya hanya akun `4100`** (Pendapatan Usaha), bukan `4200` (Pendapatan Lain-lain). Yang dikenai PPh final adalah peredaran bruto *usaha*; untung dari menjual kulkas bekas bukan omzet warung.
2. **Hanya bagian yang melewati ambang yang kena pajak.** Bulan yang menembus Rp500 juta dikenai pajak atas selisihnya saja. Ini bukan detail kecil: tanpa aturan itu, warung beromzet Rp1,2 juta setahun ikut ditagih Rp6.000 — dibuktikan dengan mematikan sementara aturannya di `db:test`, dan hasilnya persis angka itu.
3. **Pembulatan dilakukan pada angka kumulatif**, bukan per bulan. Pajak bulan ini = pajak terutang sampai akhir bulan ini dikurangi pajak terutang sampai akhir bulan lalu. Dua belas pembulatan bulanan tidak menumpuk menjadi selisih terhadap perhitungan setahun.
4. **Angkanya memperbaiki diri sendiri.** Omzet berubah setiap kali satu transaksi dikoreksi — jauh lebih sering daripada penyusutan berubah. Setiap bulan menyimpan omzet yang dipakainya; kalau omzet sebenarnya sudah bergeser, entry lamanya dibalik di dalam bulannya sendiri dan dihitung ulang. **Tidak ada satu pun jalur tulis buku kas yang perlu tahu soal pajak.**
5. **Pajak bulanan boleh negatif**, dan tabelnya sengaja tidak punya batasan non-negatif. Pembalikan transaksi selalu bertanggal hari pembatalan dicatat — aturan yang sama untuk seluruh sistem — sehingga membatalkan penjualan Agustus pada bulan September membuat omzet September negatif. Perkiraan Agustus tidak dicabut (pada Agustus penjualan itu memang ada di pembukuan); yang terjadi adalah pelepasan utang pajak di bulan pembatalan. Memaksa angkanya nol akan mengunci pemilik pada pajak atas penjualan yang tidak pernah jadi.

**Yang dilihat pemilik.** Satu bagian di tab Kondisi Usaha, dalam bahasa warung dan tanpa istilah perpajakan: *"Belum kena pajak. Penjualan tahun ini Rp68.000.000, dan pajak baru mulai dihitung setelah Rp500.000.000 setahun — masih Rp432.000.000 lagi."* Kalau sudah kena: *"Perkiraan pajak tahun ini Rp600.000. Penjualan sudah Rp620.000.000, dan yang dihitung hanya kelebihannya di atas Rp500.000.000 — bukan seluruh penjualan."* Penafiannya menempel di layar yang sama: ini perkiraan untuk menyiapkan uangnya, bukan hitungan pajak resmi. Begitu ada pajak terutang, baris "Perkiraan pajak" muncul sendiri di "Yang harus saya bayar".

**Satu lomba baca/tulis yang ikut ditutup.** `ensure_depreciation_posted` dan `ensure_tax_estimated` digabung menjadi satu `ensurePeriodPosted`, dan berkas laporan PDF kini memanggilnya **sekali di depan** sebelum keenam pembacaannya berjalan bersamaan. Sebelumnya laporan laba rugi bisa terbaca lebih dulu daripada posting yang dipicu pembacaan lain, sehingga satu berkas yang sama berpotensi memuat dua angka pajak yang berbeda.

**Yang dibuktikan `npm run db:test`:** warung di bawah ambang tidak menghasilkan satu pun jurnal pajak tetapi tetap menyimpan barisnya; satu penjualan besar membuat pajak muncul tepat sebesar 0,5% dari kelebihannya saja; jurnalnya bertanggal akhir bulan yang dikenai dan bagian arus kasnya `NON_KAS` sehingga identitas arus kas tidak terganggu; angkanya sampai ke Laporan Laba Rugi dan Posisi Keuangan; menjalankan ulang tidak memposting dua kali; membatalkan penjualannya melepaskan persis sebesar yang tadi diakui sehingga tidak ada utang pajak hantu; Posisi Keuangan tetap seimbang di dalam bulannya sendiri maupun sesudahnya; dan perkiraan pajak usaha lain tidak terbaca serta tabelnya tidak dapat ditulis dari sesi pemilik.

**Tahap C selesai.** Enam sektor SI APIK sisanya menunggu daftar kanoniknya; lihat Bagian 4.4.9.

### 4.4.7 Indikator bulanan tersimpan dan rumus tercetak — 2 September 2026

Migrasi `0036_indicator_monthly.sql`.

**Masalah yang ditutup.** `fn_warung_monthly` menghitung indikator setiap kali dipanggil. Itu benar, tetapi tidak cukup untuk berkas yang keluar dari aplikasi: sebuah PDF yang dicetak bulan lalu tidak punya cara menyebutkan rumus apa yang menghasilkan angkanya. Kalau rumusnya kelak diperbaiki, berkas lama dan berkas baru menampilkan angka berbeda untuk bulan yang sama, tanpa satu pun keterangan yang menjelaskan kenapa.

**Yang sekarang berjalan:**

- **Tabel `indicator_monthly`** menyimpan pendapatan, beban pokok, beban usaha, beban bunga, laba bersih, ambilan pemilik, modal masuk, piutang baru, penjualan lewat rekening, rasio non-tunai, hari tercatat, dan **`formula_version`** untuk setiap bulan.
- **Rumus setiap indikator tercetak** di Lampiran B berkas PDF, lengkap dengan versinya. Lampiran indikator menyebut versi yang sama di kepalanya.
- **Rasio penjualan lewat rekening** menggantikan kolom beban usaha di lampiran indikator: bagi pembaca berkas, seberapa besar penjualan yang meninggalkan jejak di rekening jauh lebih informatif daripada satu angka beban yang sudah ada di Laporan Laba Rugi.

**Empat keputusan yang perlu dicatat.**

1. **Tabel, bukan materialized view.** Materialized view di PostgreSQL tidak tunduk RLS, sedangkan setiap agregat di sistem ini wajib terisolasi per usaha. Tabel biasa dengan policy `select` memberi jaminan yang sama, dan memungkinkan satu bulan dibangun ulang tanpa menyentuh sebelas bulan lainnya.
2. **Dibangun ulang hanya ketika sumbernya bergeser.** Setiap baris menyimpan sidik jari bulannya — jumlah entry dan `posted_at` terbaru. Jurnal tidak pernah diubah maupun dihapus, jadi kedua angka itu cukup untuk mengetahui sebuah bulan masih sama seperti saat dihitung.
3. **`capital_in` tidak menghitung entry saldo awal.** Akun `3100` pada entry `OPENING` adalah penyeimbang kondisi awal, bukan uang yang baru disetorkan pemilik. Tanpa pengecualian ini, bulan pertama selalu tampak seolah pemilik menyuntik modal sebesar seluruh kekayaan usahanya — dan angka itulah yang selama ini tercetak di lampiran PDF.
4. **Rasio non-tunai kosong, bukan nol, pada bulan tanpa penjualan.** "Tidak ada penjualan" dan "semua penjualan tunai" adalah dua keadaan berbeda; menampilkan 0% untuk yang pertama menyesatkan pembacanya. Spek menyebut indikator ini `cash_in_noncash_ratio`, nama yang tidak mengatakan mana pembilangnya; di sini namanya dibuat tegas menjadi **penjualan yang masuk ke rekening dibagi seluruh penjualan**, dan rumus itu ikut tercetak.

**Kenapa rumusnya harus tercetak.** Pembaca berkas ini — pendamping, koperasi, petugas bank — berhak memeriksa apakah angkanya berarti seperti yang mereka kira, tanpa harus mempercayai aplikasinya. Indikator yang tidak bisa diperiksa rumusnya tidak lebih baik daripada skor tertutup, dan itu persis yang tidak boleh dihasilkan produk ini.

**Yang dibuktikan `npm run db:test` dan `npm test`:** angka tersimpan sama persis dengan angka yang dihitung on the fly untuk setiap kolom kecuali modal masuk, yang memang sengaja berbeda dan dibuktikan lebih kecil; menjalankan ulang tanpa perubahan tidak membangun ulang satu bulan pun; satu transaksi baru membuat bulannya basi dan benar-benar dihitung ulang; bulan tanpa penjualan menyimpan rasio kosong; indikator usaha lain tidak terbaca dan tabelnya tidak dapat ditulis dari sesi pemilik. Uji PDF membongkar kembali byte berkasnya dan membaca teks yang benar-benar tercetak, memastikan rumus dan versinya ada di halaman, serta bulan tanpa penjualan tidak pernah tercetak sebagai `0%`.

**Tahap C selesai.** Enam sektor SI APIK sisanya menunggu daftar kanoniknya; lihat Bagian 4.4.9.

### 4.4.8 Pengingat hitung stok dan tutup kas — 2 September 2026

Migrasi `0037_pending_reminders.sql`, endpoint `GET /api/v1/reports/reminders`.

**Masalah yang ditutup.** Dua kebiasaan menentukan apakah pembukuan sebuah warung bisa dipercaya, dan keduanya mudah terlewat karena tidak ada yang menagih. **Hitung stok akhir bulan**: belanja bahan dibebankan saat dibeli, jadi tanpa hitungan fisik, laba bulan itu ikut memikul bahan yang sebenarnya masih di rak — bulan yang tidak pernah dihitung melaporkan untung lebih rendah dari kenyataan. **Tutup kas harian**: selisih antara uang di laci dan saldo buku hanya bisa ketahuan pada hari itu juga.

**Diturunkan, bukan dijadwalkan.** Tidak ada baris pengingat yang disimpan, dan tidak ada penjadwal yang membuatnya. `fn_pending_reminders` menghitungnya dari keadaan setiap kali dibaca. Akibatnya pengingat hilang sendiri pada detik pemilik mengerjakannya tanpa ada yang perlu ditandai selesai, tidak bisa muncul dua kali atau basi setelah datanya dikoreksi, dan tidak ada antrean yang perlu dibersihkan. Baris pemberitahuan tersimpan akan menuntut dedup, kedaluwarsa, dan pembersihan — tiga hal baru yang bisa salah, tanpa satu pun manfaat tambahan selama aplikasi belum punya kanal dorong maupun penjadwal (lihat Bagian 8.5).

**Aturan yang dipegang:**

- **Hitung stok hanya ditagih dari usaha yang memang membeli bahan.** Penjual jasa tidak punya persediaan, dan pengingat yang tidak relevan mengajari pemiliknya mengabaikan semua pengingat.
- **Bulan berjalan baru ditagih pada tiga hari terakhirnya.** Menghitung stok di tengah bulan tidak ada gunanya. Bulan yang masih berjalan berstatus "perlu", bulan yang sudah lewat berstatus "terlambat".
- **Tutup kas ditagih hanya untuk hari yang punya catatan terkonfirmasi** dan belum pernah ditutup. Hari ini ikut ditagih, karena tutup kas memang dikerjakan pada harinya.
- **Tidak ada tombol "tandai selesai".** Tombol yang menyembunyikan pengingat tanpa mengerjakannya hanya membuat pembukuan tampak beres padahal tidak. Uji kontrak memastikan komponennya tidak punya satu pun tombol.

**Yang dilihat pemilik**, di atas tab halaman Laporan — akibatnya, bukan perintahnya: *"Hitung sisa stok Agustus 2026 — Belanja bahan sudah dihitung sebagai biaya bulan itu. Selama sisa stoknya belum dihitung, untung bulan itu terlihat lebih kecil daripada yang sebenarnya."* Paling banyak tiga pengingat sekaligus; lebih dari itu daftarnya berhenti menjadi pengingat dan menjadi tembok.

**Yang dibuktikan `npm run db:test`:** bulan yang stoknya sudah dihitung tidak pernah ditagih lagi; bulan lewat yang punya belanja bahan tanpa hitungan ditagih dengan status terlambat dan jumlah hari keterlambatannya; bulan yang masih berjalan tidak ditagih di pertengahan tetapi ditagih pada tiga hari terakhirnya dengan status belum terlambat; mengerjakan hitungannya menghapus tagihannya; hari yang sudah ditutup tidak muncul, dan menutup satu hari menghapus tagihan hari itu; serta pengingat usaha lain tidak pernah terbaca.

**Tahap C selesai.** Enam sektor SI APIK sisanya menunggu daftar kanoniknya; lihat Bagian 4.4.9.

### 4.4.9 Sektor dibaca dari jawaban pemilik — 2 September 2026

Migrasi `0038_sector_aware_templates.sql`. Menutup Tahap C.

**Masalah yang ditutup.** Halaman Profil sudah lama menanyakan sektor usaha — tujuh pilihan: Kuliner, Fashion, Pertanian, Jasa, Kerajinan, Teknologi, Lainnya — dan menyimpannya di `profiles.sektor_usaha`. Lalu `private.emkm_sector_for_business()` mengembalikan `'PERDAGANGAN_KULINER'` untuk siapa pun, tanpa pernah melihatnya. **Aplikasi menanyakan sesuatu lalu mengabaikan jawabannya.**

Akibatnya bukan angka yang salah — akunnya memang sama untuk semua sektor — melainkan pertanyaan yang salah alamat. Penjual jasa diminta memilih "Belanja bahan / barang — beli bahan baku atau stok dagangan" dan "Kemasan & label", dua hal yang tidak ada di usahanya.

**Yang sekarang berjalan:** sektor dibaca dari jawaban terbaru pemilik, dan tujuh pilihan di layar dipetakan ke **dua set template** — barang (Kuliner, Fashion, Pertanian, Kerajinan, Lainnya) dan jasa (Jasa, Teknologi). Chip kategori di layar konfirmasi ikut berubah kata-katanya.

**Empat keputusan yang perlu dicatat.**

1. **Dua set, bukan delapan.** Yang berbeda antar sektor hanyalah kata-katanya; akunnya identik. Delapan set berarti delapan kali lipat baris yang harus dijaga agar labelnya tidak melenceng dari akun yang dipetakannya — demi perbedaan yang bagi penjual baju maupun pengrajin sebenarnya tidak ada, karena keduanya sama-sama menjual barang. Yang benar-benar berbeda hanyalah usaha jasa, yang tidak punya persediaan maupun kemasan.
2. **Sumber kebenarannya `profiles.sektor_usaha`, bukan `businesses.sector`.** Kolom `businesses.sector` diisi sekali saat usaha dibuat (`0026`) dan trigger-nya tidak menyala pada perubahan `sektor_usaha` — jadi pemilik yang membetulkan sektornya hari ini tidak akan pernah terlihat berubah di sana. `businesses.sector` tetap dipakai sebagai cadangan.
3. **Sektor yang tidak dikenal jatuh ke set barang, bukan gagal.** Sektor adalah isian yang daftarnya pernah berubah; menggagalkan pencatatan karena satu kata yang tidak dikenali akan menghukum pemilik atas keputusan lama kita sendiri. Yang tetap gagal keras adalah kombinasi (sektor, kategori) tanpa template — di situ menebak berarti menebak **akun**, dan itu tidak pernah boleh.
4. **Migrasinya menolak dirinya sendiri** kalau salah satu sektor tidak menutup kesepuluh kategori (`SECTOR_TEMPLATE_INCOMPLETE`). Lubang di satu sektor akan menggagalkan pencatatan pemiliknya di tengah jalan, dengan pesan error yang tidak menyebut sektor sebagai penyebab.

**Yang dibuktikan `npm run db:test` dan `npm test`:** usaha barang tetap melihat "Belanja bahan / barang"; begitu pemilik mengubah sektornya menjadi Jasa, label yang sama berubah menjadi "Bahan & alat habis pakai" dan "Kemasan & label" menjadi "Perlengkapan kerja"; **aturan posting kedua sektor dibandingkan baris demi baris dan wajib identik** — kata-katanya boleh berbeda, akunnya tidak pernah; catatan yang diposting sebagai usaha jasa mendarat di akun pendapatan yang sama persis; kedua set menutup sepuluh kategori; resolver tetap deterministik untuk seluruh kombinasi kategori × cara bayar × jenis lawan transaksi di **kedua** sektor; dan sektor yang tidak dikenal jatuh ke set barang alih-alih menggagalkan pencatatan.

**Enam sektor SI APIK sisanya sengaja belum dibuat.** Struktur templatenya kini terbukti sektor-agnostik, jadi menambahkannya adalah pengisian data, bukan pembangunan ulang. Yang ditunggu adalah daftar sektor kanonik dari Pedoman PTK BI–IAI / SI APIK; menyusunnya dari ingatan akan menghasilkan daftar yang terlihat sah sampai dibaca pendamping atau petugas bank, dan itu risiko yang tidak sepadan untuk perbedaan yang hanya menyangkut kata-kata.

### 4.5 Dokumen Usaha

Halaman `/umkm/upload` mengelompokkan dokumen agar lebih mudah dipahami:

1. Identitas & Legalitas;
2. Izin & Sertifikasi Produk;
3. Keuangan & Transaksi;
4. Bukti Pendukung Usaha.

Jenis dokumen mencakup KTP, NIB, NPWP, PIRT, Sertifikat Halal, Izin Edar, laporan keuangan, rekening koran, QRIS, foto usaha, sertifikat, dan dokumen pendukung sesuai konteks.

Lifecycle dokumen:

```text
pilih dokumen
-> baca persetujuan pemrosesan
-> validasi file dan checksum
-> unggah ke penyimpanan privat
-> pembacaan OCR/AI
-> periksa hasil
-> konfirmasi atau koreksi pemilik
-> menunggu verifikasi manusia/sumber resmi bila diperlukan
```

Pengamanan dokumen:

- bucket dokumen bersifat private;
- browser tidak menentukan storage path;
- akses lihat memakai signed URL 60 detik;
- format hanya PDF, JPEG, dan PNG;
- extension, MIME, ukuran, checksum, dan magic bytes diperiksa;
- versi baru tidak menimpa riwayat versi lama;
- arsip bersifat non-destruktif;
- setiap akses penting dicatat;
- KTP, NIB, dan NPWP memerlukan persetujuan setiap kali mengunggah versi baru;
- hasil OCR dan koreksi pemilik disimpan terpisah;
- hasil OCR tidak otomatis mengubah profil authoritative.

Kondisi OCR berdasarkan provider lokal:

- gambar JPEG/PNG dapat diproses menggunakan Groq vision;
- PDF OCR memerlukan OpenAI atau Gemini pada implementasi sekarang;
- karena OpenAI dan Gemini belum dikonfigurasi, PDF akan diarahkan ke pemeriksaan manual atau perlu diunggah sebagai hasil pindai gambar;
- malware scanner belum tersedia.

Status yang ditampilkan kepada pengguna membedakan “sedang dibaca”, “data siap diperiksa”, “dikonfirmasi pemilik”, dan “terverifikasi”.

### 4.5.1 Lemari lima rak dan bukti yang menempel — Tahap D-A dan rak E (3 September 2026)

Dokumen selama ini satu tumpukan. Sekarang setiap dokumen punya rak, dan bukti
bisa menempel langsung ke pembukuan.

**Lima rak** (`documents.doc_class`, migrasi `0041`): Identitas saya, Izin
usaha, Nota & bukti, Alat & perjanjian, Laporan yang pernah dibuat. Raknya
diisi fungsi `private.document_shelf_for_type()` yang dipakai backfill sekaligus
trigger `before insert`, bukan sekali jalan — jalur tulis dokumen lebih dari
satu, dan satu jalur yang lupa mengisi rak menghasilkan dokumen yang raknya
harus ditebak layar. Salah tebak di sini berarti KTP ikut terkirim ke institusi.
Yang raknya tidak pasti (`utilitas`, `qris`, `laporan_keuangan`,
`foto_tempat_usaha`) ditandai `needs_class_review` dan menunggu pemilik memilah.

**Tiga pintu bukti** (migrasi `0042`):

| Pintu | Di mana | Perilaku |
|---|---|---|
| A | Kartu setelah simpan di `/umkm/catat` | Ajakan foto nota, bisa dilewati |
| C | Ikon kamera di baris riwayat `/umkm/laporan` | Menempel belakangan |
| D | Otomatis, tanpa layar | Bukti pembelian ikut menempel ke alat/pinjaman yang lahir darinya |

Pintu D dikerjakan RPC `public.attach_document`, bukan layar. Yang tahu bahwa
pembelian kategori 8 melahirkan baris `fixed_assets` adalah basis data lewat
`source_transaction_id`; kalau layar yang harus tahu, setiap layar baru yang
menempelkan bukti harus mengingatnya lagi, dan yang lupa menghasilkan alat
tanpa bukti tanpa ada yang tahu.

**Catatan disimpan lebih dulu, fotonya menyusul.** Foto nota tidak pernah
menjadi syarat tersimpannya sebuah catatan. Unggahan yang gagal berbunyi "bukti
belum terkirim" dengan tombol coba lagi yang menyimpan fotonya di memori —
bukan "catatan gagal". Sinyal di pasar hilang timbul, dan pemilik tidak boleh
kehilangan angka yang sudah benar demi bukti yang bisa menyusul kapan saja.

**Ajakan bertingkat** (`modules/ledger/evidence-nudge.ts`): di bawah Rp100 ribu
pemilik tidak diganggu sama sekali; di atasnya satu ajakan lembut; alat
(kategori 8) dan pinjaman cair (4b) selalu diajak, berapa pun nilainya, karena
keduanya melahirkan baris yang hidup bertahun-tahun di pembukuan.

**Bukti diperlakukan seperti jurnal:** tidak pernah disunting, tidak pernah
dihapus, hanya ditandai lepas dengan alasan 3–240 karakter. Membalikkan sebuah
transaksi tidak menghapus notanya — nota tetap bukti bahwa uangnya pernah
keluar, apa pun yang terjadi pada jurnalnya kemudian.

**Kompresi klien** (`modules/documents/image-compression.ts`, sebelumnya tidak
ada di repo): sisi terpanjang 1600 px, tangga mutu 0,75 → 0,5, sasaran 600 KB,
dan EXIF diputar sesuai orientasi — nota yang dipotret tegak tanpa itu tersimpan
miring, dan nota miring tidak terbaca siapa pun. Hasilnya dilaporkan ke pemilik
sebagai "0,3 MB — hemat kuota". Kegagalan apa pun mengembalikan berkas asli:
bukti besar jauh lebih baik daripada tidak ada bukti.

**Klip di Mode Akuntan.** Baris jurnal yang punya bukti menampilkan 📎; satu
ketukan membuka berkasnya lewat tautan bertanda tangan 60 detik yang tercatat di
`audit_events`. Untuk ini `JournalEntryView` kini membawa `sourceId`, yang
sebelumnya tidak pernah ikut terbaca sehingga baris jurnal tidak punya jalan
kembali ke catatan yang melahirkannya.

**CALK** memuat kalimat kebijakan bukti hanya bila usahanya benar-benar punya
lampiran (`accountingPolicyNotesFor({ hasEvidence })`). Catatan atas laporan
keuangan adalah tempat terakhir yang boleh memuat kalimat yang tidak bisa
ditunjukkan buktinya.

**Cacat lama yang ikut diperbaiki (`0043`).** Daftar jenis dokumen hidup di dua
tempat yang tidak pernah dibandingkan, dan keduanya sudah berbeda: `utilitas`
dan `akta_pendirian` ditawarkan sebagai ubin di layar unggah tetapi ditolak RPC
dengan `VALIDATION_FAILED`. Dua jenis dokumen mustahil diunggah, dan pemilik
hanya melihat unggahan gagal tanpa sebab. Daftarnya kini satu,
`private.known_document_types()`, dengan uji kontrak yang menjaganya tetap sama
dengan daftar TypeScript.

### 4.5.2 Rak E: arsip laporan yang pernah diterbitkan (3 September 2026)

Setiap berkas laporan yang diunduh disimpan apa adanya ke penyimpanan privat,
dicatat di `report_issues` (migrasi `0044`), dan membawa nomor penerbitan yang
tercetak di kaki setiap halamannya.

Berkasnya disimpan, bukan dibuat ulang, karena laporan yang dibuat ulang bulan
depan **tidak akan sama** dengan yang dikirim bulan ini: transaksi baru masuk,
penyusutan bertambah, hitungan stok mengoreksi periode sebelumnya. Begitu sebuah
berkas terkirim ke koperasi, satu-satunya cara mengetahui angka apa yang ada di
dalamnya adalah menyimpan berkasnya. Unduh ulang menyajikan bita yang sama
persis.

Nomornya berbentuk `BRK-20260903-QRSTVWXY` dan sengaja bisa dibacakan lewat
telepon: alfabetnya membuang I, L, O, U, 0, dan 1. Daftarnya ada di halaman
Dokumen sebagai bagian "Laporan yang pernah dibuat" — bukan menu baru, supaya
jumlah menu tidak bertambah.

Urutan simpannya disengaja: bita dulu, catatan kemudian. Kegagalan mencatat
hanya meninggalkan objek yatim yang langsung dibersihkan; urutan sebaliknya
meninggalkan baris arsip yang menjanjikan berkas yang tidak pernah ada, dan
pemilik baru mengetahuinya tepat ketika berkas itu diminta. Kegagalan mengarsip
juga tidak pernah menahan unduhannya.

### 4.6 Kesiapan Data Usaha dan Misi

Endpoint `/api/v1/readiness` menghitung snapshot kesiapan di server menggunakan bukti yang tersedia. Halaman terkait:

- `/umkm/score` untuk ringkasan komponen;
- `/umkm/gaps` untuk kekurangan data;
- `/umkm/roadmap` untuk misi perbaikan.

Komponen yang digunakan saat ini:

- konsistensi pencatatan transaksi;
- legalitas dasar/NIB;
- pencatatan biaya rutin;
- asal pesanan atau kanal penjualan;
- pembayaran digital;
- kelengkapan profil usaha;
- sertifikat atau pelatihan pendukung.

Sifat mesin nilai saat ini:

- rule-based dan versioned, bukan model prediksi gagal bayar;
- sumber bukti dan jumlah bukti dapat dijelaskan;
- “Data belum cukup” digunakan ketika bukti minimum belum ada;
- snapshot tidak digandakan ketika input tidak berubah;
- misi selesai berdasarkan bukti, bukan tombol klaim pengguna;
- disclaimer menyatakan hasil bukan penilaian resmi atau jaminan pembiayaan.

### 4.7 Profil dan persetujuan akses

Halaman `/umkm/profil` mendukung:

- data dasar pemilik dan usaha;
- foto profil/avatar;
- penyimpanan profil dengan error state yang terlihat;
- panel permintaan akses dari institusi;
- persetujuan atau penolakan;
- pemilihan bagian data yang boleh dilihat;
- pencabutan akses aktif.

### 4.8 Notifikasi

Halaman `/umkm/notifikasi` masih berfokus pada notifikasi transaksi realtime. Event kesiapan, dokumen, dan izin akses sudah muncul melalui beranda/panel terkait, tetapi pusat notifikasi lintas-domain yang sepenuhnya terpadu masih dapat dikembangkan.

### 4.9 Fitur UMKM yang sengaja tidak aktif

- `/umkm/aktivitas` diarahkan ke `/umkm` karena beranda sudah memakai aktivitas nyata;
- `/umkm/ai-copilot` diarahkan ke `/umkm` karena chatbot lama hanya simulasi dan berisiko memberikan jawaban finansial seolah nyata.

Artinya chatbot tidak hilang karena tidak berguna, tetapi dinonaktifkan sampai tersedia RAG, sumber resmi, guardrail, dan evaluasi jawaban yang memadai.

## 5. Fitur institusi

### 5.1 Pencarian kandidat anonim

Halaman `/institusi` menggunakan endpoint kandidat dan hanya menampilkan informasi terbatas sebelum izin, seperti:

- kode kandidat;
- sektor usaha;
- wilayah umum;
- umur usaha;
- tingkat kesiapan;
- kebiasaan mencatat;
- jenis bukti yang tersedia.

Identitas rinci dan transaksi individual tidak dibuka pada tahap ini.

### 5.2 Permintaan akses

Institusi dapat mengirim permintaan yang berisi:

- tujuan penggunaan;
- program terkait;
- bagian data yang diminta;
- masa akses terbatas;
- kebutuhan menyimpan ringkasan.

Permintaan ganda yang masih aktif dicegah di database.

### 5.3 Profil usaha yang disetujui

Halaman `/institusi/dossiers` menampilkan profil yang telah disetujui pemilik. Sistem membuat snapshot ringkas saat persetujuan diberikan, bukan memberi institusi akses langsung tanpa batas ke data operasional UMKM.

Pembatasan:

- hanya scope yang disetujui yang dapat dibuka;
- akses berhenti ketika dicabut atau kedaluwarsa;
- transaksi satu per satu, alamat rinci, foto identitas, NIK lengkap, dan NPWP lengkap tidak ikut pada ringkasan;
- akses lihat dan simpan dicatat;
- percobaan akses yang ditolak juga dicatat tanpa membocorkan isi.

### 5.4 Analitik institusi

`/institusi/analytics` masih diberi label simulasi. Grafik pada halaman ini belum boleh dipresentasikan sebagai metrik operasional riil.

## 6. Fitur admin

Portal admin menyediakan:

- ringkasan platform;
- manajemen akun admin;
- daftar dan detail UMKM;
- daftar dan detail institusi;
- daftar dan detail mitra komunitas;
- rules engine dan publikasi rule set;
- audit log;
- analytics platform.

Operasi istimewa dikirim ke `/api/admin/operations`, yang memeriksa sesi serta authority admin sebelum menggunakan service role server-only.

Keterbatasan:

- sebagian grafik analytics masih data turunan/simulasi dan sudah diberi banner;
- preview/history tertentu pada rules masih dapat memakai data contoh;
- UI admin masih memiliki warning lint dan beberapa hook dependency yang perlu dirapikan;
- proses aktivasi institusi publik perlu jalur verifikasi operator yang lebih ketat.

## 7. API yang tersedia

Repository memiliki 29 Route Handler. Endpoint domain utama:

### 7.1 Auth

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| POST | `/api/auth/bootstrap` | Memulihkan/membentuk profil dan authority onboarding setelah login |
| GET | `/auth/continue` | Mengarahkan sesi ke portal yang sesuai |

### 7.2 Voice-to-ledger

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| POST | `/api/v1/captures` | Membuat capture teks/suara dan sesi upload |
| POST | `/api/v1/captures/:id/process` | Menjadwalkan dan menjalankan worker AI |
| GET | `/api/v1/captures/:id` | Membaca status dan draft |
| POST | `/api/v1/captures/:id/confirm` | Menyimpan hasil review secara atomik |
| POST | `/api/v1/captures/:id/cancel` | Membatalkan capture dan cleanup audio |

### 7.3 Dokumen

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/v1/documents` | Daftar dokumen aktif |
| POST | `/api/v1/documents/upload-session` | Reservasi upload privat dan persetujuan OCR |
| POST | `/api/v1/documents/:id/versions` | Finalisasi versi dan jadwalkan pembacaan |
| GET | `/api/v1/documents/:id` | Detail, versi, ekstraksi, dan status pemeriksaan |
| POST | `/api/v1/documents/:id/signed-url` | URL lihat privat berdurasi pendek |
| POST | `/api/v1/documents/:id/extraction-confirmation` | Konfirmasi/koreksi hasil baca oleh pemilik |
| POST | `/api/v1/documents/:id/retry-extraction` | Coba ulang pembacaan |
| POST | `/api/v1/documents/:id/archive` | Arsip non-destruktif |

Endpoint `/api/documents/signed-url` hanya compatibility wrapper. `/api/ai/extract-nib` sudah dihentikan. `/api/ai/transcribe` merupakan endpoint AI generasi awal dan alur Catat utama sekarang memakai lifecycle `/api/v1/captures`.

### 7.4 Ledger

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/v1/ledger` | Laporan dan daftar transaksi |
| POST | `/api/v1/ledger` | Transaksi manual |
| PATCH | `/api/v1/ledger/transactions/:id` | Koreksi transaksi |
| DELETE | `/api/v1/ledger/transactions/:id` | Pembatalan logis, bukan hard delete |
| POST | `/api/v1/ledger/daily-closing` | Tutup kas harian |
| GET | `/api/v1/ledger/export` | Ekspor CSV |

### 7.5 Kesiapan dan izin institusi

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/v1/readiness` | Hitung/baca Kesiapan Data Usaha |
| GET | `/api/v1/candidates` | Kandidat anonim untuk institusi |
| GET/POST | `/api/v1/profile-access/requests` | Daftar/buat permintaan akses |
| POST | `/api/v1/profile-access/requests/:id/decision` | Setujui/tolak secara granular |
| POST | `/api/v1/profile-access/profiles/:id/access` | Buka scope profil yang masih diizinkan |
| POST | `/api/v1/profile-access/grants/:id/revoke` | Cabut izin |

## 8. Data dan keamanan

### 8.1 Stack aktual

- Next.js 16.2.10 dan React 19.2.4;
- TypeScript 5;
- Supabase Auth, PostgreSQL, Storage, Realtime, dan RLS;
- Zod untuk validasi payload;
- Groq SDK, OpenAI SDK, dan Gemini SDK sebagai adapter AI opsional;
- Vitest untuk unit/integration test;
- Playwright untuk browser smoke test;
- GitHub Actions dengan PostgreSQL service untuk CI.

### 8.2 Kontrol akses

- sesi selalu diverifikasi server melalui Supabase `auth.getUser()` pada boundary penting;
- admin memakai `platform_admins`;
- institusi memakai `institution_members`;
- UMKM memakai kepemilikan usaha dan membership internal yang dapat dibentuk otomatis;
- seluruh tabel domain memiliki RLS;
- operasi lintas-usaha diuji pada rangkaian migration/RLS sebelumnya;
- service role hanya digunakan pada module server-only;
- konfigurasi Supabase yang hilang pada protected path menghasilkan redirect gagal-tertutup.

### 8.3 Privasi dan minimisasi data

- audio dan dokumen sensitif berada di bucket private;
- akses menggunakan signed URL/token dengan masa pendek;
- browser tidak memilih path dokumen sensitif;
- profil institusi memakai snapshot terkurasi dan scope;
- data identitas lengkap tidak dimasukkan ke profil anonim;
- audit menyimpan metadata aman, bukan audio/transkrip/PII mentah;
- persetujuan dapat ditolak, dibatasi, kedaluwarsa, atau dicabut.

### 8.4 Integritas dan audit

- idempotency key mencegah pengulangan akibat retry jaringan;
- konfirmasi capture dilakukan dalam satu transaksi database;
- perubahan dan pembatalan ledger menyimpan alasan;
- dokumen memakai version history;
- event audit digunakan untuk upload, akses, konfirmasi, pembatalan, kesiapan, dan consent;
- snapshot kesiapan dan profil institusi dibekukan agar riwayat dapat dijelaskan.

### 8.5 Batas keamanan yang belum selesai

- malware scanner dokumen belum tersedia;
- scheduler/cron global untuk memulihkan semua job AI yang ditinggal pengguna belum tersedia;
- circuit breaker AI masih berada di memory setiap instance;
- rate limit/quota production dan observability terpusat belum lengkap;
- aktivasi institusi perlu proses kurasi/verifikasi operator;
- dependency Next.js masih versi 16.2.10 dan debt advisory yang dicatat audit lama belum diselesaikan;
- pengujian penetration/security independen belum dilakukan.

## 9. Arsitektur aktual dibanding proposal

### 9.1 Yang benar-benar digunakan sekarang

Arsitektur sekarang adalah **modular monolith tiga lapis**, bukan sekumpulan microservice terpisah:

```text
Browser / Next.js UI
        |
Next.js Route Handlers + domain modules
        |
Supabase Auth + PostgreSQL/RLS + private Storage
        |
Penyedia AI eksternal melalui adapter server-only
```

Domain sudah dipisahkan dalam module `auth`, `ledger`, `documents`, `readiness`, `consent`, `admin`, dan `ai`. Pemisahan ini memungkinkan ekstraksi menjadi microservice nanti, tetapi pada MVP semuanya masih dideploy sebagai satu aplikasi Next.js.

### 9.2 Status teknologi proposal

| Teknologi/konsep proposal | Status implementasi | Penjelasan |
| --- | --- | --- |
| Tiga lapis | Sebagian sesuai | UI, layanan, dan data sudah terpisah secara logis |
| Microservices | Belum | Masih modular monolith; lebih sederhana untuk MVP |
| Voice/NLP | Ada | Transkripsi dan ekstraksi transaksi melalui provider adapter |
| OCR | Ada | KTP/NIB/NPWP dengan consent dan review; kemampuan tergantung provider/file |
| Multi-agent LLM | Belum | Pipeline saat ini berupa adapter/provider dan worker terarah |
| RAG | Belum | Tidak ada ingestion korpus, embedding, vector database, retrieval, atau citation engine |
| Vector database | Belum | PostgreSQL saat ini tidak memakai pgvector untuk knowledge retrieval |
| XGBoost/regresi logistik | Belum | Nilai kesiapan memakai rules yang transparan dan versioned |
| Alternative credit scoring | Belum sebagai keputusan kredit | MVP hanya menilai kesiapan/kualitas data usaha |
| Prescriptive recommendation engine | Sebagian | Misi dan next action berbasis aturan tersedia; rekomendasi generatif berbasis RAG belum ada |
| Portal institusi | Ada versi awal | Kandidat anonim, consent, snapshot, revoke, dan audit tersedia |
| Chatbot | Tidak aktif | Route AI Copilot diarahkan ke beranda sampai guardrail/RAG tersedia |
| Integrasi data eksternal | Belum | Marketplace, utilitas, SLIK, SAPA UMKM, dan API mitra belum terhubung |

### 9.3 Rekomendasi arsitektur lanjutan

Untuk fase pilot, modular monolith sebaiknya dipertahankan sampai volume dan beban nyata membuktikan kebutuhan pemisahan. Urutan yang disarankan:

1. stabilkan capture/document worker dan scheduler;
2. bangun observability, quota, dan recovery queue;
3. buat layanan knowledge ingestion dan retrieval dengan sumber resmi berversi;
4. aktifkan kembali Copilot hanya dengan citation, scope jawaban, dan evaluasi;
5. pisahkan worker AI menjadi service mandiri ketika durasi/beban deployment web benar-benar menjadi masalah;
6. pertimbangkan model prediktif hanya setelah ada dataset outcome pembiayaan yang legal, representatif, dan dapat diaudit.

## 10. Database dan migrasi

Repository saat ini memiliki 28 migrasi, `0001` sampai `0028`.

Kelompok utama:

- `0001–0012`: fondasi identity, business, program, ledger, dokumen, readiness, consent, AI, audit, index, RLS, storage, backfill, dan compatibility view;
- `0013–0014`: authority membership, RLS, dan storage policies;
- `0015`: voice capture lifecycle;
- `0016–0020`: private document lifecycle, OCR completion, owner confirmation, policy consent, dan retry;
- `0021`: ledger/report/daily closing;
- `0022`: readiness dan mission engine;
- `0023`: consent dan verified business profile;
- `0024–0027`: akses UMKM sederhana, membership internal, auto-provision, dan roleless compatibility;
- `0028`: koreksi function capture dari `0027`.

### 10.1 Status remote

Pada pemeriksaan 31 Agustus, status remote belum dapat dibaca karena akun CLI yang digunakan mendapat HTTP 403. Pada 1 September, pengguna menjalankan push terhadap database percobaan baru. Migrasi `0001–0027` berhasil lebih dahulu, lalu `0028` berhasil diterapkan setelah sintaksnya diperbaiki.

Status dikonfirmasi dengan:

```powershell
npx.cmd supabase migration list
```

Hasilnya menunjukkan Local dan Remote sama dari `0001` sampai `0028`. Database percobaan baru sudah sinkron. Hasil ini bukan bukti status project production lain yang sebelumnya pernah digunakan.

### 10.2 Perbaikan kegagalan migrasi terbaru

Push awal `0028_fix_capture_roleless_functions.sql` gagal karena bentuk berikut tidak valid:

```sql
    ) values (
      ...,
      3
    returning * into v_job;
```

Perbaikannya sudah diterapkan menjadi:

```sql
    ) values (
      ...,
      3
    )
    returning * into v_job;
```

Daftar migrasi integration test dan database verification juga sudah disinkronkan sampai `0028`. Regression test memastikan pola SQL yang rusak tidak kembali.

Replay dan seluruh assertion sudah dijalankan pada PostgreSQL test lokal per 1 September 2026; hasilnya di Bagian 10.3.

Yang masih diperlukan:

- uji runtime capture teks/suara terhadap database percobaan setelah `0029`/`0030` di-push;
- jangan menganggap sinkronisasi database percobaan sebagai izin deploy ke production.

### 10.3 Enam kerusakan yang ditemukan saat migration test akhirnya dijalankan — 1 September 2026

`npm run db:test` belum pernah dijalankan sejak `0023` karena kredensial PostgreSQL test tidak tersedia. Ketika akhirnya dijalankan terhadap PostgreSQL 18 lokal, gate itu menemukan enam kerusakan pada rangkaian migrasi roleless `0024–0027`. Tidak satu pun berasal dari `0029`; semuanya sudah ada di `main` dan sebagian sudah berjalan di remote.

| # | Kerusakan | Akibat nyata | Perbaikan |
| --- | --- | --- | --- |
| 1 | `private.business_role()` (`0027`) berakhir `coalesce(..., 'owner')` **tanpa syarat** | Setiap akun yang login dianggap `owner` atas usaha **mana pun**. Isolasi RLS `transactions`, `daily_closings`, `transaction_captures`, dokumen, dan dossier tidak berlaku | `0030`: cadangan tanpa syarat dibuang, kembali ke bentuk `0024` |
| 2 | `private.get_or_create_user_business()` diam-diam jatuh ke usaha pemanggil saat `p_business_id` bukan miliknya | `create_transaction_capture` tidak pernah mengembalikan `BUSINESS_ACCESS_DENIED`; permintaan dengan id usaha salah menulis ke tempat lain tanpa jejak | `0030`: usaha yang diminta eksplisit ditolak bila bukan milik pemanggil. Auto-provisioning tetap untuk `p_business_id` null |
| 3 | `create_document_upload_session` (`0027`) membuang syarat `owner`, padahal `complete_document_upload_session`, `archive_document`, dan policy `document_versions` masih menuntutnya sejak `0016` | Anggota staf bisa memulai unggahan dokumen yang tidak akan pernah bisa ia selesaikan | `0030`: syarat `owner` dikembalikan |
| 4 | Path unggahan dokumen (`0027`) disusun `documents/{business_id}/...` | Policy storage menuntut segmen pertama sama dengan `auth.uid()`, jadi **tidak ada satu pun unggahan dokumen yang bisa lolos**. Kelas yang sama dengan bug capture yang diperbaiki `0028` | `0030`: kembali ke konvensi `0016`, `{user_id}/{business_id}/{document_id}/{session_id}.{ext}` |
| 5 | `confirm_transaction_capture` (`0027`) ditulis dengan **urutan parameter berbeda** dari `0015` | `create or replace` membuat overload kedua, bukan mengganti. Kedua versi punya nama parameter identik, sehingga panggilan named-argument dari aplikasi menjadi ambigu dan ditolak PostgREST | `0029`: overload `0027` di-`drop`, urutan `0015` dipertahankan sebagai satu-satunya signature |
| 6 | Isi `confirm_transaction_capture` (`0027`) menulis empat kolom yang tidak ada — `transactions.profile_id`, `transactions.capture_item_index`, `transaction_captures.draft_items`, `ai_jobs.result` — memakai `category_group` di luar CHECK `0021` (`cogs`/`operations`/`wages`), memakai `ai_jobs.status = 'completed'` yang tidak sah, menolak `categoryCode` yang dikirim aplikasi (`sales`, `materials`, `payroll`), dan menghapus antrean `readiness_recalculation` | Alur konfirmasi capture gagal 42703 dan tidak pernah berhasil sejak `0027` | `0029`: fungsi ditulis ulang di atas skema yang sebenarnya, sekaligus memposting jurnal ganda |

Pelajaran operasionalnya: `npm run build` dan `npm run typecheck` tidak pernah bisa membuktikan SQL. Enam kerusakan di atas semuanya lolos build. Migration test harus jadi gate wajib sebelum `supabase db push`, bukan langkah opsional saat kredensial kebetulan tersedia.

Selain itu, dua alat verifikasi ikut diperbaiki agar tetap relevan:

- `scripts/verify-database-migrations.mjs` — fixture-nya masih mengasumsikan usaha dibuat manual, padahal `0026` memprovisi usaha otomatis untuk setiap profil UMKM. Fixture sekarang membaca usaha yang terbentuk otomatis, dan skenario baru jurnal ganda SAK EMKM ditambahkan.
- `scripts/generate-database-types.mjs` — belum bisa merender fungsi `RETURNS TABLE(...)` dan mengembalikannya sebagai `string[]`. Sekarang kolom hasilnya dirender sebagai objek, sehingga `fn_trial_balance`, `fn_income_statement`, dan `fn_warung_monthly` bertipe benar di TypeScript.

## 11. Hasil pemeriksaan pada commit ini

| Pemeriksaan | Hasil | Catatan |
| --- | --- | --- |
| Git worktree | Bersih sebelum dokumen dibuat | Tidak ada perubahan source lokal yang belum dicatat |
| TypeScript | Lulus | `npm.cmd run typecheck` exit 0 |
| Production build | Lulus | 44 static pages selesai dibuat setelah akses Google Fonts diizinkan |
| ESLint | Lulus per 1 Sep 2026 | 0 error, 43 warning; dua error `any` di `readiness-repository.ts` diganti tipe kueri longgar |
| Unit command | Lulus per 2 Sep 2026 | 26 file dan 207 test lulus (sebelumnya 17 file / 91 test) |
| Integration | Lulus per 1 Sep 2026 | 24 test lulus, termasuk kontrak `0028` dan kontrak fondasi akuntansi `0029` |
| Database test | **Lulus per 2 Sep 2026** | `npm run db:test` terhadap PostgreSQL 18 lokal (`berkembang_test`). Fresh apply + replay `0001–0032`, isolasi lintas akun, daur hidup capture dan dokumen, riwayat buku kas, skenario jurnal ganda SAK EMKM (13 kategori, split bunga, determinisme, pembalikan, immutability, isolasi jurnal, reklasifikasi), dan skenario Tahap B (saldo awal, penyusutan idempoten, hitung ulang stok, keseimbangan Posisi Keuangan di setiap tahap, identitas arus kas, isi CALK) |
| Database types | **Lulus per 1 Sep 2026** | `npm run db:types:check` bersih setelah generator diajari merender fungsi `RETURNS TABLE(...)` |
| Lint kata terlarang | Lulus per 1 Sep 2026 | `npm run lint:terms`, gate baru untuk garis batas POJK 29/2024 |
| Supabase push database percobaan | Lulus setelah perbaikan | `0028` berhasil diterapkan; Local dan Remote sama sampai `0028` |

Dua error lint di `modules/readiness/readiness-repository.ts` sudah ditutup pada 1 September 2026.

Migration test yang akhirnya berjalan menemukan enam kerusakan yang selama ini tidak terlihat karena gate-nya tidak pernah dieksekusi sejak `0024`. Semuanya berasal dari rangkaian migrasi roleless `0024–0027`, bukan dari `0029`. Rinciannya di Bagian 10.3.

## 12. Kesiapan setiap area

Legenda:

- **Siap demo**: alur ada dan memakai data nyata, dengan prasyarat environment/migrasi terpenuhi;
- **Terbatas**: alur ada tetapi memiliki batas provider, operasi, atau quality gate;
- **Simulasi**: data/visual belum menjadi operasi nyata;
- **Belum ada**: baru target proposal.

| Area | Status | Syarat/catatan |
| --- | --- | --- |
| Landing dan terms | Siap demo | Build lulus |
| Login/register UMKM | Siap demo | Supabase Auth dan bootstrap harus aktif |
| Beranda UMKM | Siap demo | Bergantung migrasi readiness/ledger/document |
| Catat melalui teks | Terbatas | Database sudah sinkron; uji runtime pengguna masih diperlukan |
| Catat melalui suara | Terbatas | Sama; Groq key tersedia lokal |
| Review dan konfirmasi transaksi | Terbatas | Perlu regression test DB setelah `0028` |
| Buku kas/laporan/CSV | Siap demo | Migrasi `0021` harus ada di remote |
| Jurnal ganda SAK EMKM (Tahap A) | Siap demo | `db:test` lulus; tinggal `supabase db push` `0029`–`0031` ke remote |
| Saldo awal, penyusutan, stok (Tahap B) | Siap demo | Wizard enam pertanyaan, dan bisa diperbaiki kapan saja |
| Koreksi kondisi awal & register alat/pinjaman | Siap demo | `0032`; koreksi menghitung ulang penyusutan dan mempertahankan riwayat cicilan |
| Mode Warung tab "Bulan Ini" | Siap demo | Angka berasal dari `fn_warung_monthly` |
| Laporan Posisi Keuangan, Arus Kas, CALK | Siap demo | Tiga laporan SAK EMKM lengkap dengan dua kolom pembanding |
| Berkas laporan PDF untuk bank | Siap demo | Delapan halaman, dirender server, langsung terunduh sebagai berkas |
| Mode Akuntan | Belum ada | Target Tahap C |
| Tutup kas dan pembatalan | Siap demo | Migrasi `0021/0027` harus sinkron |
| Dokumen privat | Siap demo | Migrasi `0016–0020` dan private bucket harus aktif |
| OCR gambar | Siap demo terbatas | Groq tersedia; kualitas gambar menentukan hasil |
| OCR PDF | Belum aktif pada env lokal | Isi OpenAI/Gemini atau gunakan gambar |
| Konfirmasi hasil OCR | Siap demo | Bukan verifikasi keaslian |
| Readiness/missions | Siap demo | Rules `wp08-pilot-v1`, bukan credit score |
| Kandidat anonim institusi | Siap demo | Institusi harus terautentikasi |
| Consent, snapshot, revoke | Siap demo | Migrasi `0023` harus aktif |
| Analytics institusi | Simulasi | Sudah diberi label |
| Admin CRUD/audit | Terbatas | Perlu uji role E2E dan lint cleanup |
| Admin analytics/rules preview | Sebagian simulasi | Sudah diberi label |
| Chatbot/RAG Copilot | Belum ada | Route lama dinonaktifkan |
| Integrasi eksternal | Belum ada | Masih roadmap |

## 13. Prioritas pekerjaan berikutnya

### P0 — sebelum push/deploy berikutnya

1. ~~Perbaiki sintaks migration `0028`.~~ Selesai 1 September 2026.
2. ~~Tambahkan `0028` ke migration contract dan database verification list.~~ Selesai.
3. Jalankan fresh apply, replay, generated type check, lint, typecheck, dan build lengkap.
4. Perbaiki dua error lint pada readiness repository.
5. ~~Push ulang `0028`, lalu pastikan Local/Remote sama.~~ Selesai pada database percobaan.
6. Uji manual satu catatan teks, satu suara, satu gambar NIB, konfirmasi transaksi, laporan, readiness, dan consent institusi.

### P1 — sebelum pilot dengan pengguna nyata

1. Scheduler recovery untuk AI job tertinggal.
2. Monitoring antrean, latency, provider error, dan correction rate tanpa data mentah.
3. Rate limit dan quota per pengguna/usaha.
4. Verifikasi/approval institusi oleh operator sebelum portal aktif.
5. Malware scanning dokumen.
6. Tambah provider yang mendukung PDF atau layanan konversi PDF yang aman.
7. E2E tiga role dan cross-account terhadap staging terisolasi.
8. Upgrade Next.js setelah membaca migration guide versi target dan menjalankan regression test penuh.

### P2 — realisasi teknologi proposal

1. RAG dari regulasi/panduan resmi dengan versioning dan citation.
2. Copilot dengan ruang jawaban terbatas, sumber terlihat, dan evaluasi hallucination.
3. Integrasi data alternatif berdasarkan consent dan perjanjian mitra.
4. Kalibrasi readiness rule menggunakan hasil pilot.
5. Model prediktif hanya setelah tersedia dataset legal dan governance model.
6. Pemisahan worker ke microservice jika metrik beban membuktikan kebutuhan.

## 14. Cara menjalankan untuk review lokal

Prasyarat:

- Node.js 22;
- `.env.local` berisi URL, anon key, service role key, dan minimal satu AI provider;
- migrasi remote sudah sinkron dan tidak memiliki migration error.

Perintah:

```powershell
npm.cmd install
npm.cmd run dev
```

Buka `http://localhost:3000`.

Quality gate:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:integration
npm.cmd run db:types:check
npm.cmd run build
```

Untuk database test lokal, gunakan database PostgreSQL khusus dengan nama berakhiran `_test`:

```powershell
$env:DATABASE_TEST_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/berkembang_test"
npm.cmd run db:test
```

Script menolak host non-local dan database yang namanya tidak berakhiran `_test` karena proses pengujian menghapus serta membangun ulang schema test.

### 14.1 Akun demo berisi catatan lengkap

`npm run seed:demo` menyiapkan satu akun UMKM dengan tiga bulan catatan lengkap dan **dua** akun institusi — sehingga seluruh alur produk dapat diperagakan hidup, bukan lewat tangkapan layar.

Dua institusi, bukan satu, karena basis data hanya mengizinkan satu akses aktif per pasangan institusi-usaha (`consent_grants_one_active_relationship_idx`) dan satu permintaan yang menunggu (`dossier_requests_one_pending_idx`). Itu aturan privasi, bukan keterbatasan. Agar demo dapat menampilkan kedua keadaan sekaligus, akses yang **sudah disetujui** dipegang koperasi dan permintaan yang **menunggu keputusan** datang dari bank — siap disetujui pemilik di depan penonton.

```powershell
$env:DEMO_PASSWORD = "sandi-demo-yang-panjang"
npm.cmd run seed:demo -- --project <ref-proyek>
```

**Keputusan yang paling menentukan: skrip ini masuk sebagai pengguna dan memanggil RPC yang sama persis dengan yang dipakai aplikasi.** Ia tidak pernah menyisipkan baris lewat service role. Alasannya bukan kerapian: menyisipkan langsung ke `transactions` akan melewati `fn_post_transaction_journal`, sehingga data demo punya transaksi tanpa jurnal — Buku Kas terlihat penuh, tetapi Posisi Keuangan, Arus Kas, dan Mode Akuntan kosong, dan itu baru ketahuan di depan juri. Lewat RPC, setiap angka demo dijamin bisa dihasilkan aplikasi sungguhan.

**Yang terbentuk:** kondisi awal usaha (uang, stok, piutang, pinjaman koperasi, kulkas dan etalase), sekitar 200 transaksi menutupi kesepuluh kategori termasuk ambilan untuk rumah dan piutang pelanggan, pembelian alat di atas maupun di bawah ambang Rp500.000, cicilan bulanan dengan bunganya dipisah, hitungan stok untuk bulan-bulan yang sudah selesai, tutup kas untuk semua hari kecuali dua hari terakhir, serta penyusutan, perkiraan pajak, dan indikator yang sudah dihitung.

**Tiga pengaman:**

1. Kata sandi dibaca dari `DEMO_PASSWORD` dan tidak pernah ada di repositori. Akun demo hidup di proyek yang sama dengan data asli; sandi yang ikut terkomit membuat siapa pun yang membaca repositori bisa masuk.
2. Ref proyek wajib disebut lewat `--project` dan harus cocok dengan `.env`. Ini yang mencegah data demo mendarat di proyek yang salah karena satu berkas env tertukar.
3. Skrip menolak jalan bila migrasi terbaru belum ada di sasaran — tanpa itu datanya tampak masuk tetapi separuh layar tetap gagal.

Aman dijalankan berulang: setiap transaksi memakai kunci idempotensi tetap, dan angkanya berasal dari pengacak bernih tetap sehingga tangkapan layar bahan presentasi tidak berubah antara latihan dan hari-H.

## 15. Alur demo yang direkomendasikan

1. Daftar atau login sebagai UMKM.
2. Tunjukkan beranda dan jelaskan “Kesiapan Data Usaha”, bukan kelayakan kredit.
3. Rekam transaksi sederhana.
4. Tunjukkan bahwa AI hanya menyiapkan draft.
5. Koreksi satu field lalu konfirmasi.
6. Buka laporan dan tunjukkan perubahan total.
7. Unggah gambar NIB setelah membaca persetujuan.
8. Tunjukkan hasil OCR dan konfirmasi pemilik.
9. Buka Perjalanan untuk melihat bukti, gap, dan misi.
10. Masuk sebagai institusi, cari kandidat anonim, dan kirim permintaan akses.
11. Kembali sebagai pemilik, setujui scope terbatas.
12. Tunjukkan profil snapshot di institusi serta fitur pencabutan akses.

Jangan mendemokan analytics simulasi sebagai data nyata dan jangan menyatakan OCR sebagai verifikasi keaslian.

## 16. Definisi selesai untuk MVP

MVP dapat dinyatakan siap pilot setelah seluruh kondisi berikut terpenuhi:

- migration fresh apply dan replay lulus sampai versi terbaru;
- local dan remote migration history sama;
- lint, typecheck, unit, integration, database test, build, dan smoke E2E hijau;
- voice/text capture berhasil dari create sampai confirm;
- dokumen privat, signed URL, consent, OCR/manual review, dan archive berjalan;
- ledger, closing, readiness, candidate, consent, access, dan revoke diuji pada staging;
- dua akun usaha tidak dapat saling membaca data;
- institusi yang belum disetujui tidak dapat mengakses profil;
- backup dan rollback plan tersedia;
- istilah produk tidak menjanjikan verifikasi atau keputusan pembiayaan otomatis.

Pada working tree 1 September 2026, sintaks dan migration contract `0028` sudah diperbaiki serta database percobaan sudah sinkron sampai `0028`. Kondisi MVP belum seluruhnya terpenuhi karena replay database test lokal, lint error, dan regression test runtime masih tersisa.
