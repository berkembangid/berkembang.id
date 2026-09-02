# Super Prompt untuk Claude Code — Tingkat Kesiapan (`wp08-pilot-v2`)

Cara pakai: simpan `SPEC_Tingkat_Kesiapan.md` ke `docs/specs/`, tempel prompt di bawah garis ke Claude Code dari root repo, sesi baru. Sesi ini = **Tahap R-A**. R-B di sesi berikutnya dengan prompt sama (ganti cakupan). Prasyarat keras: `0029`–`0032` hijau dan sesi D-P (patch Dokumen & Profil) selesai — evaluator membaca prive, tutup kas, `document_requirements`, `assurance_level`, attachments, `opening_balances`, `report_issues`.

---

Kamu adalah senior engineer di repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase, Zod, Vitest, Playwright). Tugasmu: **Tahap R-A** dari `docs/specs/SPEC_Tingkat_Kesiapan.md`. Baca spek utuh — keputusan T1–T10, tabel komponen §2, aturan tingkat §3, invarian §6 — sebelum menyentuh kode. Baca juga mockup `mockup-tingkat-kesiapan.html` (di docs/design/ — minta saya kalau tidak ada) sebagai acuan visual, dan `SPEC_Lemari_Dokumen.md` + `SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md` untuk tabel sumber. Spek adalah sumber kebenaran; konflik → berhenti dan tanya.

## Konteks yang wajib kamu pegang

- **Satu sumber kebenaran.** Setelah sesi ini, TIDAK ADA komponen UI yang menghitung kesiapan sendiri. Semua membaca `GET /api/v1/readiness`. Bagian dari tugasmu adalah **menghapus** perhitungan lama (`wp08-pilot-v1` di sisi render) dan membuktikan lewat grep + test bahwa tidak ada jalur kedua.
- **Angka mentah dilarang tampil.** Tidak ada `/100`, "dari 100", `score`, `skor`, `poin` di UI UMKM — termasuk event aktivitas. Tambahkan ke lint kamus. Eksternal = Tingkat (Mulai/Tembaga/Perak/Emas) + pilar + komponen.
- **Tidak menghukum.** Penurunan tingkat selalu lewat masa tenggang 7 hari (kartu amber ajakan); kenaikan instan + perayaan. Komponen BELUM = netral dengan ajakan, bukan merah.
- **Formula = konfigurasi ber-versi** di rules engine admin yang ada. Ambang dan jendela waktu TIDAK di-hardcode di evaluator; evaluator membaca config `wp08-pilot-v2`. Mengubah config tanpa versi baru harus ditolak engine.
- Kalimat baku di semua permukaan kesiapan: menggambarkan kelengkapan & kebiasaan pencatatan; bukan penilaian resmi, bukan skor kredit, bukan jaminan pembiayaan.

## Jebakan yang sudah kami antisipasi — tangani eksplisit

1. **B3 pada usaha tanpa belanja besar:** nol transaksi keluar ≥ Rp500rb dalam 90 hari → status `BELUM_ADA_DATA` dan komponen DIKECUALIKAN dari syarat tingkat. Usaha kecil tidak boleh terkunci dari Perak karena tidak pernah belanja besar. Tulis test khusus.
2. **Evaluasi retroaktif saat deploy:** akun lama dievaluasi sekali dan langsung mendapat tingkat sesuai datanya (akun DImsum dengan 2+ bulan data tidak boleh mulai dari "Mulai"). Batching kalau akun banyak.
3. **Bulan penuh** = bulan kalender Asia/Jakarta dengan ≥1 transaksi terkonfirmasi di ≥8 hari berbeda; test batas 31 Des/1 Jan.
4. **Kinerja:** agregasi di SQL (view/fungsi), bukan loop aplikasi; target p95 < 400 ms pada fixture 1.000 transaksi — buat benchmark test sederhana.

## Langkah kerja — berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (tanpa kode)
Ringkas ≤ 40 baris: bentuk rules engine `wp08-pilot-v1` (skema penyimpanan config, cara publish), semua tempat UI yang saat ini menghitung/menampilkan kesiapan (Beranda kartu + ring "6/7", Perjalanan, aktivitas "X dari 100", dossier, teks helper), tabel sumber yang tersedia untuk 11 komponen (§2), dan status quality gate. Jawab pertanyaan §9 spek sebisanya. **Checkpoint 0:** rencana migrasi `0033` (`readiness_daily`, `business_readiness_state`, baris config v2) + daftar file yang dihapus/diubah. Tunggu persetujuan.

### Langkah 1 — Evaluator + konfigurasi + migrasi `0033`
- Baris konfigurasi `wp08-pilot-v2` di rules engine (struktur §2–§3 sebagai jsonb; perluas skema engine bila perlu, laporkan).
- `modules/readiness/evaluator.ts`: murni (config + data → hasil), tanpa akses UI. Fungsi/view SQL per komponen A1–D3 sesuai rumus §2. Aturan tingkat §3. Status `BELUM_ADA_DATA` sesuai jebakan #1.
- `readiness_daily` + `business_readiness_state` + job snapshot harian (mekanisme job repo) + evaluasi retroaktif satu kali (jebakan #2), idempoten.
- Unit test per komponen (fixture minimal per rumus, termasuk batas kalender) + test determinisme + benchmark.

**Checkpoint 1:** test hijau; tunjukkan hasil evaluator atas fixture akun DImsum (nilai 11 komponen + tingkat) dan atas fixture usaha-baru-7-hari.

### Langkah 2 — Endpoint + pembersihan jalur lama
- `GET /api/v1/readiness` dan `GET /api/v1/readiness/methodology` sesuai kontrak §4 (Zod, RLS, cache singkat boleh ≤ 5 menit).
- "Langkah paling berdampak": komponen `missing` tingkat berikutnya dengan urutan usaha statis dari config.
- **Hapus** util/skor lama di sisi render; grep membuktikan tidak ada sisa; event aktivitas lama "X dari 100" diganti event level (tanpa angka).

**Checkpoint 2:** contoh respons JSON kedua endpoint dari akun uji; hasil grep; daftar file terhapus.

### Langkah 3 — UI
- Halaman Perjalanan → **Tingkat Kesiapan** sesuai mockup: hero tangga (arti di anak tangga Perak/Emas), kartu langkah paling berdampak, 4 kartu pilar (dot ✓/!/netral pakai token `--status-*`, nilai + ajakan + 1 aksi per komponen, ring hidup untuk A1), catatan "Tentang penilaian ini" + tautan metodologi (halaman render dari endpoint methodology, bahasa warung).
- Kartu mini Beranda menggantikan kartu lama; ring "6/7" dihapus; kartu "Langkah usaha berikutnya" membaca endpoint yang sama.
- Kenaikan tingkat → aktivitas perayaan; tidak ada implementasi penurunan/grace di R-A (itu R-B) — tetapi state `grace_until` sudah ada di skema agar R-B tidak migrasi lagi.

**Checkpoint 3:** Playwright: (1) Beranda dan halaman Kesiapan menampilkan tingkat yang sama dari satu endpoint (mock berubah → keduanya berubah); (2) akun DImsum melihat tingkat hasil retroaktif, bukan "Mulai" (sesuaikan dengan datanya yang sebenarnya); (3) tidak ada string terlarang (`/100`, score, skor, poin) di UI UMKM; (4) komponen B3 akun tanpa belanja besar tampil netral "belum ada belanja besar" dan tidak menghalangi syarat. Screenshot halaman penuh.

### Langkah 4 — Quality gate dan handoff
`lint`, `typecheck`, `test`, `test:integration`, `build`, lint kamus, benchmark. Perbarui dokumen status produk (bagian Kesiapan + Beranda + Perjalanan). Handoff ≤ 30 baris: selesai, ditunda ke R-B/R-C, keputusan sendiri yang kamu ambil, jawaban §9, dan satu paragraf "cara mendemokan halaman ini dalam 45 detik".

## Aturan komunikasi
- Bahasa Indonesia, ringkas, konkret. Commit pola repo (`feat(readiness): model tingkat empat pilar wp08-pilot-v2 (0033)`), satu commit per langkah logis.
- Pilihan sama valid + spek diam → ikuti pola repo, catat. Perubahan yang terlihat pengguna di luar spek → tanya dulu.
- Jangan menyatakan lulus tanpa menjalankan; lingkungan kurang → sebutkan yang terverifikasi dan yang belum.
- Jangan sentuh: portal institusi/dossier (R-B), grace period berjalan (R-B), formula consent, modul accounting/documents selain MEMBACA, leaderboard/reward (dilarang permanen).
- R-B dan R-C dilarang dikerjakan di sesi ini.

Mulai dari Langkah 0.
