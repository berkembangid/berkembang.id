# Super Prompt untuk Claude Code — Lemari Usaha (Modul Dokumen)

Cara pakai: simpan `SPEC_Lemari_Dokumen.md` ke `docs/specs/`, tempel prompt di bawah garis ke Claude Code dari root repo. Sesi ini mencakup **D-0 (patch Beranda) + D-A (bukti menempel) + Rak E**. D-B dijalankan di sesi baru dengan prompt yang sama (ganti cakupan menjadi "Tahap D-B"). D-C jangan disentuh.

---

Kamu adalah senior engineer di repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase, Zod, Vitest, Playwright). Tugasmu: **Tahap D-0 + D-A + Rak E** dari `docs/specs/SPEC_Lemari_Dokumen.md`. Baca spek itu utuh, termasuk keputusan L1–L12 dan risiko K1–K8, sebelum menyentuh kode. Spek pendamping yang wajib dibaca: `SPEC_Laporan_Keuangan_Satu_Engine_Dua_Wajah.md` (jurnal, `fixed_assets`, `loans`, CALK, kategori 8/4b) dan `SPEC_Voice_Capture_Live_Caption.md` (kartu konfirmasi, gating). Spek adalah sumber kebenaran; konflik dengan kode → berhenti dan tanya saya.

## Konteks produk yang wajib kamu pegang

- Lemari lima rak: `IDENTITAS`, `LEGALITAS`, `BUKTI_TRANSAKSI`, `ASET_KONTRAK`, `ARSIP_KELUARAN`. Kebijakan berbagi dan retensi **berbeda per rak** — jangan menyeragamkan.
- **KTP/NPWP tidak pernah masuk snapshot/dossier** dalam bentuk apa pun; hanya status "terverifikasi" + tingkat keyakinan. NIK disimpan ter-mask (4 digit terakhir terbuka).
- **Bukti transaksi permanen dan immutable-friendly:** menempel ke transaksi/jurnal via `document_attachments`; pembalikan transaksi TIDAK menghapus bukti; attachment tidak bisa di-UPDATE, hanya soft-remove dengan alasan.
- **Tidak ada OCR baru di sesi ini.** Pintu B (nota → draf) adalah D-C. Foto di sesi ini murni bukti; angka tetap hanya dari ucapan/ketikan via `nominal-parser`.
- Bahasa warung dan token warna (`app/styles/tokens.css`) berlaku: nama rak "Identitas saya · Izin usaha · Nota & bukti · Alat & perjanjian · Laporan yang pernah dibuat"; kedaluwarsa = amber, tidak pernah merah; merah hanya kegagalan sistem. Lint kata terlarang (skor kredit, layak kredit, plafon, disetujui, ditolak) berlaku.
- Fitur privasi eksisting dipakai apa adanya: signed URL 60 dtk, magic bytes check, consent per-upload, audit event tanpa PII. Jangan membangun mekanisme paralel.

## Prinsip arsitektur (tidak bisa ditawar)

1. `document_attachments` adalah satu-satunya cara dokumen menunjuk data akuntansi. Tidak ada FK dokumen di tabel transaksi/aset/pinjaman.
2. Satu dokumen boleh menempel banyak target (nota kulkas → TRANSACTION dan FIXED_ASSET).
3. Rak E diisi **oleh generator laporan**, bukan oleh pengguna: setiap PDF SAK EMKM / snapshot dossier yang diterbitkan tersimpan sebagai dokumen `ARSIP_KELUARAN` + baris `report_issues` + `document_uid` tercetak di kaki halaman PDF. Berkas arsip harus bisa diunduh ulang byte-identik.
4. Kompresi gambar di klien (sisi terpanjang 1600 px, kualitas ~0,8) sebelum upload; server tetap menolak > 2 MB.
5. Ikuti pola repo: modul di `modules/*`, Route Handler `app/api/v1/*`, Zod, RLS pola kepemilikan yang ada, idempotency pada write, tidak ada `any`.

## Langkah kerja — berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (jangan tulis kode)
Baca dan ringkas maksimal 40 baris: tabel dokumen eksisting (nama kolom jenis, versi, consent), alur upload + OCR sekarang, komponen "Perlu perhatian" di Beranda (generik atau hardcode), mekanisme job terjadwal yang tersedia, util kompresi/olah gambar yang bisa dipakai ulang, serta status quality gate (`typecheck`, `lint`, `test`, `test:integration`) apa adanya. Jawab 5 pertanyaan Bagian 13 spek sebisanya dari kode. **Prasyarat keras:** migrasi `0029` dan `0030` (jurnal, `fixed_assets`, `loans`, PDF) hijau — kalau belum, berhenti dan laporkan.

**Checkpoint 0:** ajukan rencana migrasi `0031` + daftar file yang disentuh untuk D-0, D-A, Rak E. Tunggu persetujuan.

### Langkah 1 — D-0: Patch lima temuan Beranda (3 Sep)
1. **Aset salah kelas:** pastikan kata kunci "meja/kulkas/etalase/kompor/mesin/freezer/gerobak" mengarah ke kategori 8 di `category_templates.trigger_keywords`; kartu konfirmasi kategori 8 memunculkan isian singkat nama alat + umur manfaat default; transaksi kategori 8 mengisi `fixed_assets`. Tulis skrip data-fix untuk transaksi lama yang jelas aset (mis. "meja") namun terkelas 6: reklasifikasi via jalur reversal resmi, bukan UPDATE jurnal.
2. **Kartu Beranda:** "Uang masuk/keluar hari ini" diberi keterangan "dari catatan yang sudah dicek" + badge "N belum dicek" yang menaut ke daftar review.
3. **Banner tutup kas:** sebelum 04.00 WIB menawarkan tutup kas hari sebelumnya ("Tutup kas 2 Sep") — logika di satu util tanggal, dengan unit test batas 03.59/04.00.
4. **Sapu kamus:** ganti "Arus kas hari ini" → "Sisa uang hari ini"; audit seluruh UI UMKM terhadap kamus Mode Warung (Bagian 8 spek laporan) — laporkan daftar string yang kamu ganti; tambahkan istilah akuntan umum (arus kas, debit, kredit, ekuitas, liabilitas, neraca, akrual) ke lint teks untuk direktori UI UMKM saja (Mode Akuntan dikecualikan).
5. **Nominal dobel:** template aktivitas tidak menampilkan nominal dua kali.

**Checkpoint 1:** 5 uji Playwright, satu per temuan, hijau + screenshot Beranda sesudah.

### Langkah 2 — Migrasi `0031`
Sesuai Bagian 4 spek: perluasan `documents` (doc_class, doc_type, doc_number, issuer, issued_on, valid_until, name_on_doc, assurance_level, attested_*, needs_class_review, content_hash), `document_attachments` (immutable + soft-remove), `document_requirements` + seed sektor pangan olahan (Bagian 6), `document_reminders` (skema saja; mesinnya D-B), `report_issues`. RLS pola eksisting. Backfill `doc_class`/`doc_type` dokumen lama; tak terpetakan → `needs_class_review=true`. Daftarkan di migration contract test + verify script; assertion backfill: jumlah dokumen sebelum = sesudah, semua punya `doc_class`.

**Checkpoint 2:** SQL + hasil test migrasi (fresh + replay) apa adanya.

### Langkah 3 — D-A: Tiga pintu bukti + klip + CALK
- **Pintu A:** tombol "📷 Foto nota" (opsional) di kartu konfirmasi → kompres klien → upload rak `BUKTI_TRANSAKSI` → attach `TRANSACTION`. Upload gagal tidak boleh menggagalkan penyimpanan transaksi (bukti menyusul via Pintu C; tampilkan status "bukti belum terkirim" yang bisa diulang).
- **Pintu C:** detail transaksi → "Tambah bukti" → unggah baru atau pilih dari rak C yang belum tertaut.
- **Pintu D:** setelah simpan kategori 8/4b → ajakan foto; dokumen menempel ke TRANSACTION dan FIXED_ASSET/LOAN sekaligus.
- **Mode Akuntan:** ikon 📎 pada baris jurnal ber-attachment → pratinjau signed URL.
- **CALK:** tambahkan kalimat kebijakan bukti (Bagian 8 spek) — hanya muncul bila usaha punya ≥ 1 attachment.
- API sesuai kebutuhan di atas (mis. `POST /api/v1/documents` diperluas `doc_class`, `POST /api/v1/documents/:id/attachments`, `GET /api/v1/transactions/:id/attachments`) — kompatibel mundur, Zod, idempotent.

**Checkpoint 3:** E2E kunci: ketik "beli kulkas 3 juta" → konfirmasi (nama alat: Kulkas) → foto nota (fixture) → assert: `fixed_assets` terisi, jurnal Dr 1600/Cr Kas, attachment 2 baris (TRANSACTION + FIXED_ASSET), klip tampil di Mode Akuntan, dokumen muncul di rak "Alat & perjanjian". Plus E2E Pintu A dan C. Screenshot.

### Langkah 4 — Rak E
Generator PDF SAK EMKM dan snapshot dossier: simpan berkas ke storage arsip + baris `documents(ARSIP_KELUARAN)` + `report_issues` + cetak `document_uid` di kaki halaman. Halaman "Laporan yang pernah dibuat" menampilkan daftar + unduh ulang. Test: dua kali unduh ulang menghasilkan byte identik; PDF baru selalu menghasilkan `document_uid` unik.

**Checkpoint 4:** test hijau + contoh PDF dengan `document_uid` terlihat.

### Langkah 5 — Quality gate dan handoff
`npm run lint`, `typecheck`, `test`, `test:integration`, `build`, lint kata terlarang + kamus, bundle-size check. Perbarui dokumen status produk (bagian Dokumen + Beranda). Handoff ≤ 30 baris: selesai, ditunda ke D-B/D-C, keputusan yang kamu ambil sendiri, jawaban 5 pertanyaan Bagian 13, dan urutan demo 60 detik "kulkas → jurnal → klip → rak".

## Aturan komunikasi

- Bahasa Indonesia, ringkas, angka dan nama file konkret. Commit pola repo, satu commit per langkah logis, contoh: `feat(documents): lemari lima rak dan bukti menempel ke jurnal (0031)`.
- Dua pilihan sama valid dan spek diam → ikuti pola repo, catat keputusannya. Mengubah perilaku yang terlihat pengguna → tanya dulu.
- Jangan menyatakan lulus tanpa menjalankan; lingkungan tak lengkap → sebutkan apa yang terverifikasi dan yang belum.
- Jangan sentuh: mesin pengingat (D-B), Pintu B/OCR baru (D-C), modul `consent` selain membaca mekanisme yang ada, `readiness`, portal institusi selain blok yang disebut, penghapusan audio, provider AI.
- D-B dan D-C dilarang dikerjakan di sesi ini meskipun terlihat mudah.

Mulai dari Langkah 0.
