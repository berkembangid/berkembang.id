/**
 * Menyetel alamat yang boleh dituju setelah masuk lewat Google.
 *
 *   node scripts/setup-oauth-urls.mjs                          -- lokal saja
 *   node scripts/setup-oauth-urls.mjs https://domain-anda.com  -- lokal + produksi
 *
 * KENAPA INI PERLU.
 *
 * Alur OAuth mengembalikan orang ke `redirectTo` yang diminta aplikasi. Supabase
 * menolak alamat yang tidak ada di daftar izin -- dan itu benar: tanpa daftar
 * itu, siapa pun bisa memulai alur masuk yang mengembalikan sesi ke alamatnya
 * sendiri. Daftar proyek ini masih kosong, jadi `/auth/callback` akan ditolak
 * sebelum sempat menukar kodenya.
 *
 * `site_url` bukan hal yang sama. Ia alamat bawaan ketika tidak ada `redirectTo`
 * yang diminta, dan ia juga yang mengisi `{{ .SiteURL }}` di dalam surel. Selama
 * ia masih menunjuk ke localhost, setiap tautan di surel yang diterima pengguna
 * sungguhan menuju komputer mereka sendiri.
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const LOCAL = "http://localhost:3000";
const production = process.argv[2];

if (production && !/^https:\/\/[^/]+$/.test(production)) {
  console.error("Alamat produksi harus berbentuk https://domain-anda.com, tanpa garis miring di ujung.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(".mcp.json", "utf8"));
const server = config.mcpServers?.supabase;
if (!server) throw new Error("Konfigurasi server supabase tidak ada di .mcp.json.");

const endpoint = `https://api.supabase.com/v1/projects/${server.args.at(-1)}/config/auth`;
const headers = {
  authorization: `Bearer ${server.env.SUPABASE_ACCESS_TOKEN}`,
  "content-type": "application/json",
};

const current = await fetch(endpoint, { headers });
if (!current.ok) {
  console.error(`HTTP ${current.status}: ${await current.text()}`);
  process.exit(1);
}
const auth = await current.json();

// Alamat yang sudah ada dipertahankan: daftar ini mungkin memuat alamat
// pratinjau atau lingkungan lain yang tidak diketahui skrip ini.
const existing = (auth.uri_allow_list ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
const wanted = [
  `${LOCAL}/**`,
  ...(production ? [`${production}/**`] : []),
];
const allowList = [...new Set([...existing, ...wanted])];

const payload = { uri_allow_list: allowList.join(",") };
// `site_url` hanya disentuh bila alamat produksinya diberikan. Menggantinya
// dengan tebakan akan memutus tautan di setiap surel yang dikirim sesudahnya.
if (production) payload.site_url = production;

const response = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(payload) });
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

console.log("Daftar alamat yang diizinkan:");
for (const entry of allowList) console.log(`  ${entry}`);
console.log(`\nsite_url: ${payload.site_url ?? `${auth.site_url} (tidak diubah)`}`);

if (!production) {
  console.log(`
Alamat produksi belum disetel. Ketika sudah ada, jalankan:

  node scripts/setup-oauth-urls.mjs https://domain-anda.com

Selama site_url masih menunjuk ke localhost, setiap tautan di dalam surel yang
diterima pengguna sungguhan akan menuju komputer mereka sendiri.`);
}

console.log(`
Jangan lupa sisi Google: satu-satunya alamat yang perlu didaftarkan di
Google Cloud adalah milik Supabase, bukan milik aplikasi ini:

  https://${server.args.at(-1)}.supabase.co/auth/v1/callback`);
