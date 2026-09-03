import { spawnSync } from "node:child_process";
import process from "node:process";

/**
 * Menghasilkan satu berkas contoh laporan keuangan ke
 * `test-results/contoh-laporan-keuangan.pdf` untuk ditinjau mata manusia.
 *
 * Dibungkus skrip Node, bukan variabel lingkungan di dalam npm script, supaya
 * jalan sama persis di PowerShell, cmd, dan shell POSIX.
 */
const result = spawnSync("npx", ["vitest", "run", "tests/unit/statement-pdf.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, WRITE_SAMPLE_PDF: "1" },
  shell: process.platform === "win32",
});

if (result.status === 0) {
  console.log("\nBerkas contoh: test-results/contoh-laporan-keuangan.pdf");
}
process.exit(result.status ?? 1);
