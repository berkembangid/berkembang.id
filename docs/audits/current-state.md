# BERKEMBANG.ID Current-State Audit

Tanggal audit: 25 Agustus 2026  
Work package: WP-00 Repository Audit  
Branch/commit: `master` / `1663f29`  
Status: **WP-00 selesai; aplikasi belum layak dinyatakan release-ready atau seluruh fiturnya normal.**

> Snapshot ini mempertahankan temuan awal sebagai bukti historis. Temuan identity/RLS,
> privileged browser writes, dan private document access pada bagian 6-7 telah ditangani
> oleh [handoff WP-04](../work-packages/wp-04-identity-membership-rls.md). Temuan voice/text
> capture dan atomic confirmation telah ditangani oleh
> [handoff WP-05](../work-packages/wp-05-voice-to-ledger.md); temuan lain tetap mengikuti
> work package masing-masing.

## 1. Outcome

Repository berhasil di-install dari `package-lock.json`, lolos TypeScript, dan dapat menghasilkan production build. Namun, audit menemukan pelanggaran invariant yang membuat produk belum aman untuk demo dengan data nyata:

1. AI dan parser UI dapat membuat transaksi/nominal fiktif ketika ekstraksi gagal.
2. Penyimpanan transaksi dan profil dapat gagal tetapi UI tetap menampilkan sukses.
3. `POST /api/ai/transcribe` tidak memeriksa sesi, MIME, ukuran, quota, atau schema output.
4. Role berasal dari metadata yang dapat diisi saat sign-up, pilihan tab login, dan prefix email; Proxy juga fail-open jika env Supabase hilang.
5. KTP, NIB, NPWP, laporan keuangan, dan rekening koran diunggah dari browser lalu diberi URL publik permanen.
6. Portal institusi, aktivitas, roadmap, dan AI Copilot menyajikan data/hasil hardcoded tanpa label demo.
7. Operasi privileged admin dilakukan langsung dari Client Components memakai anon/browser client.
8. Tidak ada migration, generated database types, RLS test, unit/integration/E2E test, atau CI.
9. Next.js `16.2.10` memiliki advisory high severity yang mencakup Proxy bypass; `npm audit` merekomendasikan upgrade ke `16.3.2`.

Kesimpulan: fitur UI tersedia luas, tetapi hanya sebagian kecil yang dapat disebut `working`; sebagian besar `partial`, `mock`, atau `missing` menurut definisi playbook.

## 2. Scope dan sumber bukti

Diaudit:

- seluruh route/page/layout di `app/`;
- seluruh component di `components/`;
- `lib/supabase.ts`, `lib/score.ts`, `proxy.ts`, konfigurasi Next/TypeScript/ESLint;
- semua pemanggilan Supabase Auth, PostgREST, Realtime, dan Storage;
- semua sumber role, fallback nominal, URL publik, data statis, mutation admin, dan tautan internal;
- baseline install, lint, typecheck, build, npm audit, dan smoke HTTP lokal.

Tidak dibuktikan:

- schema dan RLS project Supabase aktual, karena repository tidak memiliki migration/policy/test dan tidak ada akses policy/database-admin yang disediakan;
- flow login lintas akun, karena tidak ada akun fixture/test dan pengujian tidak boleh mengubah data project aktual;
- provider AI end-to-end, karena WP-00 tidak boleh mengirim data/cost ke provider atau membuat transaksi;
- behavior production deployment, karena deployment tidak termasuk scope.

## 3. Perbedaan repository aktual terhadap playbook

| Item | Kondisi aktual | Dampak |
|---|---|---|
| `BERKEMBANG_ID_UPDATE_IMPLEMENTATION_PLAN.md` | Tidak ada | Companion plan tidak dapat diverifikasi. |
| `BERKEMBANG_ID_Target_Database_Schema.sql` | Tidak ada | Target schema dan gap schema aktual tidak dapat dibandingkan. |
| Migration/seed/RLS | Tidak ada | Database tidak reproducible; tenant isolation tidak terbukti. |
| Generated DB types | Tidak ada | Query browser menggunakan data tanpa tipe dan banyak `any`. |
| Test/CI | Tidak ada | Tidak ada safety net atau quality gate. |
| API | Hanya `/api/ai/transcribe` | Seluruh checklist `/api/v1/*` belum tersedia. |
| Stack | Next 16.2.10, React 19.2.4, TS 5, Supabase JS 2.110.7 | Sesuai garis besar snapshot, tetapi versi Next memiliki advisory aktif. |
| Worktree awal | Dua Markdown untracked: playbook dan brainstorming | Dipertahankan; tidak ditimpa. |

## 4. Inventaris

- 30 route hasil production build: landing, terms, 3 auth/public assets, 10 UMKM, 3 institusi, 11 admin/dynamic admin, dan 1 API.
- 1 Route Handler: `POST /api/ai/transcribe`.
- 3 library files: `lib/supabase.ts`, `lib/score.ts`, `lib/utils.ts`.
- 0 migration, 0 test file, 0 CI workflow, 0 generated database type.
- Seluruh page/layout dashboard yang membaca data adalah Client Component dan memakai singleton browser client dari `lib/supabase.ts`.
- Tabel yang dirujuk aplikasi: `profiles`, `transactions`, `documents`, `readiness_analyses`, `institutions`, `mitra`, `rules_config`, `audit_logs`.
- Bucket yang dirujuk: `documents` dan `avatars`.

## 5. Feature map

Status berarti:

- `working`: memiliki implementasi nyata dan baseline build, tanpa klaim bahwa RLS sudah aman;
- `partial`: memiliki query/mutation nyata tetapi lifecycle, keamanan, atau error state belum memenuhi playbook;
- `mock`: UI/hasil berasal dari konstanta/timer tanpa API/event nyata;
- `missing`: domain/API/data model belum ada.

| Area/route | Status | Evidence dan gap utama |
|---|---|---|
| Landing `/` dan terms | working | Static Server Components dan build sukses. Ada mojibake di `components/landing/ProductSections.tsx:33-34`, `TrustSection.tsx:50`, serta metadata/root CSS. |
| Email login | partial | Auth nyata di `app/auth/login/page.tsx:24-27`, tetapi redirect role mengutamakan `user_metadata`/tab browser di baris 45-63. |
| Phone/WhatsApp login dan identity merge | missing | Tidak ada flow OTP phone atau identity linking. |
| Registration UMKM | partial | Supabase sign-up dan insert profile nyata, tetapi error insert profile diabaikan dan route tetap pindah halaman (`app/auth/register/page.tsx:125-154`). |
| Registration institusi | partial/unsafe | Browser dapat mendaftarkan `role: institution` dan langsung membuat `institutions.active: true` (`app/auth/register/page.tsx:94-100,141-147`). Tidak ada verification lifecycle. |
| UMKM home | partial | Query profile/readiness/transactions/documents nyata (`app/(umkm)/umkm/page.tsx:36-64`), tetapi score dihitung di browser dan positioning menyebut kelayakan pembiayaan. |
| Voice/text capture | partial/unsafe | MediaRecorder dan review UI ada, tetapi processing sinkron; fallback nominal fiktif ada; tidak ada capture/job/status/idempotency/audit. |
| Transaction confirmation | partial/unsafe | Klik save melakukan insert langsung (`catat/page.tsx:287-306`); tidak atomik dan error tetap diikuti success toast (`:307-322`). |
| Manual ledger/report | partial | Query/insert/filter/CSV nyata (`laporan/page.tsx:73-176,201-277`), tetapi unauthenticated branch membuat transaksi lokal (`:154-165`), final row bisa hard-delete (`:178-198`), tidak ada status confirmed/cancelled/closing, dan CSV belum mencegah formula injection. |
| Daily closing/adjustment/history | missing | Tidak ada entity/API/UI. |
| Profile | partial/unsafe | Load/update nyata, tetapi update Auth/profile failure hanya warning dan UI tetap sukses (`profil/page.tsx:127-169`); role `umkm` ditulis dari browser. |
| Documents | partial/critical | Upload/delete nyata, tetapi tanpa allowlist MIME/extension/size/checksum/version dan dokumen sensitif mendapat `getPublicUrl` (`upload/page.tsx:34-81`). Upload storage error hanya warning, lalu row DB tetap dibuat. |
| Readiness score | partial | `lib/score.ts` menghitung real-time dari data pengguna, tetapi client-side menjadi authority; data minim diberi baseline angka 10/20, bukan `unknown/null`; copy mengklaim kelayakan/syarat KUR. |
| Gaps | partial | Dihitung dari data/query nyata, tetapi menggunakan rule client yang tidak versioned dan claim bank/approval hardcoded. |
| Missions | missing | Tidak ada mission entity/engine. |
| Roadmap `/umkm/roadmap` | mock | Seluruh progress/tugas/waktu berasal dari array `steps` (`roadmap/page.tsx:8-58`). |
| Notifications | partial | `/umkm/notifikasi` dan popover layout membaca transaksi nyata, bukan notification event/consent/audit. Realtime subscription tidak memfilter `user_id` pada server channel (`layout.tsx:132-138`). |
| Activity `/umkm/aktivitas` | mock | Semua event, nominal, institusi, score, dan verification hardcoded (`aktivitas/page.tsx:21-145`). Dua link menuju route hilang `/umkm/journey` (`:90,126`). |
| AI Copilot | mock/unsafe copy | Reply berasal dari timer dan string lokal (`ai-copilot/page.tsx:27-43`), tetapi UI mengklaim sudah menganalisis profil dan memberi angka bunga/plafon seolah live. |
| Institution discovery | mock | `MOCK_UMKM` dan request modal tidak memanggil backend (`institusi/page.tsx:8-19,37-67,214-236`). |
| Consent/dossier/access/revoke | missing/mock | Dossier list statis (`dossiers/page.tsx:7-12`); tombol tidak memiliki mutation. Tidak ada grant, scope, expiry, access event, atau revoke. |
| Institution analytics | mock | Seluruh angka dan chart hardcoded (`institusi/analytics/page.tsx:4-18`). |
| Admin dashboard | partial | Count query nyata, tetapi seluruh read dilakukan dari browser dan bergantung pada RLS yang tidak terbukti. |
| Admin analytics | partial | Count nyata dicampur synthetic weekly series (`admin/analytics/page.tsx:14,59-83`). |
| Admin UMKM/institution/mitra/rules/admins | partial/unsafe | CRUD privileged dilakukan dari browser. Score bisa dioverride, row UMKM bisa dibuat tanpa identity, rules dipublish, profiles dihapus, dan admin dibuat dengan client `signUp`. |
| Admin audit | partial | Membaca `audit_logs`; event ditulis best-effort dari browser dengan actor email hardcoded sehingga bukan append-only/trusted audit. |
| Billing/entitlements | missing | Tidak ada data model, flag, atau provider. |
| PWA/offline | partial/missing | Manifest ada, tetapi icon `/icons/icon-192.png` dan `512.png` tidak ada (runtime 404); tidak ada service worker, offline draft, queue, sync, atau conflict state. |
| Observability/rate limit/quota/jobs | missing | Tidak ada structured logging, request ID, rate limiter, quota, worker, retry policy, atau error tracking. |

## 6. Supabase boundary map

### Client/browser reads and writes

| Resource | Pemakai utama | Operasi |
|---|---|---|
| `profiles` | auth, UMKM, seluruh admin | select, insert, upsert, update, delete |
| `transactions` | UMKM layout/home/catat/laporan/notifikasi/score/gaps; admin stats | select, insert, delete, realtime |
| `documents` | UMKM layout/home/upload/score/gaps | select, insert, delete |
| `readiness_analyses` | UMKM layout/home/gaps | select |
| `institutions` | registration dan admin | select, insert, update, delete |
| `mitra` | admin | select, insert, update, delete |
| `rules_config` | admin rules | select, insert |
| `audit_logs` | admin | select dan browser-side insert |
| Storage `documents` | UMKM upload | upload, `getPublicUrl`, remove |
| Storage `avatars` | UMKM profile | upload, `getPublicUrl` |

Tidak ada service-role key di repository/client bundle berdasarkan pencarian. `.env.local` hanya memiliki nama variable `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan server-only `GROQ_API_KEY`; nilainya tidak dicatat dalam audit. Namun Route Handler masih mengizinkan `NEXT_PUBLIC_GEMINI_API_KEY` sebagai fallback (`app/api/ai/transcribe/route.ts:172`), sehingga desain kode tetap mengizinkan secret AI publik.

### RLS/storage policy status

Tidak dapat dibuktikan. Repository tidak berisi SQL migration, policy, bucket config, atau RLS tests. Filter `.eq("user_id", user.id)` di browser bukan pengganti RLS. Seluruh claim isolation harus dianggap **unverified** sampai WP-03/WP-04 menyediakan schema dan cross-account tests.

## 7. Role dan authorization sources

| Source | Evidence | Risiko |
|---|---|---|
| `user.user_metadata.role` | `proxy.ts:70`, `login/page.tsx:45`, registration metadata | Metadata diisi dari browser saat sign-up; bukan authority. |
| Tab role di login | `login/page.tsx:9,45` | Menjadi fallback redirect bila metadata/profile tidak ada. |
| Prefix email `admin@`/`institusi@` | `proxy.ts:73-78` | Identitas email dipakai sebagai role. |
| `profiles.role` | `proxy.ts:87-94`, login `:49-57` | Lebih baik dari metadata, tetapi masih dibaca/ditulis browser dan policy tidak terbukti. |
| Default `umkm` | `proxy.ts:100` | Role diam-diam diberikan saat resolution gagal. |
| Hardcoded actor email | banyak mutation admin, contoh `admin/umkm/page.tsx:110-115` | Audit actor dapat dipalsukan/tidak mencerminkan session. |

Tambahan critical behavior:

- Proxy mengembalikan request apa adanya saat URL/key Supabase kosong (`proxy.ts:34-38`), termasuk protected path: fail-open.
- Proxy hanya melakukan redirect UI. Dokumentasi Next lokal menyatakan Proxy tidak boleh menjadi full authorization; enforcement server/RLS tetap diperlukan.
- Layout admin/institusi tidak melakukan server permission check; semua children adalah Client Components.

## 8. Fabricated financial data dan dishonest success

### Fabricated values

- API all-provider/no-key fallback membuat pemasukan Rp50.000 (`app/api/ai/transcribe/route.ts:260-264`).
- `formatAIItems` mengganti nominal invalid menjadi Rp100.000 (`app/(umkm)/umkm/catat/page.tsx:91-99`).
- `fallbackParse` membuat Rp150.000 jika parser gagal (`catat/page.tsx:103-109`).
- Typed text yang tidak berhasil diparse membuat Rp100.000 (`catat/page.tsx:260-270`).
- Local parser menganggap tipe ambigu sebagai pemasukan dan qty kosong sebagai `1 paket` (`catat/page.tsx:65-76`).
- Report membuat transaksi hanya di local state ketika tidak ada user (`laporan/page.tsx:154-165`), sehingga tampak tersimpan selama sesi.

### Dishonest success/error state

- Save capture mencatat insert error ke console tetapi selalu menampilkan “berhasil disimpan ke database real” dan menghapus draft (`catat/page.tsx:296-322`).
- Profile mengabaikan kegagalan upload/auth update/upsert sebagai warning lalu menampilkan sukses (`profil/page.tsx:111-169`).
- Document upload mengabaikan storage error, lalu tetap membuat database row dan dapat menampilkan sukses (`upload/page.tsx:49-67`).
- Beberapa mutation admin mengabaikan `{ error }`, kemudian mengubah state lokal/menulis audit sukses.

## 9. AI route findings

`app/api/ai/transcribe/route.ts` saat ini:

- tidak memeriksa session/user;
- menerima JSON atau multipart tanpa content-type allowlist yang ketat;
- tidak memeriksa MIME audio, extension, ukuran, durasi, rate limit, atau quota;
- memuat seluruh file ke memory; Gemini mengubahnya menjadi base64;
- menjalankan provider secara sinkron selama web request;
- memakai `JSON.parse` dan objek dinamis tanpa schema validation;
- menormalisasi nominal invalid ke `0` dan tipe invalid ke `masuk`;
- menawarkan public Gemini secret fallback;
- mencatat raw provider error message ke console;
- menggunakan error contract yang tidak konsisten;
- membuat transaksi fiktif saat seluruh provider gagal.

Smoke runtime tanpa cookie mengirim `{}` ke API dan mendapat HTTP `400 {"error":"Teks tidak ditemukan."}`, bukan `401`; validation berjalan sebelum auth karena auth memang tidak ada.

## 10. Mock/hardcoded production paths

- Institution candidate/dossier/analytics: seluruhnya static.
- UMKM activity: static financial and consent-like events.
- UMKM roadmap: static progress and completion.
- AI Copilot: static answer/timer, termasuk angka produk keuangan yang bisa berubah.
- Admin rules: default sample UMKM, history, derived/fabricated component scores, dan threshold default.
- Admin admins: jika query kosong, menampilkan akun default seolah ada (`admins/page.tsx:57-66`).
- Institution layout: selalu menampilkan “Bank BRI KUR · Kuliner · Jakarta” (`app/(dashboard)/layout.tsx`).

Tidak ada feature flag server-side atau label Demo/Simulasi pada path tersebut.

## 11. Navigation, encoding, dan PWA

- Route `/umkm/journey` direferensikan di `aktivitas/page.tsx:90,126`, tetapi tidak ada dalam build route list.
- Manifest meminta `/icons/icon-192.png` dan `/icons/icon-512.png`; folder/file tidak ada. Smoke `/icons/icon-192.png` menghasilkan 404.
- Mojibake aktual ditemukan pada metadata/root CSS dan landing component (`â€”`, `â€œ`, `Â·`).
- Manifest dan metadata juga memuat mojibake.
- Tidak ada service worker/offline queue; PWA belum installable secara valid.

## 12. Baseline quality evidence

| Command | Result |
|---|---|
| `npm ci` | PASS; 611 package terpasang. Percobaan sandbox awal gagal karena network EACCES, pengulangan dengan izin network lulus. |
| `npm run lint` | **FAIL**; 160 problem: 79 error, 81 warning. Dominan `no-explicit-any`, React hooks purity/effect/immutability, unescaped entities, dan unused imports. |
| `tsc --noEmit` | PASS. Script `typecheck` belum tersedia di `package.json`. |
| `npm run build` | PASS setelah network font diizinkan; 30 route terbangun. Percobaan sandbox awal gagal mengambil Google Inter. |
| `npm test` | Tidak tersedia; tidak ada script atau test file. |
| `npm audit --json` | **FAIL quality gate**; 11 package terdampak (9 high, 2 moderate). Direct dependency Next 16.2.10 terdampak beberapa advisory; fix tersedia ke 16.3.2. |
| HTTP `/`, `/auth/login` | 200. |
| HTTP unauth `/umkm`, `/admin`, `/institusi` | 307 ke `/auth/login` (optimistic redirect saja). |
| HTTP `/icons/icon-192.png` | 404. |
| POST unauth API `{}` | 400 validation, bukan 401. |

Tidak ada source application yang diubah dalam WP-00. `node_modules` dan `.next` ter-ignore. Satu-satunya file baru adalah laporan ini.

## 13. Severity-ranked blockers

### Critical

1. Fabricated financial transaction/nominal pada AI dan client fallback.
2. Permanent public URL untuk dokumen identitas/legal/keuangan.
3. Role self-assertion/metadata/email-prefix dan privileged browser mutation tanpa enforcement yang terbukti.
4. Dishonest success dapat menghapus draft walau database insert gagal.

### High

1. Unauthenticated, unbounded AI route tanpa schema validation/rate limit.
2. Next 16.2.10 memiliki high-severity Proxy bypass advisory; aplikasi mengandalkan Proxy untuk route redirect.
3. RLS, storage policy, dan tenant isolation tidak dapat dibuktikan.
4. Institution registration langsung aktif dan portal menyamarkan mock sebagai real.
5. Hard-delete transaksi final dan tidak ada idempotency/audit/confirmation transaction.

### Medium

1. Lint gagal 79 error; test/CI tidak ada.
2. Readiness memberi angka ketika data belum cukup dan menggunakan wording credit-readiness/KUR yang bertentangan dengan positioning.
3. CSV formula injection, timezone UTC-vs-Asia/Jakarta, dan realtime subscription server filter belum ditangani.
4. PWA manifest rusak dan link internal hilang.
5. Dua companion specification tidak ada.

## 14. P0 execution order berdasarkan repository aktual

Urutan ini tetap mengikuti dependency graph playbook:

1. **WP-01A — Zero fabricated financial data + honest save state**
   - hapus semua fallback nominal/transaksi;
   - pertahankan draft saat AI/save gagal;
   - validasi item/nominal positif sebelum insert;
   - perbaiki profile/document/admin success state yang paling berbahaya.
2. **WP-01B — Authenticated bounded AI route**
   - server Supabase client berbasis cookie;
   - auth sebelum parsing body;
   - MIME/size/content-type validation;
   - schema output internal tanpa dependency baru bila cukup, safe failed contract, no public AI secret.
3. **WP-01C — Hide/label mock + route/encoding/PWA safety**
   - institution/activity/roadmap/copilot/admin sample diberi label demo atau dinonaktifkan;
   - hilangkan klaim produk keuangan live;
   - perbaiki `/umkm/journey`, mojibake, dan icon manifest atau hentikan claim installable.
4. **WP-02 — Test/CI baseline**
   - Vitest + unit/route failure tests + lint/typecheck/test/build scripts;
   - upgrade Next ke fixed version dengan membaca docs lokal versi baru dan regression build.
5. **WP-03/WP-04 — Database foundation, membership, RLS**
   - terblokir sampai target schema/companion doc tersedia atau keputusan schema dikonfirmasi;
   - migration additive, generated types, server-controlled membership, RLS/storage cross-account tests.
6. **WP-05+** hanya setelah database/auth gates lulus.

## 15. Acceptance criteria WP-00

- [x] Route, API, library, migration, dan test diinventaris.
- [x] Fitur dipetakan sebagai working/partial/mock/missing.
- [x] Semua query Supabase/storage dan resource-nya dipetakan.
- [x] Semua sumber role utama diidentifikasi dengan lokasi file.
- [x] Fabricated nominal/transaction dan dishonest success dibuktikan dengan lokasi.
- [x] Public storage dan dokumen sensitif dibuktikan.
- [x] Hardcoded analytics/activity/notification-like UI dibedakan dari event nyata.
- [x] Privileged browser mutation admin dibuktikan.
- [x] Baseline install/lint/typecheck/build/audit/smoke dicatat, termasuk failure existing.
- [x] Application source tidak diubah.

## 16. Keputusan sebelum paket database/security berikutnya

WP-01 dapat dikerjakan tanpa migration besar. WP-03/WP-04 tidak boleh dinyatakan selesai sebelum salah satu kondisi ini terpenuhi:

1. dua companion document yang hilang ditambahkan dan schema/policy Supabase aktual dapat dibandingkan; atau
2. tim secara eksplisit menetapkan playbook ini sebagai satu-satunya target schema, menyediakan environment database non-production, dan menyetujui migration plan additive/backfill.
