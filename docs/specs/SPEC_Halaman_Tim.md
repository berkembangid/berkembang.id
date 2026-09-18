# Spesifikasi Fitur: Halaman Tim Publik — "Orang di Balik BERKEMBANG.ID"

**Produk:** BERKEMBANG.ID · Tim P0160
**Modul:** `marketing/tim` — halaman publik, TERPISAH dari aplikasi (tanpa login, tanpa data pengguna)
**Versi:** 1.0 · 18 September 2026
**Untuk:** Harsya (build) · Yosua (foto & konten) · Hadi (review) · **Dari:** Hadi
**Konteks tenggat:** QR dicetak di name card untuk **Offline Pitching 22–23 September** → halaman harus live dan URL-nya FINAL sebelum kartu naik cetak. Tidak ada migrasi database; tidak menyentuh modul aplikasi mana pun.

> **Satu kalimat untuk dipegang saat build:**
> Ini bukan CV online — ini pintu masuk: orang men-scan kartu satu anggota tim, dalam 10 detik paham siapa dia DAN apa itu berkembang.id, lalu punya dua tombol jelas: simpan kontak, atau lihat produknya.

---

## 0. Ringkasan keputusan

| # | Keputusan | Alasan |
|---|---|---|
| H1 | **URL pendek, stabil, bisa dicetak**: `berkembang.id/tim` (indeks) dan `berkembang.id/tim/<slug>` per orang (`/tim/hadi`, `/tim/garly`, `/tim/harsya`, `/tim/yosua`). QR di kartu masing-masing menunjuk profil pribadinya dengan `?src=card`. | QR yang sudah dicetak tidak bisa diganti; slug pendek = QR renggang = mudah dipindai. |
| H2 | **Statis penuh, konten dari satu file `team.ts`** (typed config), bukan CMS/DB. | Live dalam sehari; nol permukaan serangan; konten diubah via commit. |
| H3 | **Identitas visual = palet berkembang.id** (mint/sky/navy, token v1.0), BUKAN meniru warna referensi Pinterest. Yang diambil dari referensi adalah *energinya*: tipografi besar, badge/chip, blok konten tegas, foto cut-out. | Halaman ini akan dilihat juri dan bank — personal branding boleh berani, brand tetap satu. |
| H4 | **Struktur profil: orangnya dulu, produk selalu ikut.** Hero pribadi → tentang → sorotan (pendidikan/pengalaman/karya) → keahlian & tools → kontak → **blok produk berkembang.id** (satu kalimat + 3 angka + CTA) di SETIAP profil. | Kartu nama dibagikan dalam konteks berkembang.id; scanner harus selalu ketemu produknya walau masuk lewat profil orang. |
| H5 | **Dua aksi utama per profil**: "Simpan kontak" (unduh vCard .vcf: nama, jabatan, organisasi BERKEMBANG.ID, email, telepon opsional, URL profil) dan "Kenali berkembang.id" (→ landing). Tautan sosial (LinkedIn/IG/Scholar) sekunder. | vCard = jabat tangan digital; ini yang membuat QR di kartu benar-benar berguna, bukan sekadar biodata. |
| H6 | **OG meta per profil** (foto, nama, peran, deskripsi) supaya tautan yang dibagikan via WA/LinkedIn tampil rapi; sitemap + title per halaman. | Kartu akan berpindah tangan lewat chat juga. |
| H7 | **Pelacakan ringan tanpa cookie**: parameter `?src=card|deck|ig` dicatat ke satu event pageview anonim (path + src + timestamp; tanpa IP disimpan, tanpa fingerprint). Kalau infrastruktur event publik belum ada → cukup log server, JANGAN pasang analytics pihak ketiga. | Ingin tahu QR dipakai atau tidak, tanpa menodai cerita privasi. |
| H8 | **Kinerja = syarat**: scan terjadi di lobi/booth dengan sinyal seluler. Target: LCP < 2,5 dtk di 4G throttle; total halaman < 600 KB; foto AVIF/WebP ≤ 120 KB; font = Plus Jakarta Sans yang sudah dipakai; tanpa library baru. | QR yang lemot = kartu nama yang gagal. |
| H9 | **Konsen & konten**: setiap anggota menyetujui isi profilnya sendiri (checklist §4); afiliasi JGU dicantumkan sebagai fakta; **tanpa kata terlarang** (lint yang ada berlaku — halaman publik paling rawan tangkapan layar). No. WA di vCard = opsional per orang. | Halaman publik = permukaan regulasi juga. |
| H10 | **Aset QR ikut dihasilkan**: skrip menghasilkan SVG + PNG 1200px QR per anggota (URL production + `?src=card`, error correction M, quiet zone aman) ke `docs/brand/qr/` untuk diserahkan ke desain kartu. | Menutup loop sampai barang cetak; QR generator online sering low-res atau berlogo pihak ketiga. |

## 1. Struktur halaman

### 1.1 `/tim` — indeks
Hero singkat: "Tim P0160 — orang di balik berkembang.id" + satu kalimat misi. Grid 4 kartu anggota (foto, nama, peran, satu tagline, tautan ke profil). Blok bawah: CTA produk + baris kompetisi (finalis PIDI DIGDAYA Hackathon 2026, BI × OJK). Footer standar situs.

### 1.2 `/tim/<slug>` — profil (energi referensi, palet kita)
1. **Hero**: foto cut-out (latar dihapus) di atas blok mint/gradien merek tipis; nama sangat besar (48–64px, navy-800); baris peran dengan 1–2 kata di-highlight chip (mis. "Product **&** UX"); satu kalimat pembuka personal.
2. **Tentang** — 60–90 kata, orang pertama, bahasa manusia (bukan CV formal).
3. **Sorotan** — maksimal 5 baris gabungan pendidikan/pengalaman/karya/prestasi, format tahun + baris (ala blok gelap referensi #1); untuk Hadi termasuk buku & paper; untuk anggota mahasiswa termasuk perannya di P0160.
4. **Keahlian & tools** — chip dua kelompok: keahlian (mis. arsitektur sistem, riset UMKM, UI/UX) dan tools ber-ikon (ala baris software referensi). **Tanpa skill-bar persen** — terlihat kekanakan untuk audiens bank; chip saja.
5. **Peran di berkembang.id** — 2–3 kalimat: apa yang dia pegang di produk ini.
6. **Kontak & tautan** — tombol Simpan kontak (vCard) menonjol; email; LinkedIn/IG/Google Scholar sesuai orangnya.
7. **Blok produk** (komponen sama di semua profil): logo + satu kalimat posisi ("pendamping pencatatan & kesiapan data usaha mikro — laporan berbasis SAK EMKM"), 3 angka jangkar (dikunci Hadi; usul: finalis PIDI DIGDAYA 2026 · riset 100 UMKM Depok · laporan SAK EMKM direview akuntan), CTA "Kenali berkembang.id" (+ "Lihat demo" bila ada video publik; kalau tidak, satu CTA saja).
8. Navigasi antar-anggota (4 avatar kecil) + kembali ke `/tim`.

## 2. Desain — menerjemahkan referensi ke brand

| Elemen referensi Pinterest | Terjemahan di kita |
|---|---|
| Highlight kata dengan blok ungu/hijau neon | Chip highlight `--mint-400` (teks navy-800) dan `--sky-400` — hanya 2–3 kata per halaman, bukan semua |
| Blok gelap "About/Education" | Kartu `--navy-800` teks putih untuk SATU seksi (Sorotan) — kontras AAA sudah terverifikasi di palet |
| Bentuk organik/blob di tepi | Aksen kurva halus `--mint-100`/`--sky-100` di sudut hero, opasitas rendah, tidak menyentuh teks |
| Skill bar dengan level | **Tidak dipakai** — chip polos |
| Umur/tanggal lahir, alamat detail | **Tidak dipakai** — tak perlu di halaman publik |
| Foto model, pose seragam | Foto tim konsisten: setengah badan, latar dihapus, pencahayaan serupa — Yosua koordinasi (foto rapi yang sudah ada + background removal juga boleh) |

Mobile-first (QR = hampir 100% dibuka dari HP): hero menumpuk, tombol vCard sticky di bawah pada layar sempit.

## 3. Teknis

- Route group terpisah dari app (mis. `app/(marketing)/tim/...`), static generation (`generateStaticParams` dari `team.ts`), tanpa akses Supabase, tanpa auth, tanpa cookie.
- `team.ts` typed: `{slug, name, role, tagline, about, highlights[], skills[], tools[], productRole, links{email, linkedin?, instagram?, scholar?}, photo, vcardPhone?}`.
- vCard: route `GET /tim/<slug>/vcard` menghasilkan .vcf (VERSION:3.0; N/FN; ORG "BERKEMBANG.ID — Tim P0160"; TITLE; EMAIL; TEL bila diizinkan; URL profil); tombol unduh langsung.
- Skrip QR (`scripts/generate-team-qr.mjs`, lib QR ringan sebagai dev-dependency): output SVG + PNG 1200px per slug ke `docs/brand/qr/`, URL production + `?src=card`, EC level M, quiet zone 4 modul, **tanpa logo di tengah** (kartu kecil — keandalan scan > gaya).
- Event `?src`: log `public_pageviews(path, src, at)` HANYA bila mekanisme server event sudah ada; kalau belum, lewati dan catat TODO (H7). Tanpa analytics pihak ketiga.
- OG image per profil: statis, dibuat Yosua dari template (1200×630), disimpan di repo — JANGAN bangun generator og-image dinamis untuk 4 orang.
- Lint kata terlarang diperluas mencakup direktori marketing.

## 4. Checklist konten (pemilik: Yosua · tenggat 20 Sept — blocker cetak)

Per anggota (Hadi · Garly · Harsya · Yosua; nama peran final dikonfirmasi Hadi):
☐ Foto setengah badan latar bersih (min 1000px) ☐ Tagline 1 kalimat ☐ Tentang 60–90 kata ☐ 5 sorotan ☐ Keahlian ≤5 + tools ≤6 ☐ Peran di produk 2–3 kalimat ☐ Email yang mau dipublikasikan ☐ Tautan sosial yang mau dipublikasikan ☐ Keputusan: nomor telepon di vCard ya/tidak ☐ Persetujuan isi (balas "OK" di grup)

Satu kali: ☐ 3 angka jangkar blok produk (Hadi) ☐ OG image 5 buah (4 profil + indeks) ☐ **URL production dikonfirmasi 19 Sept** — kalau domain `berkembang.id` belum mengarah ke deployment sebelum kartu dicetak, QR menunjuk URL deployment yang stabil (subdomain/vercel) dan domain di-redirect menyusul; jangan menunda cetak demi domain.

## 5. Kriteria penerimaan
1. `/tim` + 4 profil live, statis, tanpa satu pun request ke API aplikasi/Supabase (verifikasi lewat network tab).
2. vCard terunduh dan terbaca benar di iOS dan Android (uji 2 HP nyata); ORG = BERKEMBANG.ID.
3. Lighthouse mobile: Performance ≥ 90; LCP < 2,5 dtk pada throttle 4G; total halaman < 600 KB.
4. QR hasil skrip terpindai dari cetakan 2×2 cm (uji cetak kertas biasa sebelum kirim percetakan).
5. Preview tautan rapi di WhatsApp (uji kirim).
6. Tanpa kata terlarang; tanpa umur/alamat/NIK; hanya kontak yang disetujui pemiliknya.
7. Semua tautan sosial hidup (uji klik satu per satu).

## 6. Di luar cakupan
CMS/edit dari admin, halaman tim di dalam aplikasi, blog, versi EN (boleh menyusul), og-image dinamis, analytics pihak ketiga, form kontak (email cukup), foto AI-generated — pakai foto asli; audiens kita juri dan bank.
