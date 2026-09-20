#!/usr/bin/env node
/**
 * Memicu evaluasi tingkat kesiapan untuk seluruh akun UMKM demo.
 *
 * KENAPA INI PERLU ADA.
 *
 * `business_readiness_state` hanya terisi ketika tingkat kesiapan DIBACA --
 * `save_readiness_snapshot` dipanggil dari `getReadinessLevel()`. Sebelum
 * pemiliknya membuka Perjalanan sekali pun, barisnya tidak ada.
 *
 * Itu jadi masalah karena tabel yang sama dibaca
 * `list_anonymous_business_candidates`: portal dinas dan investor menampilkan
 * tingkat kesiapan dari sana. Usaha yang pemiliknya belum pernah membuka
 * Perjalanan akan muncul di daftar kandidat tanpa tingkat -- atau, lebih
 * buruk, dengan tingkat basi.
 *
 * Seeder dulu "menyelesaikan" ini dengan menulis levelnya langsung dari label
 * di daftar profilnya. Itu membuat dua layar menyebut angka berbeda untuk
 * usaha yang sama. Sekarang seeder tidak menulis apa pun, dan skrip ini yang
 * membuat angkanya ada -- lewat jalur yang sama persis dengan pemilik
 * sungguhan yang membuka halamannya.
 *
 * HANYA DEMO. Ia masuk sebagai 40+ akun memakai kata sandi seeder, jadi ia
 * menolak berjalan di luar proyek demo, dengan pola yang sama seperti
 * `seed-40-umkm.mjs` dan `verify-portal-security.mjs`.
 *
 * Pemakaian:
 *   node scripts/refresh-readiness.mjs [alamat-aplikasi]
 *
 * Alamat bawaannya http://127.0.0.1:3094 -- aplikasi yang dibangun dengan
 * `.env.demo`. Ia harus sudah berjalan: evaluasinya ada di TypeScript, bukan
 * di basis data, jadi tidak bisa dipicu dari SQL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const projects = JSON.parse(readFileSync(path.resolve("config/supabase-projects.json"), "utf8"));
const DEMO = projects.targets.demo;

function berhenti(...baris) {
  console.error(baris.join("\n"));
  process.exit(1);
}

let berkasEnv = "";
try {
  berkasEnv = readFileSync(path.resolve(DEMO.envFile), "utf8");
} catch {
  berhenti(`${DEMO.envFile} tidak terbaca. Skrip ini hanya berjalan di proyek ${DEMO.label}.`);
}

const ambil = (kunci) => {
  const cocok = berkasEnv.match(new RegExp("^" + kunci + "=(.*)$", "m"));
  return (cocok ? cocok[1] : "").trim().replace(/^["']|["']$/g, "");
};

const URL_SUPABASE = ambil("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const ANON = ambil("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = ambil("SUPABASE_SERVICE_ROLE_KEY");

if (!URL_SUPABASE || !ANON || !SERVICE) {
  berhenti(`${DEMO.envFile} belum memuat NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY.`);
}

const ref = URL_SUPABASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";
if (ref !== DEMO.ref) {
  berhenti(
    `MENOLAK BERJALAN: ${DEMO.envFile} menunjuk proyek "${ref}", bukan proyek ${DEMO.label} (${DEMO.ref}).`,
    "",
    "Skrip ini masuk sebagai puluhan akun memakai kata sandi seeder.",
  );
}

const APLIKASI = (process.argv[2] ?? "http://127.0.0.1:3094").replace(/\/$/, "");
const SANDI_SEED = "PasswordBerkembang2026!";
const SANDI_PERSONA = "Demo-Berkembang-2026";

console.log(`Sasaran: proyek ${DEMO.label} (${ref}) lewat ${APLIKASI}\n`);

const svc = (jalur) =>
  fetch(`${URL_SUPABASE}/rest/v1/${jalur}`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  }).then((r) => r.json());

/** Kuki sesi Supabase, dipotong seperti yang dilakukan peramban. */
function kukiDari(sesi) {
  const b64 = "base64-" + Buffer.from(JSON.stringify(sesi), "utf8").toString("base64");
  const nama = `sb-${ref}-auth-token`;
  const potong =
    b64.length <= 3180
      ? [[nama, b64]]
      : Array.from({ length: Math.ceil(b64.length / 3180) }, (_, i) => [
          `${nama}.${i}`,
          b64.slice(i * 3180, (i + 1) * 3180),
        ]);
  return potong.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
}

const profil = await svc("profiles?select=email&role=eq.umkm&order=email");
const daftar = (Array.isArray(profil) ? profil : [])
  .map((row) => row.email)
  .filter((email) => typeof email === "string" && email.endsWith("@berkembang.id"));

if (daftar.length === 0) berhenti("Tidak ada akun UMKM di proyek demo. Jalankan seeder lebih dulu.");

let berhasil = 0;
const gagal = [];
const tingkat = {};

for (const email of daftar) {
  const sandi = email.startsWith("umkm.seed") ? SANDI_SEED : SANDI_PERSONA;

  /**
   * Dicoba beberapa kali dengan jeda yang memanjang.
   *
   * Supabase membatasi laju autentikasi. Masuk sebagai 40 akun berturut-turut
   * menabraknya sekitar akun ke-35, dan penolakannya terlihat persis seperti
   * kata sandi yang salah -- percobaan pertama skrip ini melaporkan enam akun
   * "tidak bisa masuk" padahal keenamnya berhasil begitu diberi jeda.
   * Melaporkan batas laju sebagai kredensial salah mengirim orang mencari
   * masalah yang tidak ada.
   */
  let sesi = null;
  for (let percobaan = 1; percobaan <= 4; percobaan += 1) {
    const jawab = await fetch(`${URL_SUPABASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, password: sandi }),
    });
    const isi = await jawab.json();
    if (isi.access_token) {
      sesi = isi;
      break;
    }
    if (percobaan < 4) await new Promise((r) => setTimeout(r, percobaan * 4000));
  }

  if (!sesi) {
    gagal.push(`${email}: tidak bisa masuk sesudah 4 percobaan`);
    continue;
  }

  const r = await fetch(`${APLIKASI}/api/v1/readiness`, { headers: { cookie: kukiDari(sesi) } });
  if (!r.ok) {
    gagal.push(`${email}: HTTP ${r.status}`);
    continue;
  }

  const body = await r.json();
  const level = (body.data ?? body)?.level ?? "?";
  tingkat[level] = (tingkat[level] ?? 0) + 1;
  berhasil += 1;
  process.stdout.write(`\r  ${berhasil}/${daftar.length} dievaluasi`);
}

console.log(`\n\nTingkat kesiapan yang DIHITUNG (bukan label):`);
for (const [level, jumlah] of Object.entries(tingkat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(jumlah).padStart(3)}  ${level}`);
}

if (gagal.length > 0) {
  console.log(`\n${gagal.length} gagal:`);
  for (const baris of gagal.slice(0, 10)) console.log(`  ${baris}`);
  process.exit(1);
}

console.log(`\nSelesai. ${berhasil} usaha kini punya tingkat kesiapan hasil evaluasi.`);
