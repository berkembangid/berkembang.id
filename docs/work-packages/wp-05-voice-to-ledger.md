# WP-05 Voice-to-Ledger

Tanggal verifikasi: 26 Agustus 2026  
Status: selesai di repository dan PostgreSQL lokal disposable; belum diterapkan ke Supabase remote/production.

## Outcome

Pencatatan suara/teks sekarang memakai lifecycle capture yang persisten dan human-confirmed:

```text
draft -> queued -> processing -> needs_review -> confirmed
                                  |               
                                  +-> failed
draft/queued/processing/needs_review/failed -> cancelled
```

Request browser tidak lagi menunggu seluruh pipeline AI. Browser membuat capture, mengunggah audio ke bucket private melalui signed upload session, menjadwalkan job, lalu membaca status dengan polling. Draft disimpan di database dan ID capture disimpan di `localStorage`, sehingga refresh dapat memulihkan status/draft. Hanya endpoint confirm yang dapat memindahkan draft tervalidasi ke tabel transaksi.

## API boundary

Endpoint minimum WP-05 tersedia:

- `POST /api/v1/captures` — autentikasi, validasi Zod, membership check via RPC, create idempotent, dan signed upload session untuk audio;
- `POST /api/v1/captures/:id/process` — menjadwalkan satu durable `ai_job`, mengembalikan `202`, lalu mengeksekusi worker melalui Next.js `after()`;
- `GET /api/v1/captures/:id` — status/transkripsi/draft persisten melalui RLS dan `Cache-Control: private, no-store`;
- `POST /api/v1/captures/:id/confirm` — validasi human-reviewed draft dan konfirmasi atomik/idempoten;
- `POST /api/v1/captures/:id/cancel` — membatalkan capture non-final dan menjadwalkan pembersihan audio private.

Semua error memakai contract `{ error: { code, message, fieldErrors?, retryable, requestId } }`. Route selalu mengautentikasi ulang dan tidak menerima `user_id` sebagai authority dari browser.

## Database boundary

Migrasi additive `0015_voice_capture_lifecycle.sql`:

- menambah source/confirmation metadata pada `transaction_captures`;
- menambah detail canonical draft pada `transactions` (`client_item_id`, `category_code`, quantity/unit/unit price, payment method, sales channel);
- membuat bucket `captures` private dengan limit 10 MiB dan allowlist MIME audio;
- mencabut direct INSERT/UPDATE/DELETE browser pada `transaction_captures`;
- memberi authenticated role hanya RPC lifecycle yang sempit;
- memberi service role RPC claim/complete/fail worker;
- menambah unique key per capture item serta satu voice job per capture.

`confirm_transaction_capture` menjalankan satu database transaction:

1. lock row capture;
2. verifikasi active business membership dan ownership;
3. menangani retry dengan confirmation idempotency key;
4. validasi seluruh item lagi di SQL;
5. insert seluruh transaksi beserta `business_id`, `user_id`, dan `capture_id` server-controlled;
6. update capture menjadi `confirmed`;
7. append satu audit event;
8. simpan safe correction telemetry tanpa transcript mentah;
9. enqueue satu `readiness_recalculation` job.

Retry dengan key yang sama mengembalikan hasil transaksi yang sudah ada. Key berbeda setelah final menghasilkan `CAPTURE_ALREADY_CONFIRMED`.

## AI worker dan telemetry

- `TranscriptionProvider` dan `ExtractionProvider` menjadi adapter eksplisit untuk Groq, OpenAI, dan Gemini.
- Setiap provider attempt diklaim atomik dan menghasilkan tepat satu `ai_run`.
- Retry dibatasi tiga attempt; setiap provider attempt memiliki timeout default 18 detik. Timeout/rate-limit/provider transient dapat retry, sedangkan validation failure hanya fallback jika provider berikutnya berbeda.
- Circuit breaker proses-lokal membuka provider selama 60 detik setelah tiga kegagalan berulang.
- Run menyimpan provider/model, latency, status/error code, retry reason, serta token usage bila SDK menyediakannya.
- Audit/error log hanya memuat internal ID dan safe metadata; audio/transcript mentah tidak disalin ke audit atau telemetry.
- Setelah sukses atau terminal failure, worker mencoba menghapus audio source dari bucket private.
- AI failure hanya mengubah state menjadi `failed`; tidak ada insert transaksi atau nominal.

## UI behavior

`/umkm/catat` tidak lagi memanggil endpoint sinkron `/api/ai/transcribe` atau melakukan direct insert ke `transactions`.

- Audio memakai signed upload URL dan job asynchronous.
- Text input memakai lifecycle yang sama tanpa upload.
- Draft selalu ditampilkan untuk review; deskripsi, kuantitas, dan nominal dapat dikoreksi atau item dihapus.
- Edit caption membatalkan capture lama dan membuat capture auditable baru.
- Tombol simpan memanggil confirm dengan key deterministik per capture, sehingga retry aman.
- Start-over membatalkan capture lama, bukan menghilangkan draft tanpa state transition.

## Verifikasi

Hasil terakhir:

- database fresh apply + replay + constraints + legacy backfill: lulus;
- lifecycle DB: create replay, durable refresh read, cross-business denial, direct state mutation denial, schedule replay, worker claim/complete/fail, draft isolation, dua confirmation request konkuren, audit/readiness/feedback exactly-once, cancellation, dan private capture storage isolation: lulus;
- generated database type drift: lulus (35 tabel, 5 view, 7 RPC);
- TypeScript: lulus;
- ESLint: lulus;
- unit: 55 test lulus;
- integration contract: 10 test lulus;
- production build: lulus, termasuk 5 route capture baru;
- Playwright Chromium landing smoke: lulus (1 test);
- client bundle scan `SUPABASE_SERVICE_ROLE_KEY|service_role`: bersih.

## Gate sebelum staging/production

1. Terapkan migrasi 0015 pada staging setelah backup database dan metadata Storage.
2. Pastikan bucket `captures` tetap private, limit 10 MiB, dan allowlist MIME sesuai migrasi.
3. Isi minimal satu AI provider key hanya pada secret store server. Tanpa provider key, job berakhir jujur sebagai `failed` dan UI menawarkan input lain.
4. Pastikan platform deployment mendukung Next.js `after()`/`waitUntil` dan memberi `maxDuration` minimal 60 detik. Durable row tetap tersimpan bila invocation gagal, tetapi pilot perlu scheduler recovery untuk job `queued` yang tertinggal.
5. Jalankan cross-account dan confirmation-concurrency test pada staging dengan fixture terisolasi.
6. Pantau correction rate, provider failure/rate-limit, latency, dan queued-job age tanpa mengirim transcript/audio ke monitoring.

## Known limitations

- Circuit breaker masih process-local; multi-instance shared circuit state belum tersedia.
- Durable queue sudah database-backed. Polling secara idempoten menyalakan ulang job `queued`, dan lease `running` yang stale selama 45 detik dikembalikan ke antrean. Scheduler/cron tetap dibutuhkan untuk recovery job milik pengguna yang sudah menutup seluruh client.
- UI review belum menyediakan editor category, date, payment method, dan sales channel; field tersebut tetap dibawa dari draft tervalidasi, dikonfirmasi secara eksplisit bersama item, dan divalidasi ulang di server/database.
- Endpoint manual ledger, adjustment/cancel transaction, report summary, dan daily closing berada pada WP-07.
- Tidak ada migrasi atau perubahan yang diterapkan ke Supabase remote.

## Next recommended work package

WP-06 Private Documents, karena identity/RLS dan capture lifecycle sudah menjadi boundary aman untuk worker serta audit berikutnya.

## Referensi implementasi

- Next.js local docs: `01-app/01-getting-started/15-route-handlers.md`, `07-mutating-data.md`, dan `03-api-reference/04-functions/after.md`.
- Handoff dependency: [WP-04 Identity, Membership, and RLS](./wp-04-identity-membership-rls.md).
