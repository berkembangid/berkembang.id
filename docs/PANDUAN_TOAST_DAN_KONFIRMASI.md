# Toast dan konfirmasi

Dua keputusan kecil yang kalau dibiarkan diputuskan ulang di setiap layar akan
melahirkan sepuluh gaya berbeda dalam sebulan.

## Kapan toast, kapan tetap di layar

| Yang terjadi | Tempatnya |
| --- | --- |
| Hasil sebuah tindakan (tersimpan, dibatalkan, diarsipkan) | Toast |
| Kerja yang berlangsung lama (unggah, baca ulang dokumen) | Satu toast `notifyBusy`, ditutup dengan id yang sama |
| Salah isi pada formulir yang sedang terbuka | Toast kuning, atau teks di bawah isiannya |
| Daftar/laporan gagal dimuat | **Tetap di layar** (`FeedbackBanner`) |
| Kalimat akibat yang perlu dibaca pelan ("untung bulan ini naik …") | **Tetap di layar** |

Aturannya satu: kalau layarnya sudah berubah dan pemilik tinggal melanjutkan,
kabarnya boleh lewat. Kalau layar justru kosong atau menunggu sesuatu, kabarnya
harus tinggal — toast yang hilang setelah beberapa detik akan meninggalkan
layar kosong tanpa penjelasan.

## Warna

`lib/notify.ts` sengaja tidak menyediakan `notifyError`.

- `notifySuccess` — berhasil.
- `notifyWarning` — **ada yang bisa dibetulkan pemilik.** Kuning.
- `notifyFailure` — **sistemnya yang gagal.** Merah, dan hanya ini.
- `notifyFromError(cause, fallback)` — memilihkan di antara keduanya: pesan
  yang sudah berbentuk kalimat Indonesia jadi kuning, kode galat jadi merah
  dengan `fallback`. Aturannya dikunci di `tests/unit/notify-tone.test.ts`.

Kalau semua kesalahan berwarna merah, merah berhenti berarti apa-apa, dan saat
sistemnya benar-benar gagal tidak ada lagi cara mengatakannya.

## Konfirmasi

`useConfirm()` dari `components/ui/confirm.tsx`:

```ts
if (!(await confirm({ title, description, tone: "danger" }))) return;

const reason = await confirmWithReason({ title, reasonLabel: "Kenapa dibatalkan?" });
if (reason === null) return;
```

**Yang ditanyakan hanya yang tidak bisa ditarik kembali**, dan yang ditulis di
`description` adalah AKIBATNYA, bukan mekanismenya. Bandingkan "Yakin?" dengan
"Setelah ditutup, transaksi tanggal itu tidak dapat diubah lagi."

Sudah dipasang di: keluar akun, batalkan transaksi (beralasan), tutup kas,
simpan kondisi awal, buang draf catatan, arsipkan dokumen, hapus akses admin,
setujui/tolak permintaan akses, cabut akses, bersedia ditemukan lembaga, gabung
program.

**Tidak dipasang** — dan ini disengaja — pada tiga tempat yang sudah punya
langkah konfirmasinya sendiri di dalam layar, dan langkah itu menjelaskan lebih
banyak daripada dialog umum: hapus akun (`AccountDataPanel`), tandai alat sudah
tidak dipakai (`AssetLoanRegister`), dan hapus satu baris draf di layar Catat —
yang terakhir memakai toast "Urungkan", karena dialog untuk satu baris lebih
mengganggu daripada kekeliruannya.

## Yang harus ada supaya keduanya bekerja

`app/globals.css` memuat jembatan token shadcn. Komponen di `components/ui/`
memakai kosakata `--popover`, `--border`, `--ring`, `--radius`; sistem desain
ini memakai kosakata Material. Tanpa blok `@theme inline` itu, `bg-popover`
tidak menghasilkan apa pun dan komponennya tampil tanpa gaya. `tw-animate-css`
juga diimpor di sana — tanpanya `data-open:animate-in` diam saja.
