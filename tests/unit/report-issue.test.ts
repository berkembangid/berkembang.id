import { describe, expect, it } from "vitest";
import {
  buildDocumentUid,
  documentUidPattern,
  reportPeriodText,
  reportStoragePath,
} from "@/modules/accounting/report-issue";

describe("buildDocumentUid", () => {
  it("carries the issue date so the order of reports reads without opening any", () => {
    const uid = buildDocumentUid("2026-09-03T04:00:00.000Z", new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(uid.startsWith("BRK-20260903-")).toBe(true);
    expect(uid).toMatch(documentUidPattern);
  });

  it("avoids the characters that get confused when read aloud", () => {
    // Nomor ini dibacakan lewat telepon oleh petugas koperasi. I/L/O/U dan
    // 0/1 tertukar terlalu mudah.
    const uid = buildDocumentUid(
      "2026-09-03",
      new Uint8Array(Array.from({ length: 8 }, (_value, index) => index * 7)),
    );
    const suffix = uid.split("-")[2];
    for (const forbidden of ["I", "L", "O", "U", "0", "1"]) {
      expect(suffix, forbidden).not.toContain(forbidden);
    }
  });

  it("produces a different number every time it is called", () => {
    const uids = new Set(Array.from({ length: 50 }, () => buildDocumentUid("2026-09-03")));
    expect(uids.size).toBe(50);
  });

  it("always matches the shape the archive expects", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(buildDocumentUid(new Date().toISOString())).toMatch(documentUidPattern);
    }
  });
});

describe("reportStoragePath", () => {
  it("keeps a report inside its owner's own space", () => {
    // Bentuknya diperiksa ulang oleh `public.record_report_issue`; kalau
    // berbeda, penerbitannya ditolak basis data.
    expect(reportStoragePath("user-1", "business-1", "doc-1")).toBe(
      "user-1/business-1/doc-1/doc-1.pdf",
    );
  });
});

describe("reportPeriodText", () => {
  it("writes the period the way an owner reads a date", () => {
    expect(reportPeriodText("2026-03-01", "2026-08-31")).toBe("1 Mar 2026 – 31 Agu 2026");
  });

  it("says something meaningful when there is no period", () => {
    expect(reportPeriodText(null, null)).toBe("Seluruh catatan");
  });
});
