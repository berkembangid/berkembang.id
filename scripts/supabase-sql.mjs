/**
 * Menjalankan SQL di sebuah proyek Supabase lewat Management API.
 *
 * TARGETNYA WAJIB DISEBUT, DAN ITU SELURUH ALASAN BERKAS INI DITULIS ULANG.
 *
 * Versi sebelumnya membaca ref proyek dari `.mcp.json` -- satu nilai, tanpa
 * dikonfirmasi. Dengan satu proyek itu tidak berbahaya. Dengan demo dan
 * produksi berdampingan, ia menjadi jebakan: perintahnya sama persis untuk
 * kedua lingkungan, jadi refleks tangan setelah sepuluh kali memasang migrasi
 * ke produksi akan memasang yang kesebelas ke produksi juga -- betapa pun
 * niatnya demo.
 *
 * Sekarang tidak ada nilai bawaan. Tanpa `--target`, skrip ini berhenti.
 *
 * SATU SIFAT YANG MEMBUATNYA TIDAK BISA SALAH SASARAN.
 *
 * Ref proyek ada di dalam ALAMAT permintaannya
 * (`/v1/projects/<ref>/database/query`), bukan di dalam tokennya. Jadi token
 * yang salah tidak akan mengenai proyek yang salah -- ia hanya ditolak 403.
 * Satu-satunya cara mengenai proyek yang salah adalah menulis `--target` yang
 * salah, dan itu tertulis di baris perintah tempat mata bisa memeriksanya.
 *
 * TOKENNYA PER PROYEK, DAN ITU DIUJI BUKAN DIKIRA.
 *
 * Token Management API tidak selalu berlaku lintas proyek: token produksi
 * proyek ini menjawab 403 pada proyek demo. Karena itu tokennya dicari per
 * target, dan variabel lingkungan yang dipakai pun bernama per target --
 * `SUPABASE_ACCESS_TOKEN_DEMO`, bukan `SUPABASE_ACCESS_TOKEN`. Nama yang sama
 * untuk dua proyek adalah nama yang suatu hari menunjuk yang salah.
 *
 * Pemakaian:
 *   node scripts/supabase-sql.mjs --target demo berkas.sql
 *   node scripts/supabase-sql.mjs --target production -e "select 1"
 */
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

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
    `  node scripts/supabase-sql.mjs --target ${namaTarget.join("|")} berkas.sql`,
    "",
    "Perintah untuk demo dan produksi kalau tidak dibedakan akan terlihat sama",
    "persis -- dan yang membedakannya cuma ingatan orang yang mengetiknya.",
  );
}

const pilihan = TARGETS[target];
if (!pilihan) {
  berhenti(`--target "${target}" tidak dikenali. Yang sah: ${namaTarget.join(", ")}.`);
}

const [flag, value] = sisa;
if (!flag) berhenti('Berikan berkas .sql atau -e "SQL".');
const query = flag === "-e" ? value : readFileSync(flag, "utf8");
if (!query || !query.trim()) berhenti("SQL-nya kosong.");

// ---------------------------------------------------------------------------
// Token, dicari per target
// ---------------------------------------------------------------------------

function tokenDariBerkas(berkas) {
  if (!existsSync(berkas)) return "";
  const cocok = readFileSync(berkas, "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m);
  return (cocok ? cocok[1] : "").trim().replace(/^["']|["']$/g, "");
}

/**
 * `.mcp.json` hanya dipakai bila ref di dalamnya MEMANG target ini.
 *
 * Berkas itu menyimpan satu proyek saja. Memakainya untuk target lain berarti
 * memakai token proyek A untuk proyek B -- yang paling baik ditolak 403, dan
 * paling buruk berhasil kalau suatu hari tokennya diberi lingkup lebih luas.
 */
function tokenDariMcp() {
  if (!existsSync(".mcp.json")) return "";
  try {
    const server = JSON.parse(readFileSync(".mcp.json", "utf8")).mcpServers?.supabase;
    if (!server) return "";
    if (server.args?.at(-1) !== pilihan.ref) return "";
    return (server.env?.SUPABASE_ACCESS_TOKEN ?? "").trim();
  } catch {
    return "";
  }
}

const namaEnvTarget = `SUPABASE_ACCESS_TOKEN_${target.toUpperCase()}`;
const sumber = [
  [`variabel lingkungan ${namaEnvTarget}`, (process.env[namaEnvTarget] ?? "").trim()],
  [pilihan.envFile, tokenDariBerkas(pilihan.envFile)],
  [".mcp.json", tokenDariMcp()],
];

const ditemukan = sumber.find(([, nilai]) => nilai !== "");
if (!ditemukan) {
  berhenti(
    `Tidak ada token untuk target ${pilihan.label} (${pilihan.ref}).`,
    "",
    "Dicari pada, berurutan:",
    ...sumber.map(([nama]) => `  - ${nama}`),
    "",
    "Ambil token di https://supabase.com/dashboard/account/tokens lalu pakai salah satu:",
    "",
    `  $env:${namaEnvTarget}="sbp_..."     # sekali pakai, tidak menyentuh berkas apa pun`,
    `  # atau isi SUPABASE_ACCESS_TOKEN di ${pilihan.envFile}`,
    "",
    "Perhatikan: token proyek yang satu belum tentu berlaku pada proyek yang",
    "lain. Token produksi proyek ini menjawab 403 pada proyek demo.",
  );
}
const [namaSumber, token] = ditemukan;

// ---------------------------------------------------------------------------
// Jalan
// ---------------------------------------------------------------------------

console.error(`Target ${pilihan.label} · proyek ${pilihan.ref} · token dari ${namaSumber}.`);

const response = await fetch(`https://api.supabase.com/v1/projects/${pilihan.ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query }),
});

const text = await response.text();
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${text}`);
  if (response.status === 401 || response.status === 403) {
    console.error(
      [
        "",
        `Token dari ${namaSumber} tidak diterima proyek ${pilihan.ref} (${pilihan.label}).`,
        "",
        response.status === 403
          ? "403 berarti tokennya sah tetapi bukan untuk proyek ini. Token Management API"
            + "\ntidak selalu berlaku lintas proyek -- buat token terpisah untuk target ini."
          : "401 berarti tokennya kedaluwarsa, dicabut, atau dirotasi.",
        "",
        `  $env:${namaEnvTarget}="sbp_..."`,
        `  # atau perbarui SUPABASE_ACCESS_TOKEN di ${pilihan.envFile}`,
        "",
        "Tanpa Management API, SQL-nya tetap bisa dijalankan lewat SQL Editor di",
        `dashboard proyek ${pilihan.ref} -- salin isi berkas migrasinya apa adanya.`,
      ].join("\n"),
    );
  }
  process.exit(1);
}
console.log(text);
