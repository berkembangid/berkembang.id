/**
 * Menulis templat surel ke berkas, dan bila diminta, mendorongnya ke Supabase.
 *
 *   node scripts/push-email-templates.mjs           -- hanya menulis berkas
 *   node scripts/push-email-templates.mjs --push    -- sekaligus mendorong
 *
 * Berkas HTML-nya ditulis ke `supabase/email-templates/` supaya bisa dibuka di
 * peramban, diperiksa, atau ditempel manual ke dasbor. Mendorong lewat
 * Management API mengubah proyek produksi, jadi ia harus diminta secara
 * eksplisit -- bukan efek samping dari membangun berkas.
 *
 * `--push` juga menyalakan verifikasi surel (`mailer_autoconfirm=false`) dan
 * menyetel panjang serta masa berlaku kode, karena templat berisi
 * `{{ .Token }}` tidak ada gunanya selama pendaftaran masih dikonfirmasi
 * otomatis.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { OTP_EXPIRY_SECONDS, OTP_LENGTH, templates } from "./email-templates.mjs";

const outputDirectory = path.join(process.cwd(), "supabase", "email-templates");
mkdirSync(outputDirectory, { recursive: true });

for (const [name, template] of Object.entries(templates)) {
  const file = path.join(outputDirectory, `${name}.html`);
  writeFileSync(file, template.html, "utf8");
  const size = (template.html.length / 1024).toFixed(1);
  console.log(`  ${name.padEnd(14)} ${size} KB  subjek: ${template.subject}`);
}
console.log(`\nDitulis ke ${path.relative(process.cwd(), outputDirectory)}`);

if (!process.argv.includes("--push")) {
  console.log("Jalankan ulang dengan --push untuk mendorongnya ke proyek Supabase.");
  process.exit(0);
}

const config = JSON.parse(readFileSync(".mcp.json", "utf8"));
const server = config.mcpServers?.supabase;
if (!server) throw new Error("Konfigurasi server supabase tidak ada di .mcp.json.");

const endpoint = `https://api.supabase.com/v1/projects/${server.args.at(-1)}/config/auth`;
const authHeaders = {
  authorization: `Bearer ${server.env.SUPABASE_ACCESS_TOKEN}`,
  "content-type": "application/json",
};

async function patch(payload, label) {
  const response = await fetch(endpoint, { method: "PATCH", headers: authHeaders, body: JSON.stringify(payload) });
  if (!response.ok) {
    console.error(`\nGagal ${label} — HTTP ${response.status}`);
    console.error(await response.text());
    process.exit(1);
  }
}

const current = await fetch(endpoint, { headers: authHeaders });
if (!current.ok) {
  console.error(`HTTP ${current.status}: ${await current.text()}`);
  process.exit(1);
}
const auth = await current.json();

/**
 * SMTP sendiri adalah prasyarat, bukan saran.
 *
 * Dua hal terjadi tanpanya, dan yang kedua jauh lebih buruk daripada yang
 * pertama:
 *
 *   1. Supabase menolak penyuntingan templat pada paket gratis yang masih
 *      memakai pengirim bawaannya. Kode tidak akan pernah masuk ke surel.
 *   2. Mematikan `mailer_autoconfirm` tetap berhasil. Artinya pendaftaran
 *      mulai menuntut kode, sementara pengirim bawaan hanya melayani anggota
 *      tim proyek dan dibatasi dua surel per jam. Pendaftaran akan tertutup
 *      untuk semua orang, dan tidak ada satu pun galat yang menyebutkan
 *      sebabnya.
 *
 * Jadi urutannya ditegakkan di sini: tanpa SMTP, yang didorong hanya setelan
 * yang aman berdiri sendiri, dan verifikasi dibiarkan mati.
 */
if (!auth.smtp_host) {
  // Panjang kata sandi tidak bergantung pada surel sama sekali, dan
  // membiarkannya 6 sementara antarmuka menjanjikan 8 adalah janji yang tidak
  // ditegakkan siapa pun.
  if (auth.password_min_length !== 8) {
    await patch({ password_min_length: 8 }, "menyetel panjang kata sandi");
    console.log("\nDisetel: kata sandi minimal 8 karakter, sesuai janji antarmuka.");
  }

  console.log(`
BERHENTI — templat surel belum bisa didorong.

Supabase menolak penyuntingan templat pada paket gratis yang masih memakai
pengirim bawaannya. Verifikasi surel SENGAJA tidak dinyalakan, karena
menyalakannya sekarang justru menutup pendaftaran untuk semua orang:
pengirim bawaan hanya melayani anggota tim proyek dan dibatasi
${auth.rate_limit_email_sent} surel per jam.

Pasang SMTP sendiri lebih dulu, di Dashboard -> Authentication -> Emails ->
SMTP Settings. Paket gratis yang lazim untuk volume awal:

  Resend   3.000 surel/bulan   resend.com
  Brevo    300 surel/hari      brevo.com
  Mailgun  100 surel/hari      mailgun.com

Ketiganya menuntut verifikasi domain pengirim. Untuk mencoba lebih dulu,
Resend menyediakan domain uji yang hanya bisa mengirim ke alamat Anda sendiri.

Sesudah SMTP terisi, jalankan perintah ini lagi.`);
  process.exit(1);
}

const payload = {
  // Tanpa ini, Supabase menganggap setiap surel langsung sah dan tidak pernah
  // mengirim kode apa pun.
  mailer_autoconfirm: false,
  mailer_otp_length: OTP_LENGTH,
  mailer_otp_exp: OTP_EXPIRY_SECONDS,
  // Antarmuka menuntut minimal 8 karakter; server yang menerima 6 membuat
  // janji itu tidak berarti.
  password_min_length: 8,
};
for (const [name, template] of Object.entries(templates)) {
  payload[`mailer_subjects_${name}`] = template.subject;
  payload[`mailer_templates_${name}_content`] = template.html;
}

await patch(payload, "mendorong templat");

console.log(`\nTerdorong lewat ${auth.smtp_host}: lima templat, verifikasi surel menyala,`);
console.log(`kode ${OTP_LENGTH} angka berlaku ${OTP_EXPIRY_SECONDS / 60} menit, kata sandi minimal 8 karakter.`);
console.log("\nPeriksa hasilnya dengan: node scripts/supabase-auth-config.mjs");
