# WP-06 Private Documents

Tanggal verifikasi: 26 Agustus 2026  
Status: selesai di repository dan PostgreSQL lokal disposable; migration OCR lanjutan belum diterapkan ke Supabase remote/production.

## Outcome

Dokumen sensitif sekarang memakai lifecycle privat dan versioned:

```text
client precheck + SHA-256
-> authenticated upload session
-> server-selected private path
-> signed upload token
-> server download + magic-byte/size/checksum verification
-> explicit OCR consent untuk KTP/NIB/NPWP
-> document version + asynchronous OCR/extraction job + verification record
-> owner review/correction tanpa mengklaim verifikasi keaslian
-> short-lived signed read URL + audit event
```

Browser tidak lagi melakukan direct insert/delete ke tabel `documents` atau memilih path Storage sendiri. Hasil OCR tidak otomatis mengubah profil atau menjadikan dokumen terverifikasi.

## API boundary

Endpoint WP-06 tersedia:

- `POST /api/v1/documents/upload-session` — auth, schema/MIME/extension/size/checksum validation, owner membership, idempotency, dan signed upload token;
- `POST /api/v1/documents/:id/versions` — download privat server-side, magic-byte/size/checksum verification, finalisasi versi atomik, dan schedule extraction job;
- `GET /api/v1/documents` — daftar dokumen aktif owner dengan `Cache-Control: private, no-store`;
- `GET /api/v1/documents/:id` — detail serta riwayat version/extraction/verification;
- `POST /api/v1/documents/:id/signed-url` — signed URL 60 detik dan audit event;
- `POST /api/v1/documents/:id/archive` — arsip idempoten tanpa menghapus objek atau riwayat versi.
- `POST /api/v1/documents/:id/extraction-confirmation` — validasi schema per jenis dokumen dan pencatatan konfirmasi/koreksi pemilik yang auditable.

Endpoint lama `POST /api/documents/signed-url` menjadi compatibility wrapper bertanda deprecated. Endpoint lama `/api/ai/extract-nib` mengembalikan `410 ENDPOINT_RETIRED`; fallback nomor NIB acak telah dihapus.

Semua endpoint baru menggunakan structured error `{ error: { code, message, fieldErrors?, retryable, requestId } }`.

## Database dan Storage boundary

Migration additive `0016_private_document_lifecycle.sql`:

- membuat `document_upload_sessions` untuk reservasi path, metadata, expiry, rejection reason, dan idempotency;
- menambah lifecycle metadata pada `documents` dan `document_versions`;
- mengubah status legacy `archived` menjadi `superseded`;
- menghapus permanent `file_url` lama setelah menyimpan SHA-256 URL untuk rekonsiliasi backup;
- membuat RPC create/finalize/archive serta claim/complete/fail extraction job;
- memastikan satu extraction/verification/job per version;
- menaikkan limit bucket `documents` menjadi 10 MiB, tetap private, dan mempertahankan allowlist PDF/JPEG/PNG;
- menghapus policy direct browser read/write untuk bucket `documents`; akses hanya melalui signed upload/download yang dibuat server;
- mencabut direct mutation `documents` dari role `authenticated`;
- membatasi upload legal document kepada active business owner;
- menyimpan audit event untuk upload version, rejection, extraction, signed access, dan archive.

Migration korektif `0017_document_extraction_completion.sql` menyelaraskan status completion ke `succeeded` dan memulihkan job metadata lama yang tertinggal. Migration `0018_document_ocr_owner_confirmation.sql`:

- mencatat consent OCR pada upload session sebelum provider dapat menerima KTP/NIB/NPWP;
- menambah `owner_review_status`, `confirmed_data`, actor, dan timestamp tanpa menimpa hasil OCR asli;
- menyediakan RPC konfirmasi sempit dengan validasi ulang KTP, NIB, dan NPWP di server serta SQL;
- membedakan data identik (`owner_confirmed`) dari data yang dikoreksi (`owner_corrected`);
- tidak mengubah `document_verifications.pending` atau memberi klaim keaslian;
- mencatat audit metadata field saja tanpa menyalin nilai PII.

Path Storage dibentuk server:

```text
{user_id}/{business_id}/{document_id}/{upload_session_id}.{server_mapped_extension}
```

Browser tidak mengirim atau menentukan `storage_path`.

## Validasi dan rejection behavior

- Document type menggunakan allowlist core/conditional sektor pangan.
- MIME hanya PDF, JPEG, atau PNG.
- Extension harus cocok dengan MIME.
- Batas per tipe: 5 MiB untuk legal core, 8 MiB foto usaha, dan 10 MiB laporan/rekening/QRIS.
- Filename disanitasi dan tidak dipakai sebagai Storage path.
- SHA-256 dihitung browser, lalu diverifikasi kembali server dari object yang sudah diunggah.
- Magic bytes PDF/JPEG/PNG diperiksa agar browser MIME tidak menjadi satu-satunya authority.
- File invalid ditolak dengan kode dan pesan yang dapat ditindaklanjuti; object invalid dijadwalkan untuk cleanup.
- Malware scan belum diaktifkan karena scanner/infrastruktur belum tersedia.

## Extraction dan verification

- KTP, NIB, dan NPWP memakai adapter OCR/vision server-only OpenAI dan Gemini, maksimal tiga attempt.
- Model dapat dioverride dengan `DOCUMENT_OPENAI_MODEL` dan `DOCUMENT_GEMINI_MODEL`.
- Persetujuan pembacaan KTP, NIB, dan NPWP diminta melalui dialog pada setiap file/versi baru. Catatan server menyimpan waktu, pengguna, ruang lingkup pemroses, dan versi kebijakan `document-reading-v1` melalui migrasi `0019`.
- Jika hanya `GROQ_API_KEY` yang tersedia, foto JPG/PNG dibaca dengan model gambar Groq. PDF memerlukan penyedia yang mendukung PDF (OpenAI/Gemini) atau harus diunggah sebagai hasil pindai JPG/PNG.
- Provider timeout default 20 detik.
- Schema mewajibkan NIK 16 digit, NIB 13 digit, serta NPWP 15/16 digit dan melarang provider menebak.
- Worker memeriksa consent persisten sebelum mengunduh atau mengirim file ke provider eksternal.
- Jika provider tidak tersedia/gagal, dokumen tetap aman dan diarahkan ke pemeriksaan manual; tidak ada nomor fallback.
- Dokumen di luar tiga tipe OCR inti menghasilkan metadata lifecycle tanpa mengklaim ekstraksi konten.
- Raw file/text tidak disalin ke audit atau AI run response.
- Structured result asli dan hasil konfirmasi/koreksi pemilik disimpan terpisah pada `document_extractions`; `document_verifications` tetap `pending` sampai ada proses verifikasi nyata.
- Profil tidak diperbarui dari hasil yang belum diverifikasi.

## UI behavior

`/umkm/upload` sekarang:

- menampilkan core dan conditional food-sector documents;
- menghitung checksum sebelum meminta upload session;
- mengunggah hanya melalui signed upload token;
- mendukung version replacement tanpa menimpa object lama;
- meminta consent eksplisit sebelum upload KTP/NIB/NPWP;
- menampilkan status `Sedang dibaca OCR`, `Data siap dikonfirmasi`, `Dikonfirmasi pemilik`, `Terverifikasi`, rejected, dan archived;
- menyediakan form review/koreksi hasil OCR dan menjelaskan bahwa konfirmasi pemilik bukan verifikasi keaslian;
- menampilkan reason/notes yang dapat ditindaklanjuti;
- membuat signed URL saat tombol lihat ditekan;
- mengarsipkan metadata tanpa menghapus private source/version history;
- tidak menggunakan copy yang menjanjikan penerimaan pembiayaan.

## Verifikasi

Hasil terakhir:

- database fresh apply + replay + legacy upgrade: lulus;
- database document lifecycle: owner workflow, idempotent session, OCR consent, staff denial, cross-business denial, direct table/storage mutation denial, completion, owner confirmation/correction, version replacement, dan non-destructive archive: lulus;
- generated database type drift: lulus (36 tabel, 5 view, 16 RPC);
- TypeScript: lulus;
- ESLint: lulus, 69 warning lama dan 0 error;
- unit: 77 test lulus;
- integration contract: 13 test lulus;
- production build: lulus, termasuk 7 route document baru dan 38 static pages;
- Playwright Chromium landing smoke: 1 test lulus.
- Supabase remote dry-run terakhir tertahan sebelum membandingkan migration karena token CLI aktif mendapat `LegacyDbConfigLoginRoleStatusError`/HTTP 403. Project ref tetap `ggudmwfhaqoqcguwgdac`; login ulang dengan akun pemilik atau gunakan database password sebelum push.

## Gate sebelum staging/production

1. Backup database dan metadata Storage yang terbaru.
2. Inventaris dokumen legacy yang masih mengandalkan `file_url`; pastikan object sudah tersedia pada bucket private `documents` sebelum menerapkan migration.
3. Jalankan `npx.cmd supabase db push --dry-run`; cocokkan seluruh migration pending dengan handoff terbaru.
4. Terapkan `0017` dan `0018` pada staging/remote setelah backup.
5. Pastikan bucket `documents` private, limit 10 MiB, dan direct authenticated upload tanpa signed token ditolak.
6. Isi provider key/model hanya pada secret store server jika OCR otomatis diaktifkan; tampilkan disclosure pemroses yang sesuai konfigurasi aktual.
7. Uji dua akun usaha dan satu staff: owner berhasil, staff/cross-business ditolak, signed URL kedaluwarsa, serta access audit tercatat.
8. Verifikasi object legacy melalui checksum sebelum mencabut atau menghapus sumber backup. Migration ini tidak menghapus object Storage.

## Known limitations

- Malware scanner belum tersedia; validation saat ini mencakup MIME, extension, size, magic bytes, dan checksum.
- `after()` memulai worker pada deployment Next.js. Scheduler recovery untuk job `queued/running` yang tertinggal masih perlu dikerjakan pada WP-12.
- Verification reviewer/admin atau integrasi sumber resmi belum tersedia. Konfirmasi pemilik tetap bukan bukti keaslian dan tidak mengubah profil authoritative.
- Institution tidak mendapat direct document access. Dossier item + active consent grant akan dikerjakan pada WP-10.
- Migration `0016` sudah diterapkan ke Supabase remote; `0017` dan `0018` perlu dipush sebelum kode OCR baru digunakan terhadap remote.

## Next recommended work package

WP-07 Ledger, Report, and Daily Closing. WP-05 dan WP-06 kini menyediakan dua evidence source yang dibutuhkan readiness pada WP-08.

## Referensi implementasi

- Next.js local docs: `01-app/01-getting-started/15-route-handlers.md`, `07-mutating-data.md`, dan `05-server-and-client-components.md`.
- Handoff dependency: [WP-04 Identity, Membership, and RLS](./wp-04-identity-membership-rls.md).
