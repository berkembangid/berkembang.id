/**
 * Batas antar-portal, diperiksa dari luar seperti penyerang memeriksanya.
 *
 *   npm run check:security
 *
 * KENAPA INI ADA, PADAHAL SUDAH ADA `db:test`.
 *
 * `db:test` menjalankan SQL sebagai peran basis data. Skrip ini memanggil
 * REST API Supabase dengan token sungguhan dari akun sungguhan -- jalur yang
 * sama persis dengan yang dipakai siapa pun yang membuka alat pengembang di
 * peramban. Yang diuji bukan "apakah layarnya menyembunyikan tombol",
 * melainkan apakah basis datanya menolak ketika layarnya dilewati sama sekali.
 *
 * Tiga hal yang dijawabnya, dan ketiganya pernah menjadi lubang di produk
 * lain:
 *
 *   1. Bisakah seseorang menaikkan perannya sendiri sesudah mendaftar?
 *      Metadata pendaftaran dikendalikan pendaftar, dan `profiles` punya hak
 *      UPDATE langsung. Yang menahannya trigger `protect_profile_authority`,
 *      bukan kebijakan RLS -- RLS tidak bisa membatasi KOLOM.
 *
 *   2. Bisakah pemilik usaha atau investor memanggil permukaan dinas dan
 *      admin? Layarnya tidak menampilkannya, tetapi RPC-nya terbuka bagi
 *      siapa pun yang tahu namanya.
 *
 *   3. Bisakah tabel paling sensitif dibaca? Yang paling berbahaya
 *      `password_reset_tokens`: `token_hash` adalah SHA-256 atas OTP enam
 *      digit -- 900.000 kemungkinan, habis ditebak dalam hitungan detik di
 *      komputer siapa pun. Kalau baris itu bisa dibaca, pengambilalihan akun
 *      hanya soal waktu.
 *
 * CARA MEMBACANYA, DAN SATU JEBAKAN.
 *
 * `HTTP 200 []` pada basis data KOSONG tidak membuktikan apa pun: bisa berarti
 * RLS menyaring, bisa berarti tabelnya memang kosong. Karena itu skrip ini
 * MENARUH baris sungguhan lebih dulu lewat service role, baru mencoba
 * membacanya. Tanpa langkah itu, seluruh bagian ketiga akan "lulus" pada basis
 * data yang tidak berisi apa pun.
 *
 * HANYA DEMO.
 *
 * Skrip ini membuat dan menghapus akun. Ia menolak berjalan di luar proyek
 * demo, dan penolakan itu tidak bisa dilewati lewat argumen.
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

const projects = JSON.parse(readFileSync(path.resolve("config/supabase-projects.json"), "utf8"));
const DEMO = projects.targets.demo;

function berhenti(...baris) {
  console.error(baris.join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env, dan penjaga sasaran
// ---------------------------------------------------------------------------

let env = "";
try {
  env = readFileSync(path.resolve(DEMO.envFile), "utf8");
} catch {
  berhenti(`${DEMO.envFile} tidak terbaca. Skrip ini hanya berjalan di proyek ${DEMO.label}.`);
}

const ambil = (kunci) => {
  const cocok = env.match(new RegExp("^" + kunci + "=(.*)$", "m"));
  return (cocok ? cocok[1] : "").trim().replace(/^["']|["']$/g, "");
};

const URL_BASE = ambil("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const ANON = ambil("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = ambil("SUPABASE_SERVICE_ROLE_KEY");

if (!URL_BASE || !ANON || !SERVICE) {
  berhenti(`${DEMO.envFile} belum memuat NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY.`);
}

const ref = URL_BASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";
if (ref !== DEMO.ref) {
  berhenti(
    `MENOLAK BERJALAN: ${DEMO.envFile} menunjuk proyek "${ref}", bukan proyek ${DEMO.label} (${DEMO.ref}).`,
    "",
    "Skrip ini membuat lalu menghapus akun, dan menyisipkan baris ke tabel token",
    "pemulihan sandi. Dijalankan di produksi, ia menyentuh data orang sungguhan.",
  );
}

// ---------------------------------------------------------------------------
// Perkakas
// ---------------------------------------------------------------------------

const hasil = [];
function catat(nama, aman, detail) {
  hasil.push({ nama, aman });
  console.log(`${aman ? "  AMAN  " : "  BOCOR "} ${nama}`);
  console.log(`          ${detail}`);
}

const HS = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
const H = (token) => ({ apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" });

const SANDI = "Sandi-Uji-Yang-Panjang-123";
const dibuat = [];

async function buatAkun(peran, metadata = {}) {
  const email = `uji-${peran}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@contoh.invalid`;
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: HS,
    body: JSON.stringify({ email, password: SANDI, email_confirm: true, user_metadata: { signup_account_type: peran, ...metadata } }),
  });
  const pengguna = await r.json();
  if (!pengguna.id) berhenti(`Gagal membuat akun uji: ${JSON.stringify(pengguna).slice(0, 200)}`);
  dibuat.push(pengguna.id);

  await fetch(`${URL_BASE}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...HS, prefer: "return=minimal" },
    body: JSON.stringify({ id: pengguna.id, auth_user_id: pengguna.id, email, role: peran, name: `Uji ${peran}`, status: "active" }),
  });

  const masuk = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: SANDI }),
  });
  const sesi = await masuk.json();
  if (!sesi.access_token) berhenti(`Gagal masuk sebagai akun uji: ${JSON.stringify(sesi).slice(0, 200)}`);
  return { id: pengguna.id, email, token: sesi.access_token };
}

async function rpc(nama, token, args = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nama}`, { method: "POST", headers: H(token), body: JSON.stringify(args) });
  const teks = await r.text();
  let json = null;
  try { json = JSON.parse(teks); } catch { /* bukan json */ }
  return { status: r.status, json, pesan: json?.message ?? teks.slice(0, 110) };
}

async function baca(tabel, kueri, token) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabel}?${kueri}`, { headers: H(token) });
  const teks = await r.text();
  let baris = [];
  try { baris = JSON.parse(teks); } catch { /* bukan json */ }
  return { status: r.status, jumlah: Array.isArray(baris) ? baris.length : 0, teks };
}

console.log(`Proyek ${DEMO.label} (${DEMO.ref}).\n`);

const umkm = await buatAkun("umkm", { nama_usaha: "Warung Uji Keamanan", lokasi: "Kota Depok" });
const investor = await buatAkun("investor");

// ---------------------------------------------------------------------------
// 1. Peran tidak bisa dinaikkan sendiri
// ---------------------------------------------------------------------------
console.log("1. Peran dan kewenangan tidak bisa diberikan pada diri sendiri\n");

for (const peran of ["admin", "institution", "investor"]) {
  await fetch(`${URL_BASE}/rest/v1/profiles?id=eq.${umkm.id}`, {
    method: "PATCH", headers: { ...H(umkm.token), prefer: "return=minimal" }, body: JSON.stringify({ role: peran }),
  });
  const cek = await fetch(`${URL_BASE}/rest/v1/profiles?id=eq.${umkm.id}&select=role`, { headers: H(umkm.token) });
  const sekarang = (await cek.json())?.[0]?.role;
  catat(`peran tidak bisa dinaikkan ke "${peran}"`, sekarang === "umkm", `peran sesudah percobaan: ${JSON.stringify(sekarang)}`);
}

await fetch(`${URL_BASE}/rest/v1/profiles?id=eq.${umkm.id}`, {
  method: "PATCH", headers: { ...H(umkm.token), prefer: "return=minimal" }, body: JSON.stringify({ status: "suspended", readiness_score: 99 }),
});
const profilSesudah = await (await fetch(`${URL_BASE}/rest/v1/profiles?id=eq.${umkm.id}&select=status,readiness_score`, { headers: H(umkm.token) })).json();
catat(
  "status dan skor kesiapan tidak bisa ditulis sendiri",
  profilSesudah?.[0]?.status === "active" && profilSesudah?.[0]?.readiness_score === 0,
  `status=${profilSesudah?.[0]?.status} skor=${profilSesudah?.[0]?.readiness_score}`,
);

for (const [tabel, muatan] of [
  ["platform_admins", { user_id: umkm.id, status: "active" }],
  ["admin_roles", { user_id: umkm.id, role: "SUPER_ADMIN" }],
  ["institution_entitlements", { institution_id: umkm.id, region_wide_visibility: true, can_see_affiliated_identity: true }],
]) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabel}`, { method: "POST", headers: H(umkm.token), body: JSON.stringify(muatan) });
  const teks = await r.text();
  catat(`tidak bisa menyisipkan diri ke ${tabel}`, r.status >= 400, `HTTP ${r.status} ${teks.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------
// 2. Permukaan dinas dan admin tertutup bagi peran lain
// ---------------------------------------------------------------------------
console.log("\n2. Permukaan dinas dan admin tertutup bagi peran lain\n");

const dinasOnly = [
  ["dinas_region_summary", {}],
  ["dinas_region_drilldown", { p_recording_band: "Rutin mencatat", p_legal_complete: true }],
  ["dinas_broadcast_audience", { p_recording_band: "Rutin mencatat", p_legal_complete: true }],
  ["request_dinas_broadcast", { p_message: "uji keamanan yang cukup panjang untuk lolos validasi", p_recording_band: "Rutin mencatat", p_legal_complete: true, p_event_date: null, p_event_place: null, p_event_link: null }],
  ["list_institution_broadcasts", {}],
];

for (const [nama, args] of dinasOnly) {
  for (const [siapa, tok] of [["UMKM", umkm.token], ["investor", investor.token]]) {
    const r = await rpc(nama, tok, args);
    const kosong = Array.isArray(r.json) && r.json.length === 0;
    catat(`${nama} ditolak untuk ${siapa}`, r.status >= 400 || kosong, `HTTP ${r.status} ${kosong ? "(daftar kosong)" : r.pesan}`);
  }
}

for (const [nama, args] of [
  ["admin_pending_broadcasts", {}],
  ["admin_set_institution_authority", { p_institution_id: umkm.id, p_region_wide: true, p_can_see_identity: true, p_min_level: null, p_reason: "percobaan eskalasi dari akun biasa", p_broadcast_quota: 10 }],
  ["admin_institution_authority", { p_institution_id: umkm.id }],
]) {
  const r = await rpc(nama, umkm.token, args);
  catat(`${nama} ditolak untuk UMKM`, r.status >= 400, `HTTP ${r.status} ${r.pesan}`);
}

const tawaran = await rpc("my_dinas_offer", investor.token);
catat(
  "my_dinas_offer tidak memberi apa pun ke investor",
  tawaran.status >= 400 || tawaran.json === null || tawaran.json?.show === false,
  `HTTP ${tawaran.status} ${JSON.stringify(tawaran.json).slice(0, 80)}`,
);

// ---------------------------------------------------------------------------
// 3. Tabel sensitif tidak terbaca -- dengan baris yang MEMANG ADA
// ---------------------------------------------------------------------------
console.log("\n3. Tabel sensitif tidak terbaca (barisnya ditaruh dulu, bukan tabel kosong)\n");

const korban = await buatAkun("umkm");
const penanda = randomUUID();
await fetch(`${URL_BASE}/rest/v1/password_reset_tokens`, {
  method: "POST", headers: { ...HS, prefer: "return=minimal" },
  body: JSON.stringify({
    user_id: korban.id,
    email: korban.email,
    token_hash: createHash("sha256").update("424242").digest("hex"),
    reset_session_token: penanda,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }),
});
await fetch(`${URL_BASE}/rest/v1/admin_roles`, {
  method: "POST", headers: { ...HS, prefer: "return=minimal" },
  body: JSON.stringify({ user_id: korban.id, role: "SUPER_ADMIN" }),
});

// Dibuktikan lebih dulu: barisnya benar-benar ada. Tanpa ini, seluruh bagian
// ini bisa "lulus" hanya karena penyisipannya gagal tanpa suara.
const adaToken = await baca("password_reset_tokens", `select=id&reset_session_token=eq.${penanda}`, SERVICE);
const adaPeran = await baca("admin_roles", `select=user_id&user_id=eq.${korban.id}`, SERVICE);
catat(
  "barisnya memang ada (prasyarat uji ini)",
  adaToken.jumlah === 1 && adaPeran.jumlah === 1,
  `token pemulihan: ${adaToken.jumlah} baris, peran admin: ${adaPeran.jumlah} baris`,
);

for (const [siapa, tok] of [["anon", ANON], ["pengguna lain", umkm.token]]) {
  for (const [nama, tabel, kueri] of [
    ["token pemulihan sandi", "password_reset_tokens", "select=token_hash,email,reset_session_token"],
    ["daftar peran admin", "admin_roles", "select=user_id,role"],
    ["kewenangan lembaga", "institution_entitlements", "select=*"],
    ["sesi pendampingan", "support_sessions", "select=*"],
    ["profil orang lain", "profiles", `select=email,role&id=eq.${korban.id}`],
  ]) {
    const r = await baca(tabel, kueri, tok);
    catat(`${nama} tidak terbaca oleh ${siapa}`, r.status >= 400 || r.jumlah === 0, `HTTP ${r.status}, ${r.jumlah} baris${r.jumlah ? ": " + r.teks.slice(0, 80) : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Bersihkan
// ---------------------------------------------------------------------------

await fetch(`${URL_BASE}/rest/v1/password_reset_tokens?reset_session_token=eq.${penanda}`, { method: "DELETE", headers: HS });
await fetch(`${URL_BASE}/rest/v1/admin_roles?user_id=eq.${korban.id}`, { method: "DELETE", headers: HS });
for (const id of dibuat) {
  await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
}

const bocor = hasil.filter((h) => !h.aman);
console.log(`\n${hasil.length - bocor.length}/${hasil.length} pemeriksaan aman.`);
if (bocor.length > 0) {
  console.log("\nYANG BOCOR:");
  for (const b of bocor) console.log(`  - ${b.nama}`);
  process.exit(1);
}
console.log("Batas antar-portal utuh.");
