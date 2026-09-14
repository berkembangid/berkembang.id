import process from "node:process";
import { scanProject } from "./forbidden-terms.mjs";

const findings = await scanProject(process.cwd());

if (findings.length === 0) {
  console.log("Lint kata terlarang lulus: tidak ada bahasa penilaian kredit di antarmuka, laporan, atau pesan error.");
  process.exit(0);
}

console.error(`Lint kata terlarang gagal: ${findings.length} kemunculan.`);
console.error("BERKEMBANG.ID membentuk catatan usaha, bukan penilaian kelayakan pinjaman (POJK 29/2024).\n");
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  "${finding.term}"`);
  console.error(`    ${finding.text}`);
}
process.exit(1);
