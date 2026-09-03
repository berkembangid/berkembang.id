# Serah terima — Tingkat Kesiapan R-A (`wp08-pilot-v2`)

Migrasi `0047`. Gerbang hijau: `typecheck`, `lint` (0 galat), `lint:terms`,
`test` 650, `test:integration` 94, `build`, `db:test` `0001`–`0047` fresh +
replay, `db:types:check`, `check:voice-bundle`.

## Selesai

- Konfigurasi `wp08-pilot-v2` di `readiness_rule_sets`; **tidak ada satu ambang
  pun di dalam kode**. Trigger menolak perubahan isi pada versi terbit.
- `fn_readiness_facts` — dua belas fakta dalam satu perjalanan ke basis data.
- `modules/readiness/evaluator.ts` — murni, 25 uji, tanpa basis data.
- `readiness_daily` + `business_readiness_state` (dengan `grace_until` yang
  sudah disiapkan untuk R-B).
- `GET /api/v1/readiness` dan `GET /api/v1/readiness/methodology`.
- Halaman `/umkm/kesiapan` (tangga, langkah paling berdampak, empat pilar,
  cincin A1) dan `/umkm/kesiapan/metodologi`.
- Kartu mini Beranda; cincin "6/7" dan kartu "17/100" dihapus.
- `/umkm/roadmap`, `/umkm/score`, `/umkm/gaps` diarahkan ke halaman yang sama.
- `readiness-page.tsx` dan `readiness-tier.ts` **dihapus**; grep membuktikan
  tidak ada pemakai tersisa.
- Kamus lint: `score`, `skor`, `poin`, `x/100`, `dari 100` di layar pemilik.

## Keputusan yang saya ambil sendiri

1. **Nomor `0047`**, bukan `0033` — repo sudah di `0046`.
2. **Tidak ada job harian.** Repo ini tidak punya penjadwal sama sekali. Potret
   ditulis saat halaman dibaca, idempoten per tanggal. Efeknya identik untuk
   pemilik aktif, dan ini sekaligus menyelesaikan evaluasi retroaktif akun lama
   pada pembacaan pertama — tanpa proses massal, jadi batching tidak diperlukan.
3. **Agregasi di SQL, penilaian di TypeScript.** Aturan yang hanya bisa diuji
   lewat basis data hidup akan jarang diuji.
4. **Kamus lint dapat kategori pola**, bukan hanya kata. "17/100" tidak
   berbentuk frasa dan akan lolos pencarian kata biasa; baris komentar
   dikecualikan karena tidak pernah sampai ke mata pembaca.
5. **`recalculate_my_readiness` v1 tidak dicabut.** Portal institusi masih
   membacanya, dan dossier adalah R-B. Yang dihapus adalah *render* v1.

## Dua temuan dari `db:test`

**Memutar ulang migrasi mematikan konfigurasi v2.** `0022` mempensiunkan setiap
versi selain `wp08-pilot-v1`; karena `0022` selalu berjalan sebelum `0047`, satu
kali replay membuat v2 berstatus `retired` dan `loadReadinessConfig` — yang
menyaring `status = 'published'` — gagal total. v2 kini **diterbitkan ulang**,
bukan dilewati.

**Fungsi `stable` tidak boleh membuat tabel sementara.** Versi pertama
`fn_readiness_facts` memakai tabel sementara untuk daftar bulan penuh dan gagal
saat dipanggil. Bulan penuh kini larik `date[]`.

## Jawaban §9

1. Skema `readiness_rule_sets` **cukup**: struktur §2–§3 masuk ke `rules`
   sebagai satu jsonb. `weights`/`thresholds` sengaja dikosongkan — T2 menghapus
   pembobotan. Yang perlu ditambahkan hanya trigger pembeku versi.
2. **View/fungsi SQL**, bukan job — karena tidak ada job. Seluruh agregasi ada
   di satu fungsi.
3. "Langkah usaha berikutnya" adalah **blok terpisah** di Beranda dengan cincin
   sendiri. Cincinnya dihapus; blok misinya tetap.
4. Tidak bisa saya jawab — tidak ada akses production. Evaluasi malas per-akun
   menghilangkan kebutuhan batching.

## Ditunda ke R-B / R-C

Masa tenggang 7 hari yang berjalan (kolomnya sudah ada), aktivitas perayaan
kenaikan tingkat, dossier institusi membaca model baru, dan pembukaan PDF
multi-bulan terikat Perak. **Belum ada satu pun kemampuan yang benar-benar
dikunci oleh tingkat** — T3 baru terpenuhi di R-B.

## Demo 45 detik

Buka **Beranda**: kartu "Tingkat kesiapan" menyebut satu tingkat dan satu
langkah tercepat — tidak ada angka. Ketuk kartunya → halaman **Tingkat
Kesiapan**: tangga empat anak, kartu "langkah paling berdampak", lalu empat
pilar dengan dua belas hal yang dinilai, masing-masing dengan nilai sekarang,
ajakan, dan satu aksi. Tunjuk komponen "Belum ada belanja besar" — netral, bukan
merah, dan tidak menahan tingkat. Tutup dengan **"Lihat cara kami menghitung"**:
seluruh tabel aturan terbuka, versi `wp08-pilot-v2`, dan kalimat bahwa ini bukan
penilaian kelayakan.

## Belum terverifikasi

`tests/e2e/tingkat-kesiapan.spec.ts` (6 skenario, termasuk uji satu-endpoint-dua-layar
dan uji tanpa-angka-mentah) sudah ditulis dan terdaftar, **belum pernah
dijalankan** — lingkungan ini tanpa `E2E_EMAIL`/`E2E_PASSWORD`. Benchmark §6.8
baru diuji di sisi evaluator (1.000 evaluasi < 200 ms); p95 endpoint pada akun
1.000 transaksi **belum diukur** karena butuh akun berdata di lingkungan hidup.
