# Serah terima — Portal lembaga & investor (23 September 2026)

Pembenahan menyeluruh portal `/lembaga` dan `/investor`: sistem dulu, lalu
tampilan, lalu fitur yang datanya sudah ada. Setiap fase satu commit.

## Alamat

| Lama | Baru |
|---|---|
| `/institusi` | `/lembaga` |
| `/institusi/broadcast` | `/lembaga/siaran` |
| `…/shortlist` | `…/tersimpan` |
| `…/requests` | `…/permintaan` |
| `…/dossiers` | `…/dosir` |
| `/institusi/analytics` | `/lembaga/analitik` |
| `/umkm/roadmap`, `/score`, `/gaps` | `/umkm/perjalanan` |
| `/umkm/ai-copilot` | `/umkm/panduan` |
| `/umkm/upload` | `/umkm/profil/dokumen` |

Semua alamat lama dialihkan permanen di `next.config.ts`.

## Migrasi

| Migrasi | Isi | Demo | Produksi |
|---|---|---|---|
| `0101` | Nama jenis dokumen legalitas (`ktp`, `izin_edar`) | **belum** | **belum** |
| `0103` | `ringkasan_usaha_yang_diminta` — kode & ringkasan UMKM untuk Permintaan/Dosir | ✅ | ✅ |
| `0104` | `resolve_my_institution_id` membaca header `x-institution-id` | ✅ | ✅ |
| `0105` | Hari WIB untuk batas 20 permintaan, `institution_quota`, audit create/update/delete | ✅ | ✅ |
| `0106` | Catatan pribadi kandidat tersimpan | ✅ | ✅ |

`0101` menulis ulang beberapa fungsi yang sedang berjalan (daftar kandidat,
dasbor dinas, persetujuan dosir). Periksa definisi berjalan di tiap basis data
sebelum menerapkannya — `create_dossier_request` di produksi ternyata pernah
diterapkan tanpa komentar dan berbeda hash dari repo, meski isinya sama.

## Perubahan perilaku yang perlu diketahui

- **Izin unduh pemilik kini ditegakkan.** Dosir yang disetujui tanpa izin
  unduh berlabel "Hanya lihat"; rute PDF menolaknya dengan 403.
- **Organisasi terpilih ditegakkan di server.** Pilihan di menu samping ditulis
  ke kuki `berkembang_institution_id` dan dikirim sebagai `x-institution-id`.
  Rute daftar selalu menyaring satu organisasi (`resolveSelectedInstitution`
  di `lib/api/institution.ts`).
- **Pemilih organisasi disaring per portal** (`InstitutionProvider portalKind`).
- **Log audit** kini mencatat permintaan izin, simpan/lepas kandidat, program,
  anggota, kunci API, dan pembukaan detail dosir.

## Struktur kode

- `components/shell/PortalShell.tsx` — kerangka bersama kedua portal.
- `modules/consent/portal-copy.ts` — kosakata lembaga/investor.
- `modules/consent/candidate-ui.tsx` — lencana tingkat, kepala & fakta kartu,
  kotak cari, kerangka muat, keadaan kosong.
- `modules/consent/candidate-card.tsx` — kartu kandidat, dialog Ajukan
  ketertarikan (`useInterestRequest`), daftar tersimpan (`useShortlist`), kuota.
- `modules/consent/notification-center.tsx` — panel & daftar pemberitahuan.

## Belum dikerjakan

- **Regenerasi `types/database.generated.ts`.** Fungsi `0103`–`0106` masih
  ditulis di `types/institution-portal.supplement.ts`. Jalankan `npm run db:types`
  dengan basis data lokal, lalu kosongkan suplemennya.
- **Satu bentuk galat API.** Rute lembaga masih memakai dua bentuk
  (`gagal()` dan `consentErrorResponse`). Keduanya sudah `{ error: { code, message } }`;
  `consentErrorResponse` kini mencatat `requestId`-nya di log server.
- **E2E portal lembaga** (`tests/e2e/portal-lembaga.spec.ts`) butuh
  `PLAYWRIGHT_BASE_URL`, `E2E_LEMBAGA_EMAIL`, `E2E_LEMBAGA_PASSWORD`; belum
  pernah dijalankan terhadap lingkungan sungguhan.
- Tampilan belum diperiksa di peramban — tidak ada sesi lembaga yang tersedia
  saat pengerjaan.
