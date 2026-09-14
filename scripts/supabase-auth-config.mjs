/**
 * Membaca konfigurasi autentikasi proyek Supabase.
 *
 * Hanya membaca. Token diambil dari `.mcp.json` -- berkas yang sudah ada dan
 * tidak pernah ikut ke git -- supaya ia tidak muncul di baris perintah maupun
 * riwayat shell. Nilai rahasia (kata sandi SMTP, rahasia klien OAuth) tidak
 * pernah dicetak; yang dilaporkan hanya ada atau tidaknya.
 *
 * Pemakaian: node scripts/supabase-auth-config.mjs
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const config = JSON.parse(readFileSync(".mcp.json", "utf8"));
const server = config.mcpServers?.supabase;
if (!server) throw new Error("Konfigurasi server supabase tidak ada di .mcp.json.");

const response = await fetch(
  `https://api.supabase.com/v1/projects/${server.args.at(-1)}/config/auth`,
  { headers: { authorization: `Bearer ${server.env.SUPABASE_ACCESS_TOKEN}` } },
);

if (!response.ok) {
  console.error(`HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const auth = await response.json();
const ada = (value) => (value ? "ada" : "TIDAK ADA");

console.log("— Alamat —");
console.log(`  site_url                        ${auth.site_url || "(kosong)"}`);
console.log(`  uri_allow_list                  ${auth.uri_allow_list || "(kosong)"}`);

console.log("\n— Pendaftaran lewat email —");
console.log(`  mailer_autoconfirm              ${auth.mailer_autoconfirm}  ${auth.mailer_autoconfirm ? "(email TIDAK diverifikasi)" : "(email wajib diverifikasi)"}`);
console.log(`  external_email_enabled          ${auth.external_email_enabled}`);
console.log(`  disable_signup                  ${auth.disable_signup}`);
console.log(`  mailer_otp_exp                  ${auth.mailer_otp_exp} detik`);
console.log(`  mailer_otp_length               ${auth.mailer_otp_length ?? "(bawaan 6)"}`);
console.log(`  password_min_length             ${auth.password_min_length}`);

console.log("\n— Pengiriman surel —");
console.log(`  smtp_host                       ${auth.smtp_host || "(bawaan Supabase, terbatas ~2/jam)"}`);
console.log(`  smtp_user                       ${auth.smtp_user || "(kosong)"}`);
console.log(`  smtp_pass                       ${ada(auth.smtp_pass)}`);
console.log(`  smtp_sender_name                ${auth.smtp_sender_name || "(kosong)"}`);
console.log(`  smtp_admin_email                ${auth.smtp_admin_email || "(kosong)"}`);
console.log(`  rate_limit_email_sent           ${auth.rate_limit_email_sent} per jam`);

console.log("\n— Masuk lewat Google —");
console.log(`  external_google_enabled         ${auth.external_google_enabled}`);
console.log(`  external_google_client_id       ${ada(auth.external_google_client_id)}`);
console.log(`  external_google_secret          ${ada(auth.external_google_secret)}`);

console.log("\n— Templat surel yang sekarang —");
for (const name of ["confirmation", "recovery", "magic_link", "invite", "email_change"]) {
  const subject = auth[`mailer_subjects_${name}`];
  const content = auth[`mailer_templates_${name}_content`];
  const token = content?.includes("{{ .Token }}") ? "memuat {{ .Token }}" : "tanpa {{ .Token }}";
  console.log(`  ${name.padEnd(14)} subjek: ${subject || "(bawaan)"} · isi: ${content ? `${content.length} karakter, ${token}` : "(bawaan Supabase)"}`);
}
