# Spesifikasi Fitur: Voice Capture + Live Caption "Dua Jalur"

**Produk:** BERKEMBANG.ID · Tim P0160
**Modul:** `ai` / `captures` (diperluas) + paket baru `@berkembang/nominal-parser`
**Versi:** 1.0 · 2 September 2026
**Untuk:** Harsya (CTO) · cc: Yosua (UX) · **Dari:** Hadi
**Melengkapi:** *SPEC Laporan Keuangan Satu Engine Dua Wajah* v1.0 (kategori 1–10, posting jurnal), *Standar Pencatatan sebagai Fondasi Build* v1.0, audit *Status Produk Terkini 2026-08-31*
**Prasyarat:** P0 audit selesai (migrasi `0028` hijau). Tahap A laporan keuangan (`0029`) berjalan paralel; fitur ini menulis ke alur `captures → confirm` yang sama.

> **Satu kalimat untuk dipegang saat build:**
> Voice bukan fitur transkripsi. Voice adalah cara tercepat menghasilkan satu baris jurnal yang benar. Metrik utamanya bukan word error rate, melainkan **persen ucapan yang dikonfirmasi tanpa diedit**.

---

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| V1 | **Caption langsung memakai `SpeechRecognition` browser** (on-device/vendor, `lang: id-ID`, `interimResults`), bukan streaming STT ke server. | Latensi ~100–300 ms, biaya nol, tanpa WebSocket server. Caption adalah umpan balik, bukan kebenaran. |
| V2 | **Audio tetap direkam paralel** via `MediaRecorder` (Opus mono, target 16 kHz, ≤ 15 detik) sebagai asuransi. | Kalau transkrip browser buruk/tidak ada, server transkripsi via Groq Whisper (jalur yang sudah ada). |
| V3 | **Server memilih jalur**: transkrip browser confidence tinggi + nominal ketemu → proses teks saja (tanpa upload/Whisper). Selain itu → audio ke Whisper. | Estimasi ≥ 60% permintaan tanpa biaya STT dan p50 draf < 1 detik. Diukur, bukan diasumsikan. |
| V4 | **Angka hanya dari parser deterministik.** LLM dilarang menghasilkan nominal; tugas LLM hanya `category_code` 1–10 + `confidence` + `evidence_span`, itu pun hanya bila kata kunci ambigu. | Perkuat prinsip `no-fallback-nominal` yang sudah ada. Angka yang dikarang LLM = jurnal salah = kepercayaan hancur. |
| V5 | **Parser nominal = paket TypeScript murni** `@berkembang/nominal-parser`, dipakai identik di klien (chip nominal live) dan server (kebenaran). | Satu sumber, satu test suite, bisa diuji 100% offline di CI. |
| V6 | **Gating tiga tingkat, tidak pernah auto-confirm, maksimal satu pertanyaan.** | Target median 2 ketukan sampai tersimpan. |
| V7 | **Push-to-talk**, berhenti otomatis setelah 1,5 detik hening atau 15 detik. Tanpa wake word, tanpa always-on. | Baterai, privasi, biaya. |
| V8 | **Antrean offline** di IndexedDB dengan idempotency key yang sudah ada, kirim ulang otomatis. | Segmen pengguna 3G/sinyal putus-putus. Catatan tidak boleh hilang. |
| V9 | **Toggle "caption langsung" bisa dimatikan** + disclosure bahwa caption browser dapat memproses audio di server vendor (Chrome → Google). Audio milik kita tetap dihapus setelah draf (perilaku yang sudah ada). | Kepatuhan UU PDP 27/2022; jujur di layar izin mikrofon. |
| V10 | **Tidak dibangun sekarang:** streaming STT WebSocket, wake word, fine-tune Whisper logat. | Masuk akal hanya jika data pilot membuktikan jalur browser gagal di > 40% perangkat. |

---

## 1. Arsitektur

```
                         ┌─ KLIEN ────────────────────────────────────────────┐
 tahan tombol ► getUserMedia ─┬─► SpeechRecognition (id-ID, interim) ─► CAPTION
                              │         │ transkrip final + confidence
                              │         ▼
                              │   nominal-parser (klien) ─► chip "Rp 35.000" live
                              │
                              └─► MediaRecorder (Opus ≤15 dtk) ─► blob
                                        │
                    lepas tombol / hening 1,5 dtk / 15 dtk
                                        │
                              antrean IndexedDB (idempotency_key)
                                        ▼
                         POST /api/v1/captures  { transcript? , audio? , hints? }
                         └────────────────────────────────────────────────────┘
                         ┌─ SERVER ───────────────────────────────────────────┐
                         │ router jalur:                                       │
                         │  transkrip ada && conf ≥ 0,85 && parser server      │
                         │  menemukan nominal  ──────────────► pakai teks      │
                         │  selain itu && audio ada ─► Whisper (Groq) ─► teks  │
                         │  keduanya gagal ─► status NEEDS_INPUT (tanya)       │
                         │        ▼                                            │
                         │  nominal-parser (server, kebenaran)                 │
                         │        ▼                                            │
                         │  kategori: kata kunci ─► (ambigu?) LLM kecil        │
                         │        ▼                                            │
                         │  draft + amount_candidates + questions (≤1)         │
                         └─────────────────────────────────────────────────────┘
                                        ▼
                    kartu konfirmasi ► confirm ► transaksi ► JURNAL (spek 0029)
```

Alur `confirm`, idempotency, circuit breaker, dan penghapusan audio **tidak berubah** — fitur ini memperkaya input dan menambah router jalur, bukan mengganti pipeline.

---

## 2. Frontend

### 2.1 Deteksi kemampuan (saat layar Catat dibuka, sekali)

| Kondisi | Perilaku |
|---|---|
| `SpeechRecognition` ada dan izin mic diberikan | Mode penuh: caption + rekam paralel |
| `SpeechRecognition` tidak ada (WebView lama, Firefox, sebagian iOS) | Mode rekam: tanpa caption; umpan balik = meter level suara 5 batang (throttle 10 fps) + teks "Mendengarkan…" |
| Izin mic ditolak / tidak ada mic | Mode ketik: keypad nominal + 10 chip kategori. Tombol ketik SELALU sebesar tombol suara di semua mode |
| `MediaRecorder` tidak dukung Opus | fallback `audio/webm` default perangkat; server menerima keduanya |

Simpan hasil deteksi di state, jangan deteksi ulang tiap rekaman. Kirim `capability_profile` di telemetry (tanpa PII) agar kita tahu sebaran perangkat pilot.

### 2.2 Interaksi rekam
- **Push-to-talk**: tahan tombol besar (≥ 72px) atau ketuk untuk mulai/berhenti (dua-duanya; uji dengan Yosua mana yang menang).
- Berhenti otomatis: 1,5 detik hening (deteksi via analyser level, threshold adaptif) atau 15 detik keras.
- Saat merekam: caption interim tampil kata per kata; begitu parser klien menemukan nominal, tampilkan **chip nominal besar** ("Rp 35.000") yang menempel di atas caption — ini momen "sistem mengerti saya".
- Setelah berhenti: kartu draf muncul menggantikan caption, bukan di layar baru.

### 2.3 Kinerja dan bobot (hard budget)
- Modul voice (recorder + SpeechRecognition wrapper + parser klien) dimuat via `dynamic import` saat layar Catat dibuka: **< 15 KB gzip**, tanpa SDK STT pihak ketiga di klien.
- Tidak ada waveform canvas 60 fps. Meter level = 5 elemen div, update via rAF throttle 10 fps, atau animasi CSS murni.
- Interim caption di-render ke satu node teks (replace, bukan append DOM per kata).
- Rekaman disimpan sebagai satu Blob; jangan pecah chunk ke state React per detik.
- Lighthouse layar Catat di profil "Moto G Power 3G": TTI tidak boleh memburuk > 200 ms dibanding sebelum fitur.

### 2.4 Antrean offline
- IndexedDB store `pending_captures`: `{idempotency_key, transcript?, audio_blob?, hints, captured_at, retries}`.
- Kirim saat online (listener `online` + retry backoff 5s/30s/2m/10m, maks 24 jam).
- Badge di layar Catat: "3 catatan menunggu sinyal". Setelah terkirim dan draf kembali, masuk daftar `needs_review` biasa.
- Audio di antrean terenkripsi at-rest tidak tersedia di IndexedDB — mitigasi: hapus dari antrean segera setelah server ack, dan jangan simpan > 24 jam (hapus + beri tahu pengguna untuk mencatat manual).

### 2.5 Aksesibilitas dan bahasa
- Caption juga berfungsi sebagai aksesibilitas: `aria-live="polite"` pada node caption.
- Semua teks mengikuti padanan Mode Warung (tanpa istilah teknis): "Mendengarkan…", "Kami tulis dulu ya…", "Cek dulu, baru simpan".
- Palet mengikuti tokens v1.0: tombol rekam `--fill-primary` (mint-400/teks navy), chip nominal `--bg-card` dengan angka `--data-untung`, state error hanya `--status-alert-*` untuk kegagalan sistem.

---

## 3. Paket `@berkembang/nominal-parser`

TypeScript murni, tanpa dependensi runtime, deterministik. Ekspor:

```ts
parseUtterance(text: string, opts?: {now?: Date; locale?: "id" | "id-btw" | "id-su"}): {
  segments: Array<{                       // ≥1; >1 bila terdeteksi multi-transaksi
    amounts: Array<{value: number; span: [number, number]; confidence: 1 | 0.5}>,
    date: {value: string /* YYYY-MM-DD Asia/Jakarta */; span?: [number,number]; source: "explicit" | "default"},
    paymentHint?: "TUNAI" | "QRIS" | "TRANSFER" | "BELUM_DIBAYAR",
    categoryHint?: {code: 1|2|3|4|5|6|7|8|9|10; subtype?: string; matchedKeyword: string},
    counterpartyHint?: {name: string; span: [number,number]},
    residualText: string
  }>
}
```

### 3.1 Aturan nominal (wajib lulus semua)
1. Kata bilangan Indonesia penuh: "tiga puluh lima ribu" → 35000; "dua juta tiga ratus" → 2300000.
2. Campuran digit: "35 ribu / 35rb / 35k / 35.000 / Rp35.000" → 35000.
3. Prefiks se-: "seribu, seratus, sejuta, setengah juta, seperempat juta" → 1000, 100, 1000000, 500000, 250000.
4. Desimal lokal: "1,2 juta" → 1200000; "2 setengah juta" → 2500000.
5. Slang (tabel dapat diperluas per daerah): goceng 5000, ceban 10000, noban 20000, gocap 50000 (konteks uang; hati-hati "gocap" vs "gopek"), gopek 500, cepek 100 (konteks ribuan: "cepek ceng" 100000), seceng 1000, sepuluh ceng 10000, sejt/sejuta 1000000.
6. **Ambiguitas tidak ditebak**: "lima ratus" → dua kandidat {500 conf 0,5; 500000 conf 0,5}. Prior per sektor BOLEH dipasang nanti hanya dengan data pilot, lewat konfigurasi, bukan hardcode.
7. Toleransi salah dengar STT: fuzzy match kata bilangan (Levenshtein ≤ 1) — "tiga pulu", "ratuss".
8. Multi-transaksi: pemisah "sama / terus / dan / abis itu / lalu" DAN ≥ 2 nominal → pecah segmen. Satu nominal + pemisah → tetap satu segmen.
9. Tanggal: "kemarin", "tadi pagi/siang/malam", "hari Minggu (terdekat ke belakang)", "tanggal 28"; default hari ini Asia/Jakarta. Tanggal masa depan → tolak dengan pertanyaan.
10. Angka yang bukan uang: "3 kilo ayam 90 ribu" → 90000 (unit "kilo/ekor/bungkus/pcs/porsi" menandai kuantitas, bukan nominal). Kuantitas masuk `residualText`.
11. Nol dan negatif tidak pernah dihasilkan.

### 3.2 Kata kunci kategori (lapis sebelum LLM)
Tabel `keyword → (code, subtype)` dimuat dari `category_templates.trigger_keywords` (spek 0029), contoh minimum sektor pangan olahan: laku/laris/kejual→1; sewa etalase masuk/komisi titip→2; bayar utangnya/lunasin→3 (arah masuk); modal dari/nambah modal→4a; cair/pinjaman→4b; belanja/kulak/beli bahan/tepung/ayam/minyak→5; gas→6/5210; listrik/wifi/token→6/5220; gaji/upah→6/5230; sewa→6/5240; plastik/stiker/kemasan/dus→6/5250; ongkir/kurir/bensin antar→6/5260; endorse/iklan/admin shopee→6/5270; nyicil/cicilan/angsuran→7; beli kulkas/etalase/kompor/mesin→8; buat rumah/anak/SPP/dapur/pribadi/jajan anak→9; ngutang/kasbon/bon dulu/bayar nanti→10.
Konflik kata kunci (≥ 2 kategori terpicu) → LLM. Tanpa kata kunci sama sekali → LLM. LLM output Zod-validated: `{category_code, subtype?, confidence, evidence_span}`; **field nominal tidak ada di skema** — kalau model mengembalikan angka, parsing gagal keras dan dicatat.

### 3.3 Test suite
- ≥ 150 kasus unit di repo (mulai dari tabel 3.1–3.2; saya siapkan 100 kasus awal terpisah).
- Property test: hasil parser stabil terhadap kapitalisasi, spasi ganda, dan tanda baca.
- Golden set 300 ucapan nyata (lihat Bagian 7) dijalankan di CI sebagai regression: laporan akurasi per kelas, build gagal jika nominal-exact turun di bawah ambang.

---

## 4. Kontrak API

### 4.1 `POST /api/v1/captures` (diperluas, kompatibel mundur)
```jsonc
{
  "idempotency_key": "uuid",
  "captured_at": "2026-09-02T09:31:00+07:00",
  "client_transcript": {            // opsional
    "text": "tadi laku tiga puluh lima ribu qris",
    "confidence": 0.91,
    "engine": "web-speech",
    "lang": "id-ID"
  },
  "client_hints": {                 // opsional, HANYA petunjuk, tidak dipercaya
    "amounts": [35000],
    "category_code": 1,
    "payment": "QRIS"
  }
  // + multipart field `audio` (opus/webm, ≤ 15 dtk, ≤ 500 KB) — opsional
}
```
Validasi: minimal satu dari `client_transcript`/`audio`; audio > 15 dtk atau > 500 KB → 413; rate limit 60 capture/pengguna/hari (konfigurasi).

### 4.2 Respons draf (diperluas)
```jsonc
{
  "capture_id": "…",
  "status": "NEEDS_REVIEW" | "NEEDS_INPUT",
  "transcript": {"text": "…", "source": "CLIENT" | "WHISPER"},
  "drafts": [{
    "amount_candidates": [{"value": 35000, "confidence": 1, "span": [10, 33]}],
    "category": {"code": 1, "source": "KEYWORD" | "LLM", "confidence": 0.97, "evidence_span": [5, 9]},
    "payment_method": "QRIS",
    "occurred_on": "2026-09-02",
    "counterparty_suggestion": null
  }],
  "questions": [ /* maks 1 */ {"field": "amount", "type": "NUMPAD" | "CHOICE", "choices": [500, 500000]} ],
  "path": "TEXT_ONLY" | "WHISPER",          // untuk telemetry
  "processing_ms": 640
}
```
`evidence_span`/`span` dipakai FE untuk menyorot kata di caption — pengguna melihat *kenapa* sistem menebak begitu.

### 4.3 Router jalur (server)
```
if transcript && confidence ≥ 0.85 && parser(transcript).amounts tidak kosong → TEXT_ONLY
elif audio → WHISPER (Groq, circuit breaker yang ada) → parser
elif transcript → parser (confidence rendah tapi hanya itu yang ada) → gating akan bertanya
else → 422
```
Ambang 0,85 = konfigurasi env, bukan konstanta. `client_hints` hanya dibandingkan untuk telemetry divergensi klien-server, tidak pernah dipakai sebagai kebenaran.

---

## 5. Gating kepercayaan (server memutuskan, FE merender)

| Tingkat | Kondisi | UI | Ketukan target |
|---|---|---|---|
| TINGGI | 1 kandidat nominal conf 1; kategori KEYWORD; transkrip conf ≥ 0,85 | Kartu ringkas + tombol **Simpan** + tautan "ubah" | 2 (stop + simpan) |
| SEDANG | 1 kandidat nominal; kategori LLM conf ≥ 0,7 ATAU 2 kandidat kategori | Kartu + chip kategori (terpilih otomatis, lainnya terlihat) | 3 |
| RENDAH | nominal 0 atau ≥ 2 kandidat, ATAU semua conf rendah | SATU pertanyaan: numpad nominal ATAU 2 chip nominal | 4 |

Tidak pernah auto-confirm. Tidak pernah > 1 pertanyaan per draf. Multi-transaksi → kartu berurutan, masing-masing dengan gating sendiri.

---

## 6. Register risiko (dipantau, bukan hanya ditulis)

| # | Risiko | P | D | Mitigasi | Sinyal pemantau |
|---|---|---|---|---|---|
| R1 | `SpeechRecognition` tak tersedia di WebView/HP lama | T | S | Mode rekam + meter level; jalur Whisper | `capability_profile` telemetry |
| R2 | Izin mic ditolak | S | S | Mode ketik setara, tidak pernah memblokir | rasio mode ketik |
| R3 | Bising pasar/dapur → nominal salah | T | T | parser + gating + klip ≤ 15 dtk + golden set kelas "bising" | akurasi kelas bising; rasio edit nominal |
| R4 | Jaringan putus | T | T | antrean IndexedDB + retry + badge | umur antrean p95 |
| R5 | Groq down / lambat | S | S | circuit breaker (ada) → TEXT_ONLY tetap hidup; NEEDS_INPUT sebagai dasar | error rate provider; rasio path |
| R6 | Biaya STT/LLM membengkak | S | S | TEXT_ONLY default; cap 15 dtk; 60 capture/hari; LLM hanya saat ambigu | biaya per capture; rasio TEXT_ONLY |
| R7 | LLM mengarang angka | R | **F** | skema tanpa field angka; gagal keras + log | counter pelanggaran (harus 0) |
| R8 | Duplikasi retry | R | T | idempotency key end-to-end sampai jurnal (spek 0029) | duplikat per hari (harus 0) |
| R9 | Privasi caption vendor (Chrome kirim audio ke Google) | pasti | S | disclosure di layar izin; toggle caption off; audio kita dihapus setelah draf | — |
| R10 | Baterai/panas HP murah | S | S | push-to-talk; stop otomatis; tanpa canvas 60 fps | keluhan pilot; sesi/hari |
| R11 | Multi-transaksi hilang sebagian | S | S | pemisah + ≥2 nominal → multi-draf | rasio multi-draf vs golden set |
| R12 | Kategori salah diam-diam → laporan melenceng | S | T | chip kategori selalu terlihat; penghitung "belum dicek" di tab Bulan Ini; `needs_reclass` | rasio edit kategori |
| R13 | Bundle voice memberatkan 3G | R | S | dynamic import < 15 KB gzip; CI bundle-size check | ukuran bundle di CI |
| R14 | Ucapan berisi PII (nama pelanggan) di log | S | S | log tanpa transkrip mentah (pola audit yang ada); transkrip hanya di tabel capture dengan RLS | audit log sampling |

P/D: T tinggi, S sedang, R rendah, F fatal.

---

## 7. Golden set dan metrik penerimaan

**Golden set:** 300 ucapan dari sesi JGU berikutnya + kunjungan lapangan Depok, dengan consent tertulis (protokol terpisah akan saya siapkan). Komposisi: 200 normal, 60 bising (lokasi usaha asli), 40 sulit (slang, multi-transaksi, ambigu, logat). Label: nominal, kategori, jumlah transaksi, metode bayar. Disimpan di repo privat sebagai fixture (audio + transkrip referensi), dijalankan di CI.

**Gerbang rilis (sebelum dipakai di demo Final Presentation):**

| Metrik | Target | Sumber |
|---|---|---|
| Nominal exact-match | ≥ 97% keseluruhan; ≥ 90% kelas bising | golden set di CI |
| Kategori top-1 | ≥ 90% | golden set |
| Multi-transaksi terdeteksi benar | ≥ 85% | golden set |
| p95 selesai bicara → draf tampil | ≤ 3 dtk (Whisper path, 3G throttle); ≤ 1 dtk (TEXT_ONLY) | Playwright + throttle |
| Rasio TEXT_ONLY | ≥ 60% (indikatif, bukan gerbang) | telemetry staging |
| Ketukan median sampai tersimpan | ≤ 2 | log uji internal |
| Pelanggaran "LLM keluarkan angka" | 0 | counter CI + runtime |
| Bundle modul voice | < 15 KB gzip | CI |

**Metrik pilot (setelah rilis):** persen tersimpan-tanpa-edit (target ≥ 85%), rasio edit nominal vs kategori, umur antrean offline, capture/UMKM/hari.

---

## 8. Telemetry (tanpa PII, pola audit yang ada)

Event minimum: `voice_capability_detected {profile}`, `voice_capture_started/stopped {duration_ms, stop_reason}`, `capture_submitted {path, has_transcript, has_audio, queued_offline}`, `draft_returned {tier, amount_candidates, category_source, processing_ms}`, `draft_confirmed {edits: {amount: bool, category: bool, date: bool}, taps}`, `draft_question_answered {field}`, `client_server_divergence {field}`. Transkrip mentah dan audio TIDAK pernah masuk event.

---

## 9. Penahapan

| Tahap | Isi | Target | DoD |
|---|---|---|---|
| **V-A** | Paket `nominal-parser` + 150 test; router jalur di `/captures`; respons diperluas (`amount_candidates`, `questions`, `evidence_span`); gating server; kartu konfirmasi baru dengan chip kategori (nyambung 0029); telemetry dasar | **10 Sept** | test parser hijau; Playwright: 5 skenario ucapan teks (tanpa mic) end-to-end sampai jurnal; demo path TEXT_ONLY stabil |
| **V-B** | `SpeechRecognition` + caption interim + chip nominal live; `MediaRecorder` paralel; deteksi kemampuan + 3 mode; antrean offline IndexedDB; toggle caption + disclosure privasi | **18 Sept** (buffer 2 hari sebelum Offline Pitching) | uji di ≥ 4 perangkat nyata (Android low-end Chrome, Android WebView, iPhone Safari, laptop); skenario airplane-mode → sinkron |
| **V-C** | Golden set 300 di CI; tuning ambang; slang daerah; prior "lima ratus" berbasis data; cap & budget per pengguna; dashboard telemetry | sebelum pilot | gerbang rilis Bagian 7 terpenuhi |

**Untuk demo 14–17 Sept:** jalur yang didemokan adalah V-A + V-B sebagian (caption di perangkat demo yang sudah diverifikasi — Chrome Android). Siapkan fallback video dan skrip ucapan yang ada di golden set. Jangan demo di iPhone.

## 10. Di luar cakupan
Streaming STT server (WebSocket), wake word, fine-tune Whisper, deteksi pembicara, bahasa daerah penuh (hanya tabel slang), dan perubahan apa pun pada modul `consent`/`readiness`/portal institusi.

## 11. Pertanyaan terbuka untuk Harsya (jawab sebelum mulai V-A)
1. Apakah endpoint `/captures` saat ini sudah multipart atau JSON murni? Kalau JSON, audio dikirim via signed upload URL dulu atau ubah ke multipart?
2. Groq Whisper yang terpasang: model mana, dan berapa p95 latensi aktual dari server kita? (menentukan realistis-tidaknya target 3 dtk)
3. Rate limit dan budget per pengguna sekarang ditegakkan di mana — middleware atau DB? 60/hari mau ditaruh di situ juga?
4. IndexedDB: pakai wrapper yang sudah ada di repo atau tambah `idb` (~1 KB)?
5. Ada preferensi antara tahan-untuk-bicara vs ketuk-mulai/ketuk-berhenti dari pengujian sebelumnya?
