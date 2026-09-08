/**
 * Menjalankan SQL di proyek Supabase lewat Management API.
 *
 * Token dibaca dari `.mcp.json` -- berkas yang sudah ada dan tidak pernah ikut
 * ke git -- supaya ia tidak pernah muncul di baris perintah, di riwayat shell,
 * atau di keluaran proses.
 *
 * Pemakaian:
 *   node scripts/supabase-sql.mjs berkas.sql
 *   node scripts/supabase-sql.mjs -e "select 1"
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const config = JSON.parse(readFileSync(".mcp.json", "utf8"));
const server = config.mcpServers?.supabase;
if (!server) throw new Error("Konfigurasi server supabase tidak ada di .mcp.json.");

const token = server.env.SUPABASE_ACCESS_TOKEN;
const ref = server.args.at(-1);

const [flag, value] = process.argv.slice(2);
if (!flag) throw new Error("Berikan berkas .sql atau -e \"SQL\".");
const query = flag === "-e" ? value : readFileSync(flag, "utf8");

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ query }),
});

const text = await response.text();
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${text}`);
  process.exit(1);
}
console.log(text);
