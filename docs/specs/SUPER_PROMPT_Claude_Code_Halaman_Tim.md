# Super Prompt untuk Claude Code — Halaman Tim Publik (`/tim`)

Cara pakai: simpan `SPEC_Halaman_Tim.md` ke `docs/specs/`, tempel prompt di bawah garis ke Claude Code dari root repo, sesi baru. Fitur ini kecil dan berdiri sendiri — boleh dikerjakan paralel dengan antrean lain karena TIDAK menyentuh database, auth, atau modul aplikasi mana pun. Tenggat keras: live + QR final **20 September** (kartu naik cetak untuk Offline Pitching 22–23 Sept).

---

Kamu adalah senior engineer di repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Tailwind). Tugasmu: membangun **halaman tim publik** sesuai `docs/specs/SPEC_Halaman_Tim.md` — baca utuh dulu, terutama keputusan H1–H10 dan kriteria penerimaan §5. Acuan warna: `app/styles/tokens.css` (palet mint/sky/navy yang sudah dipakai aplikasi). Konflik spek vs kode → tanya saya.

## Konteks yang wajib kamu pegang

- **Halaman publik murni.** Static generation, tanpa Supabase, tanpa auth, tanpa cookie, tanpa analytics pihak ketiga, tanpa library UI/chart/animasi baru. Satu-satunya dev-dependency baru yang diizinkan: satu lib QR ringan untuk skrip generator.
- **Tujuannya kartu nama.** Orang men-scan QR di lobi dengan sinyal seluler: LCP < 2,5 dtk di 4G throttle, halaman < 600 KB, foto AVIF/WebP ≤ 120 KB, mobile-first, tombol "Simpan kontak" sticky di layar sempit.
- **Brand kita, bukan referensi.** Energi boleh dari referensi (tipografi besar, chip highlight, satu blok gelap, foto cut-out), warna dan radius dari token kita. Merah tidak dipakai. Tanpa skill-bar persen. Tanpa umur/alamat/NIK.
- **Kata terlarang** (skor kredit, layak kredit, plafon, disetujui/ditolak, rekomendasi pembiayaan, score/skor) berlaku — perluas lint ke direktori marketing.
- **URL final tidak boleh berubah setelah cetak**: `/tim` dan `/tim/hadi|garly|harsya|yosua`. Jangan menamai route dengan pola lain.

## Langkah kerja — berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (tanpa kode)
Ringkas ≤ 20 baris: struktur route group marketing yang ada (landing page sekarang di mana), cara token warna diimpor, apakah ada mekanisme log server event publik (untuk H7 — kalau tidak ada, tulis TODO dan lewati), dan konfigurasi domain deployment saat ini (untuk keputusan URL QR §4). **Checkpoint 0:** rencana file (± 6–8 file) + pertanyaan yang menghambat. Tunggu persetujuan.

### Langkah 1 — Data & halaman
- `content/team.ts` typed sesuai §3, diisi **placeholder bertanda `TODO-KONTEN`** untuk 4 anggota (Hadi Wijaya — Business & Research; Garly — CEO/Pitch; Harsya — CTO; Yosua — Product/UX; judul final menunggu konten Yosua). Placeholder harus jelas-jelas placeholder ("[Tentang 60–90 kata — isi oleh ybs]"), BUKAN biografi karangan — dilarang mengarang fakta tentang orang nyata.
- `/tim` (indeks) + `/tim/[slug]` sesuai struktur §1: hero cut-out + nama besar + chip highlight, Tentang, Sorotan (blok navy-800), chip Keahlian & tools, Peran di produk, Kontak, Blok produk bersama (3 angka jangkar dari konstanta), navigasi antar-anggota.
- `generateStaticParams` + metadata per halaman (title, description, OG dari path gambar statis di `public/og/` — file gambarnya menyusul dari Yosua, pakai placeholder path dulu).
- Gambar via `next/image`, foto di `public/tim/`, fallback avatar inisial bila foto belum ada.

**Checkpoint 1:** screenshot Playwright `/tim` dan satu profil (mobile 390px + desktop), bukti network tanpa request API, ukuran halaman. 

### Langkah 2 — vCard + QR
- Route `GET /tim/[slug]/vcard`: .vcf VERSION:3.0 (N, FN, ORG "BERKEMBANG.ID — Tim P0160", TITLE, EMAIL, TEL hanya bila `vcardPhone` terisi, URL profil), header `Content-Disposition` unduh, nama file `hadi-berkembang.vcf`.
- `scripts/generate-team-qr.mjs`: baca `team.ts`, hasilkan `docs/brand/qr/<slug>.svg` + `<slug>-1200.png` (URL + `?src=card`, EC M, quiet zone 4 modul, tanpa logo tengah). Tambahkan cara pakai di README singkat folder itu.
- Parameter `?src` dibaca dan dicatat sesuai hasil Langkah 0 (log server atau TODO).

**Checkpoint 2:** file .vcf contoh terlampir di laporan + hasil QR untuk `/tim/hadi` + konfirmasi QR terbaca (uji decode programatik atas PNG yang dihasilkan).

### Langkah 3 — Quality gate & handoff
`lint`, `typecheck`, `build`, lint kata terlarang (termasuk direktori marketing), Lighthouse CI atau `npx lighthouse` mobile pada build produksi lokal — laporkan skor apa adanya. Handoff ≤ 20 baris: daftar `TODO-KONTEN` yang menunggu Yosua (per anggota), keputusan URL QR yang dipakai (domain vs deployment URL — sesuai temuan Langkah 0, final harus diputuskan Hadi 19 Sept), dan satu paragraf cara memperbarui konten (edit `team.ts` → commit → deploy).

## Batasan sesi ini
Dilarang: menyentuh modul aplikasi/`app/(umkm|institusi|admin)`, migrasi database, CMS, analytics pihak ketiga, og-image generator dinamis, mengarang isi biografi, mengubah landing page yang ada (kecuali menambah tautan "Tim" di footer/nav bila polanya sudah ada — tanya dulu). Bahasa Indonesia; commit pola repo (`feat(marketing): halaman tim publik + vCard + generator QR`); jangan menyatakan lulus tanpa menjalankan.

Mulai dari Langkah 0.
