/**
 * Menyetel alamat yang boleh dituju setelah masuk lewat Google.
 *
 *   node scripts/setup-oauth-urls.mjs --target demo https://demo.berkembang.id
 *   node scripts/setup-oauth-urls.mjs --target production https://www.berkembang.id
 *   node scripts/setup-oauth-urls.mjs --target demo          -- lokal saja
 *
 * KENAPA INI PERLU.
 *
 * Alur OAuth mengembalikan orang ke `redirectTo` yang diminta aplikasi. Supabase
 * menolak alamat yang tidak ada di daftar izin -- dan itu benar: tanpa daftar
 * itu, siapa pun bisa memulai alur masuk yang mengembalikan sesi ke alamatnya
 * sendiri.
 *
 * `site_url` bukan hal yang sama. Ia alamat bawaan ketika `redirectTo` yang
 * diminta TIDAK ada di daftar izin, dan ia juga yang mengisi `{{ .SiteURL }}`
 * di dalam surel.
 *
 * ALAMATNYA HARUS HOST YANG BENAR-BENAR MELAYANI APLIKASI.
 *
 * Ini pernah salah di produksi dan akibatnya sulit dilaporkan orang: daftar
 * izinnya menyebut `berkembang.id` sementara aplikasinya dilayani
 * `www.berkembang.id`. Google mengembalikan orang ke `redirectTo` yang tidak
 * cocok, Supabase memantulkannya ke `site_url`, dan orangnya mendarat di
 * halaman depan -- sudah menekan izin, belum masuk, tanpa satu pun petunjuk.
 *
 * Periksa dengan `curl -I https://domain-anda/` dan pakai host yang menjawab
 * 200, bukan yang menjawab 301/308.
 *
 * TARGETNYA WAJIB DISEBUT.
 *
 * Skrip ini dulu membaca ref proyek dari `.mcp.json` -- satu nilai, tanpa
 * dikonfirmasi. Dengan demo dan produksi berdampingan, itu berarti menyetel
 * daftar izin produksi sambil mengira sedang menyetel demo. Sekarang tidak ada
 * nilai bawaan.
 */
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const LOCAL = "http://localhost:3000";

const projects = JSON.parse(readFileSync("config/supabase-projects.json", "utf8"));
const TARGETS = projects.targets;
const namaTarget = Object.keys(TARGETS);

function berhenti(...baris) {
  console.error(baris.join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let target = null;
const sisa = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--target") {
    target = argv[i + 1] ?? null;
    i += 1;
  } else if (argv[i].startsWith("--target=")) {
    target = argv[i].slice("--target=".length);
  } else {
    sisa.push(argv[i]);
  }
}

if (!target) {
  berhenti(
    "--target wajib disebut. Tidak ada nilai bawaan, dan itu disengaja.",
    "",
    `  node scripts/setup-oauth-urls.mjs --target ${namaTarget.join("|")} https://alamat-anda`,
    "",
    "Tanpa ini, daftar izin produksi bisa disetel sambil mengira sedang",
    "menyetel demo -- dan akibatnya baru terasa saat ada orang gagal masuk.",
  );
}

const pilihan = TARGETS[target];
if (!pilihan) berhenti(`--target "${target}" tidak dikenali. Yang sah: ${namaTarget.join(", ")}.`);

const alamat = sisa[0];
if (alamat && !/^https:\/\/[^/]+$/.test(alamat)) {
  berhenti("Alamatnya harus berbentuk https://domain-anda.com, tanpa garis miring di ujung.");
}

// ---------------------------------------------------------------------------
// Token, per target
// ---------------------------------------------------------------------------

function tokenDariBerkas(berkas) {
  if (!existsSync(berkas)) return "";
  const cocok = readFileSync(berkas, "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m);
  return (cocok ? cocok[1] : "").trim().replace(/^["']|["']$/g, "");
}

const namaEnvTarget = `SUPABASE_ACCESS_TOKEN_${target.toUpperCase()}`;
const token = (process.env[namaEnvTarget] ?? "").trim() || tokenDariBerkas(pilihan.envFile);
if (!token) {
  berhenti(
    `Tidak ada token untuk target ${pilihan.label} (${pilihan.ref}).`,
    "",
    `  $env:${namaEnvTarget}="sbp_..."`,
    `  # atau isi SUPABASE_ACCESS_TOKEN di ${pilihan.envFile}`,
    "",
    "Token satu proyek belum tentu berlaku pada proyek yang lain.",
  );
}

// ---------------------------------------------------------------------------
// Jalan
// ---------------------------------------------------------------------------

const endpoint = `https://api.supabase.com/v1/projects/${pilihan.ref}/config/auth`;
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

console.error(`Target ${pilihan.label} · proyek ${pilihan.ref}.`);

const current = await fetch(endpoint, { headers });
if (!current.ok) berhenti(`HTTP ${current.status}: ${await current.text()}`);
const auth = await current.json();

// Alamat yang sudah ada dipertahankan: daftar ini mungkin memuat alamat
// pratinjau atau lingkungan lain yang tidak diketahui skrip ini.
const existing = (auth.uri_allow_list ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
const wanted = [`${LOCAL}/**`, ...(alamat ? [`${alamat}/**`] : [])];
const allowList = [...new Set([...existing, ...wanted])];

const payload = { uri_allow_list: allowList.join(",") };
// `site_url` hanya disentuh bila alamatnya diberikan. Menggantinya dengan
// tebakan akan memutus tautan di setiap surel yang dikirim sesudahnya.
if (alamat) payload.site_url = alamat;

const response = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(payload) });
if (!response.ok) berhenti(`HTTP ${response.status}: ${await response.text()}`);

console.log("Daftar alamat yang diizinkan:");
for (const entry of allowList) console.log(`  ${entry}`);
console.log(`\nsite_url: ${payload.site_url ?? `${auth.site_url} (tidak diubah)`}`);

if (!alamat) {
  console.log(`
Alamat ${pilihan.label} belum disetel. Ketika domainnya sudah ada, jalankan:

  node scripts/setup-oauth-urls.mjs --target ${target} https://alamat-anda

Selama site_url masih menunjuk ke localhost, setiap tautan di dalam surel yang
diterima pengguna sungguhan akan menuju komputer mereka sendiri.`);
}

console.log(`
Sisi Google: satu-satunya alamat yang perlu didaftarkan di Google Cloud adalah
milik Supabase, bukan milik aplikasi ini. Untuk proyek ${pilihan.label}:

  https://${pilihan.ref}.supabase.co/auth/v1/callback

Kedua proyek punya alamat ini masing-masing, jadi keduanya harus terdaftar --
atau demo dan produksi memakai OAuth client Google yang berbeda.`);
