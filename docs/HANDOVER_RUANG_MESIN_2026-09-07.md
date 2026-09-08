# Ruang Mesin (Adm-A) + jalur kamera — 7 September 2026

Semua gate hijau: `db:test`, `db:types:check`, `typecheck`, `lint` (0 error), `lint:terms`,
`test` 784, `test:integration` 104, `build`, `check:voice-bundle`.

## Yang selesai

| Migrasi | Isi |
| --- | --- |
| `0069` | Peran admin, catatan tindakan append-only, tiket Mode Dukungan, sakelar fitur, akun demo, konfigurasi ber-versi, rollup, saved views, definisi metrik |
| `0070` | `my_feature_flags()` untuk pemilik, `admin_set_feature_flag*` untuk admin |
| `0071` | Jejak nominal: `amount_overrides`, `ocr_summary` pada `transaction_captures` |
| `0072` | `admin_health_row()`, `admin_ai_quality()`, `admin_cost_row()` |
| `0073` | Daftar akun demo |

Layar: `/admin/flags`, `/admin/mesin`, `/admin/demo`. Jalur kamera UMKM lengkap — di balik
sakelar `capture_camera`, dengan sesi unggah, jejak baris nota, pemilih kandidat saat ambigu,
dan bukti otomatis menempel setelah tersimpan.

## Penyesuaian terhadap spek (alasan lengkap di kepala tiap migrasi)

1. Nomor migrasi di spek (`0034`, `0035`) berasal dari peta lain — repo sudah di `0068`.
2. Tidak ada `admin_users`: `platform_admins` sudah menjadi sandaran RLS di seluruh basis data.
3. Tidak ada `account_status`: `businesses.status = 'suspended'` sudah memblokir masuk.
4. "Minimal 2 SUPER_ADMIN" ditegakkan sebagai "tidak boleh nol" — dua membuat pemasangan
   pertama mustahil.
5. `support_sessions` sama sekali tidak bisa di-`update`; mengakhiri dan memperpanjang jalannya sama.
6. Mematikan sakelar cukup OPS, menyalakan menuntut SUPER_ADMIN. Sama untuk pembekuan akun.

## Yang belum

- **Reset ke fixture** — menandai dan mereset dua keputusan berbeda; resetnya harus menyusun
  ulang catatan lewat jalur resmi, dan tombolnya sengaja belum dipasang.
- **Tab Produk** (DAU, corong, kohort) — bersandar pada rollup harian, dan proyek ini tidak
  punya penjadwal apa pun.
- **Mode Dukungan** — tiketnya ada dan tercatat di basis data; layar rendernya belum.
- **`readReceiptText` dengan foto sungguhan** — belum pernah sekali pun dipanggil dengan gambar nyata.
- Empat metrik `measurable = false` (simpan-tanpa-edit, edit nominal vs kategori, alasan
  NEEDS_INPUT, biaya rupiah) tampil sebagai "Belum diukur" beserta alasannya.

## Tur 60 detik

`/admin/mesin` — lampu **Nominal dari model = 0** → `/admin/flags` matikan `capture_voice`,
layar Catat pemilik berpindah sendiri ke mode ketik tanpa galat → nyalakan kembali (butuh
SUPER_ADMIN) → nyalakan `capture_camera`, tombol Foto nota muncul di layar Catat.
