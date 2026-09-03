# Super Prompt untuk Claude Code — Voice Capture + Live Caption "Dua Jalur"

Cara pakai: simpan `SPEC_Voice_Capture_Live_Caption.md` ke `docs/specs/` di repo, lalu tempel prompt di bawah garis ke Claude Code dari root repo. Jalankan per tahap: **V-A** dulu (sesi ini), **V-B** di sesi baru dengan prompt yang sama tapi ganti "Tahap V-A" menjadi "Tahap V-B". Prasyarat: Tahap A laporan keuangan (migrasi `0029`, `category_templates`) sudah hijau — kalau belum, kerjakan itu dulu memakai super prompt laporan keuangan.

---

Kamu adalah senior engineer yang bergabung ke repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase Auth/Postgres/RLS/Storage, Zod, Vitest, Playwright). Tugasmu: mengimplementasikan **Tahap V-A** dari spesifikasi di `docs/specs/SPEC_Voice_Capture_Live_Caption.md`. Baca dokumen itu utuh sebelum menyentuh kode, termasuk 10 keputusan V1–V10 dan register risiko R1–R14. Dokumen itu sumber kebenaran; kalau kode dan dokumen bertentangan, berhenti dan tanya saya. Spesifikasi pendamping yang juga wajib kamu baca: `docs/specs/SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md` (kategori 1–10, `category_templates`, posting jurnal) — fitur voice bermuara di alur confirm yang sama.

## Konteks produk yang wajib kamu pegang

BERKEMBANG.ID membantu UMKM mikro membentuk catatan usaha yang bisa dibaca bank. Voice adalah cara input utama, dan metrik utamanya adalah **persen ucapan yang dikonfirmasi tanpa diedit** — bukan word error rate. Konsekuensi untuk kodemu:

- **Angka hanya boleh lahir dari parser deterministik.** LLM tidak pernah menghasilkan, memperbaiki, atau "membulatkan" nominal. Skema Zod untuk output LLM tidak memiliki field angka; kalau model mengembalikan angka di field lain, parsing gagal keras dan tercatat di telemetry. Ini penguatan dari prinsip `no-fallback-nominal` yang sudah ada di repo — cari dan baca implementasinya sebelum menulis milikmu.
- **Tidak pernah auto-confirm.** Draf selalu melewati kartu konfirmasi. Maksimal satu pertanyaan per draf.
- Tidak ada string `skor kredit`, `layak kredit`, `plafon`, `disetujui`, `ditolak` di UI atau pesan apa pun (lint teks yang sudah dibuat di tahap laporan keuangan berlaku di sini juga).
- UI memakai bahasa warung dan token warna dari `app/styles/tokens.css` (`--fill-primary`, `--status-alert-*`, dst). Merah hanya untuk kegagalan sistem, tidak pernah untuk perilaku pengguna.
- Transkrip mentah dan audio tidak pernah masuk log/telemetry/audit event. PII di ucapan (nama pelanggan) hanya boleh berada di tabel capture yang ber-RLS.

## Prinsip arsitektur (tidak bisa ditawar)

1. **Dua jalur, server yang memilih.** Transkrip klien confidence ≥ ambang (env, default 0,85) DAN parser server menemukan nominal → proses teks tanpa Whisper. Selain itu → audio ke Whisper via jalur Groq yang sudah ada (dengan circuit breaker yang sudah ada). `client_hints` tidak pernah dipercaya — hanya dibandingkan untuk telemetry divergensi.
2. **Parser = paket TypeScript murni** di `packages/nominal-parser` (atau folder paket yang sesuai konvensi repo): tanpa dependensi runtime, tanpa akses jaringan/DB, deterministik, dipakai identik di klien dan server. Semua 11 aturan di Bagian 3.1 spek harus punya test.
3. **Kompatibel mundur.** `POST /api/v1/captures` yang lama (audio saja) tetap berfungsi tanpa perubahan klien. Field baru semuanya opsional.
4. **Idempoten end-to-end.** `idempotency_key` yang sudah ada mengalir sampai `journal_entries`. Retry tidak pernah menghasilkan draf atau jurnal ganda.
5. **Ikuti pola repo:** modul domain di `modules/*`, Route Handler di `app/api/v1/*`, validasi Zod, RLS, nominal `bigint` rupiah bulat, batas hari Asia/Jakarta, audit event tanpa PII, tidak ada `any`.

## Langkah kerja — berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (jangan tulis kode)
Baca dan ringkas untuk saya, maksimal 40 baris:
- `modules/ai/*` dan alur `/api/v1/captures` → `confirm`: format request sekarang (JSON atau multipart?), di mana Whisper dipanggil, bagaimana circuit breaker dan idempotency key bekerja, kapan audio dihapus, bentuk status (`needs_review` dll).
- Bagaimana `no-fallback-nominal` diimplementasikan sekarang.
- Apakah `0029` (`category_templates`, `journal_entries`) sudah ada dan hijau. Kalau belum, **berhenti dan laporkan** — jangan lanjut.
- Jawab lima pertanyaan di Bagian 11 spek sejauh bisa dijawab dari kode; sisanya tandai untuk saya.
- Jalankan `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`; laporkan apa adanya.

**Checkpoint 0:** ajukan rencana: struktur paket parser, perubahan skema request/response `/captures`, file yang disentuh, dan keputusan multipart vs signed-upload-URL berdasarkan apa yang kamu temukan (jangan mengubah mekanisme upload yang ada kalau tidak perlu). Tunggu persetujuan saya.

### Langkah 1 — Paket `nominal-parser`
- Implementasikan `parseUtterance` sesuai kontrak Bagian 3 spek: kata bilangan, campuran digit, prefiks se-, desimal lokal, tabel slang, ambiguitas dua kandidat (jangan tebak "lima ratus"), fuzzy Levenshtein ≤ 1, multi-transaksi via pemisah + ≥ 2 nominal, tanggal relatif Asia/Jakarta, unit kuantitas (kilo/ekor/bungkus/pcs/porsi) bukan nominal, tidak pernah nol/negatif.
- Tabel slang dan pemisah sebagai data (konstanta terekspor), bukan tersebar di regex, supaya bisa diperluas per daerah tanpa menyentuh logika.
- ≥ 150 unit test dari tabel spek + property test (stabil terhadap kapitalisasi, spasi ganda, tanda baca). Sertakan kasus jebakan: "3 kilo ayam 90 ribu" → 90000 saja; "laku 50 ribu sama beli gas 22 ribu" → 2 segmen; "gocap" vs "gopek"; "tiga pulu ribu" → 30000.
- Ekspor juga tipe hasil untuk dipakai FE dan server.

**Checkpoint 1:** semua test hijau; tunjukkan ringkasan cakupan aturan (aturan 1–11 → jumlah test per aturan).

### Langkah 2 — Router jalur + respons diperluas di server
- Perluas skema `POST /api/v1/captures`: `client_transcript {text, confidence, engine, lang}`, `client_hints`, dua-duanya opsional; validasi minimal satu sumber; batas audio 15 dtk / 500 KB → 413.
- Router sesuai Bagian 4.3: TEXT_ONLY / WHISPER / NEEDS_INPUT. Ambang dari env `VOICE_CLIENT_TRANSCRIPT_MIN_CONF` (default 0.85).
- Jalankan parser server atas transkrip terpilih; kategori: kata kunci dari `category_templates.trigger_keywords` dulu, LLM hanya saat ambigu/kosong, output Zod tanpa field angka, dengan `evidence_span`.
- Bentuk respons sesuai Bagian 4.2: `amount_candidates[]`, `category {code, source, confidence, evidence_span}`, `questions[]` maks 1, `path`, `processing_ms`. Gating tingkat TINGGI/SEDANG/RENDAH dihitung di server dan dikirim sebagai `tier`.
- Multi-segmen → beberapa draf dalam satu capture, masing-masing dikonfirmasi terpisah memakai alur yang ada.
- Telemetry event Bagian 8 (tanpa transkrip/audio), termasuk counter `llm_amount_violation` yang harus selalu 0.

**Checkpoint 2:** unit + integration test hijau untuk: TEXT_ONLY dipilih saat syarat terpenuhi (dan Whisper TIDAK dipanggil — assert via mock), fallback ke WHISPER, NEEDS_INPUT saat keduanya gagal, ambiguitas "lima ratus" menghasilkan 2 kandidat + 1 pertanyaan, retry idempoten. Tunjukkan contoh respons JSON nyata dari akun uji untuk 3 skenario.

### Langkah 3 — Kartu konfirmasi + jalur teks di FE (tanpa mikrofon dulu)
- Kartu draf baru: nominal besar, chip kategori 1–10 (label dari `category_templates.label_umkm`, terpilih sesuai draf, lainnya terlihat pada tier SEDANG), tanggal, metode bayar; sorot `evidence_span` pada transkrip; tier RENDAH menampilkan SATU pertanyaan (numpad atau 2 chip nominal).
- Input teks di layar Catat memakai jalur yang sama (`client_transcript` dengan `engine: "typed"`, confidence 1) — ini yang dipakai demo dan pengguna tanpa mic.
- Ketukan dihitung dan dikirim di event `draft_confirmed`.
- Jangan sentuh `SpeechRecognition`/`MediaRecorder` di tahap ini (itu V-B).

**Checkpoint 3:** Playwright end-to-end 5 skenario ketik: (1) "tadi laku 35 ribu qris" → 2 ketuk tersimpan → jurnal Dr Bank / Cr Pendapatan; (2) "ambil 300 ribu buat SPP anak" → untung bersih tidak berubah, kotak Diambil untuk rumah bertambah; (3) "belanja tepung 200 ribu sama gas 22 ribu" → 2 draf → 2 entry; (4) "lima ratus" → pertanyaan 2 chip; (5) "Bu Ani ngutang 50 ribu" → piutang, muncul di pelanggan belum bayar. Sertakan screenshot.

### Langkah 4 — Quality gate dan handoff
Jalankan dan laporkan apa adanya: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, lint kata terlarang, dan CI bundle-size check untuk modul baru (dynamic import, parser klien < 15 KB gzip — siapkan pemeriksaannya sekarang meski SpeechRecognition baru masuk di V-B). Perbarui dokumen status produk di bagian Capture. Ringkasan handoff ≤ 30 baris: selesai, ditunda ke V-B/V-C, risiko, jawaban lima pertanyaan Bagian 11, dan skrip demo 5 ucapan yang terbukti jalan.

## Aturan komunikasi

- Bahasa Indonesia, ringkas, angka dan nama file konkret.
- Pesan commit pola repo, contoh: `feat(voice): paket nominal-parser dan router dua jalur di captures`. Satu commit per langkah logis.
- Dua pilihan sama valid dan spek diam → pilih yang paling dekat pola repo, catat di komentar dan handoff. Mengubah perilaku yang UMKM lihat → tanya dulu.
- Jangan pernah menyatakan lulus tanpa menjalankan. Lingkungan tanpa kunci Groq/Supabase → katakan, tunjukkan yang terverifikasi dan yang belum (test parser dan router harus tetap jalan penuh dengan mock).
- Jangan sentuh: modul `consent`, `readiness`, portal institusi, portal admin, mekanisme penghapusan audio, dan endpoint di luar daftar spek.
- Jangan kerjakan V-B (SpeechRecognition, MediaRecorder, caption live, antrean IndexedDB, deteksi kemampuan) atau V-C (golden set CI, tuning ambang) di sesi ini meskipun terlihat mudah. V-A harus hijau dan di-review dulu.

Mulai dari Langkah 0.
