# Super Prompt untuk Claude Code — Portal Admin "Ruang Mesin" (Adm-A: v1.0 + v1.1)

Cara pakai: simpan `SPEC_Portal_Admin.md` (v1.0) dan `SPEC_Portal_Admin_v1.1_Dasbor.md` ke `docs/specs/`, tempel prompt di bawah garis ke Claude Code dari root repo, sesi baru. Sesi ini = **Tahap Adm-A** dengan urutan prioritas §7 v1.1 (butir 1–3; butir 4 dikerjakan hanya bila waktu tersisa). Adm-B/Adm-C dilarang. Prasyarat: `0029`–`0033` hijau; telemetry V-A (dan K-A bila sudah ada) mengalir; `0034` institusi boleh belum ada — lihat Langkah 0.

---

Kamu adalah senior engineer di repo BERKEMBANG.ID (Next.js 16 App Router, React 19, TypeScript 5, Supabase, Zod, Vitest, Playwright). Tugasmu: **Tahap Adm-A** dari dua spek: `docs/specs/SPEC_Portal_Admin.md` (v1.0 — peran, log, Mode Dukungan, konfigurasi ber-versi, flags, demo) dan `docs/specs/SPEC_Portal_Admin_v1.1_Dasbor.md` (dasbor, manajemen UMKM, manajemen pengguna). Baca KEDUANYA utuh — keputusan M1–M19, invarian v1.0 §5 + v1.1 §5 — sebelum menyentuh kode. Acuan visual: `docs/design/mockup-admin-dashboard.html` (minta bila tidak ada). Konflik spek vs kode → berhenti dan tanya saya. Konflik v1.0 vs v1.1 → v1.1 menang (lebih baru), catat di handoff.

## Konteks yang wajib kamu pegang

- **Admin bukan tuhan kecil.** Tiga larangan mutlak: (1) tidak ada UPDATE/DELETE pada `journal_entries`/`journal_lines`/`transactions` dari rute admin — perbaikan data hanya memicu fungsi jalur resmi (reversal, reclass, rebuild); (2) NIK tampil ter-mask di semua layar termasuk SUPER_ADMIN, tidak ada endpoint yang mengembalikan NIK penuh; (3) **tidak ada nominal rupiah per akun UMKM di endpoint/daftar/rollup admin mana pun** — isi keuangan hanya lewat Mode Dukungan read-only ber-tiket 30 menit yang tercatat dan terlihat oleh UMKM-nya. (Agregat lintas-platform seperti total biaya AI boleh.)
- **Setiap aksi tulis admin butuh `reason`** dan menulis `admin_action_logs` (append-only) dalam transaksi yang sama; tanpa reason → 422.
- **Konfigurasi lewat versi**: draft → tinjau → terbit; penerbit ≠ pembuat draft untuk domain berdampak-luas (kecuali darurat SUPER_ADMIN ber-alasan, tercatat); gate otomatis per domain harus hijau sebelum tombol terbit aktif (simulasi posting 10 kategori untuk CATEGORY_COA, test suite parser untuk PARSER, lint kata untuk SYSTEM_TEXTS).
- **Dasbor bisa bertindak**: setiap KPI punya definisi (`metric_definitions`) dan drill-down ke daftar entitas; angka dihitung server (rollup harian + query langsung), tidak pernah di klien; akun `is_demo` dikecualikan default.
- Palet: dunia admin memakai `data-world="institusi"` (navy); alert merah HANYA untuk kegagalan sistem di baris kesehatan; tren turun = navy-400, bukan merah; angka `tabular-nums`; tanpa pie chart; tanpa library chart baru tanpa persetujuan.
- Lint kata kelayakan (skor kredit, layak, plafon, disetujui/ditolak, rekomendasi pembiayaan) berlaku pada label/judul/ekspor admin.

## Langkah kerja — berurutan, berhenti di setiap checkpoint

### Langkah 0 — Orientasi (tanpa kode)
Ringkas ≤ 40 baris: (a) model identitas internal `0027` — cara menumpangkan `admin_users`/`admin_roles` tanpa sistem identitas kedua; (b) rules engine kesiapan yang ada — dimigrasikan ke `config_versions` atau dibungkus adaptor (jawab pertanyaan v1.0 §7.2, usulkan); (c) di mana telemetry V-A/K-A tersimpan dan metrik mana yang SUDAH bisa dihitung nyata vs yang harus tampil "belum diukur"; (d) mekanisme job terjadwal — kalau tidak andal, pakai fallback v1.1 §8.2 (rollup dihitung saat tab dibuka + cache 1 jam); (e) status `0034` (institusi) — kalau belum ada, halaman Institusi dikerjakan sebatas skeleton ber-TODO dan sisanya menunggu sesi I-A, JANGAN membuat tabel institusi sendiri; (f) status quality gate. **Checkpoint 0:** rencana migrasi `0035` (tabel v1.0 §4 + v1.1 §4) + daftar file + keputusan (b)/(d)/(e). Tunggu persetujuan.

### Langkah 1 — Fondasi: identitas, log, migrasi `0035`
`admin_users`, `admin_roles` (guard: minimal 2 SUPER_ADMIN aktif; SUPER_ADMIN terakhir tidak bisa menonaktifkan diri; pemberian SUPER_ADMIN butuh SUPER_ADMIN lain), `admin_action_logs` + `support_sessions` (append-only, trigger tolak UPDATE/DELETE), `feature_flags`, `demo_accounts`, `config_versions`, `ops_daily_rollups`, `saved_views`, `metric_definitions`, kolom `account_status` + reason. RLS membership admin; middleware peran per sesi ("bertindak sebagai [peran]"). Daftarkan di migration contract test + verify script.
**Checkpoint 1:** SQL + test migrasi + test guard peran (5 kasus: super admin terakhir, self-grant, reason kosong 422, log tertulis satu transaksi, append-only ditolak).

### Langkah 2 — Prioritas 1: Demo reset + Flags/kill switch (target duluan — dibutuhkan dry-run 12 Sept)
- Halaman Demo: daftar akun `is_demo`, tombol **Reset ke fixture** (fixture seed deterministik: `dimsum-3-bulan` ±90 transaksi + dokumen + level via jalur seeding resmi; `bni-ventures` & `dinas-depok` = stub bila `0034` belum ada), idempoten ≤ 60 dtk, riwayat reset; guard ganda non-demo tidak bisa direset; akun demo dikecualikan job pengingat.
- Halaman Flags: `capture_voice`, `capture_camera`, `caption_live`, `pdf_export`, `discovery_institusi` (stub) — global + per-akun, reason wajib, riwayat di action logs. **Kill switch behavior test**: voice dimatikan → layar Catat UMKM jatuh anggun ke mode ketik ≤ 1 menit dengan pesan ramah.
**Checkpoint 2:** E2E reset dua kali idempoten + kill switch test + screenshot.

### Langkah 3 — Baris kesehatan + Tab Kualitas AI + Tab Biaya
Layout portal admin (sidebar mockup), baris kesehatan 6 lampu (auto-refresh 5 mnt; lampu `llm_amount_violation` terhubung counter runtime NYATA), Tab Kualitas AI (KPI + grafik + drill-down capture teranonim TANPA teks mentah + tombol "tandai untuk golden set" → tabel penanda), Tab Biaya (biaya per provider dari telemetry, error, antrean, storage per rak, tabel job). Metrik tanpa sumber → kartu "Belum diukur" (dilarang angka contoh). `metric_definitions` terisi untuk semua KPI yang tampil; menu ⋯ menampilkan rumus + unduh CSV agregat.
**Checkpoint 3:** test invarian v1.1 #11 (sapu respons: tidak ada rupiah per akun), #12 (rekonsiliasi KPI↔drill-down untuk 2 metrik), #13 (demo dikecualikan); screenshot ketiga area.

### Langkah 4 — Daftar UMKM + detail akun + Mode Dukungan + lifecycle
Daftar sesuai v1.1 §2.1 (kolom, filter, saved views, aksi massal non-invasif, ekspor CSV metadata), detail akun 6 tab §2.2, halaman "Perhatian data" §2.3 (minimal 4 sinyal yang datanya sudah ada), lifecycle §3.1 (bekukan/aktifkan ber-alasan; TENGGANG-HAPUS hanya status baca), Mode Dukungan (reason → sesi 30 mnt → render UI UMKM read-only dengan banner → setiap halaman tercatat → entri muncul di riwayat akses UMKM ybs), manajemen admin §3.2 (undang, nonaktifkan, peran).
**Checkpoint 4:** E2E: (1) buka Mode Dukungan → banner tampil → log tertulis → akun UMKM melihat entri akses; (2) sesi kedaluwarsa 30 menit → 403; (3) bekukan akun ber-alasan → login diblok → buka bekuan oleh SUPER_ADMIN; (4) saved view tersimpan dan terpakai; (5) ekspor CSV tidak memuat rupiah. Screenshot.

### Langkah 5 — (hanya bila waktu tersisa) Editor Konfigurasi minimal
Domain CATEGORY_COA + PARSER + SYSTEM_TEXTS dengan alur draft→tinjau→terbit, diff, gate otomatis per domain, dua-kunci, rollback=terbit-ulang. READINESS menyusul sesuai keputusan (b) Langkah 0.
**Checkpoint 5:** test dua-kunci + gate (draft CoA yang merusak simulasi posting → tombol terbit nonaktif).

### Langkah 6 — Quality gate & handoff
`lint`, `typecheck`, `test`, `test:integration`, `build`, lint kata, benchmark dasbor (v1.1 #16 pada fixture — kalau fixture 5.000 akun terlalu berat untuk env, jalankan pada 500 dan katakan jujur skalanya). Perbarui dokumen status. Handoff ≤ 30 baris: selesai per langkah, yang jadi stub (institusi? scheduler?), keputusan sendiri, jawaban pertanyaan §7 v1.0 + §8 v1.1, dan skrip "tur Ruang Mesin 60 detik" untuk Offline Pitching (urutan: baris kesehatan → LLM-angka=0 → kill switch → Mode Dukungan yang terlihat pengguna).

## Batasan sesi ini
Dilarang: Adm-B (pendamping/pod, attest), Adm-C (billing, Metabase), membuat tabel institusi sendiri bila `0034` belum ada, kolom/endpoint rupiah per akun, edit-sebagai-pengguna, library chart/BI baru, push notification, akses NIK penuh (tidak akan pernah). Bahasa Indonesia; commit pola repo (`feat(admin): fondasi ruang mesin — peran, log, flags, demo reset (0035)`); satu commit per langkah logis; jangan menyatakan lulus tanpa menjalankan; env kurang → sebutkan yang terverifikasi dan yang belum.

Mulai dari Langkah 0.
