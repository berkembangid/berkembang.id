import { describe, expect, it } from "vitest";
import {
  financialSurfaceForbiddenTerms,
  financialSurfaces,
  globalForbiddenTerms,
  scanContent,
  scanProject,
} from "../../scripts/forbidden-terms.mjs";

describe("forbidden credit-assessment language", () => {
  it("catches the terms that would make the product read as a lender", () => {
    for (const term of globalForbiddenTerms) {
      const findings = scanContent("modules/ledger/example.ts", `const label = "${term} usaha";`);
      expect(findings, term).toHaveLength(1);
      expect(findings[0].term).toBe(term);
    }
  });

  it("only bans approval language on the financial surfaces", () => {
    for (const term of financialSurfaceForbiddenTerms) {
      expect(scanContent("modules/consent/panel.tsx", `const text = "Permintaan ${term}.";`)).toHaveLength(0);
      for (const surface of financialSurfaces) {
        expect(
          scanContent(`${surface}/page.tsx`, `const text = "Laporan ${term}.";`),
          surface,
        ).toHaveLength(1);
      }
    }
  });

  it("does not fire on a longer word that merely contains a term", () => {
    expect(scanContent("app/(umkm)/umkm/laporan/page.tsx", "const x = 'plafonisasi';")).toHaveLength(0);
    expect(scanContent("modules/accounting/reports.ts", "const y = 'menyetujuinya';")).toHaveLength(0);
  });

  it("lets a line opt out when it has to name the term to forbid it", () => {
    expect(
      scanContent("modules/accounting/reports.ts", "// jangan pernah menulis skor kredit // forbidden-terms-allow"),
    ).toHaveLength(0);
  });

  it("reports the file and line so the failure is actionable", () => {
    const findings = scanContent("app/(umkm)/umkm/laporan/page.tsx", "const a = 1;\nconst b = 'plafon pinjaman';");
    expect(findings).toEqual([
      {
        file: "app/(umkm)/umkm/laporan/page.tsx",
        line: 2,
        term: "plafon",
        text: "const b = 'plafon pinjaman';",
      },
    ]);
  });

  it("keeps the shipped product clean", async () => {
    await expect(scanProject(process.cwd())).resolves.toEqual([]);
  });
});
