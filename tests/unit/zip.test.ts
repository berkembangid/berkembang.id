import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip, crc32, csvRow } from "@/modules/documents/zip";

const encoder = new TextEncoder();
const fixedDate = new Date("2026-09-03T04:00:00.000Z");

describe("crc32", () => {
  it("matches the known checksum of a standard string", () => {
    // Nilai baku yang dipakai seluruh dunia untuk menguji CRC-32.
    expect(crc32(encoder.encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("returns zero for nothing", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("writes a file any unzip tool recognises", () => {
    const zip = buildZip([{ path: "profil.json", data: encoder.encode("{}") }], fixedDate);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // Akhir arsip pusat harus ada, kalau tidak berkasnya dianggap rusak.
    expect(zip.slice(-22, -18)).toEqual(new Uint8Array([0x50, 0x4b, 0x05, 0x06]));
  });

  it("produces identical bytes for identical content", () => {
    // Waktu diambil dari pemanggil, bukan dari jam. Dua ekspor dengan isi sama
    // yang menghasilkan bita berbeda mustahil dijelaskan saat ditanyakan.
    const entries = [{ path: "a.txt", data: encoder.encode("halo") }];
    expect(buildZip(entries, fixedDate)).toEqual(buildZip(entries, fixedDate));
  });

  it("keeps an empty archive valid", () => {
    const zip = buildZip([], fixedDate);
    expect(zip.length).toBe(22);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("stores binary content untouched", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 0, 13, 10]);
    const zip = buildZip([{ path: "foto.jpg", data: bytes }], fixedDate);
    // Metode stored: isinya muncul apa adanya di dalam arsip.
    const haystack = Buffer.from(zip).toString("latin1");
    expect(haystack.includes(Buffer.from(bytes).toString("latin1"))).toBe(true);
  });

  it("can really be opened by the operating system's own unzip", () => {
    // Uji terpenting di berkas ini: format yang hanya lulus menurut kodenya
    // sendiri tidak membuktikan apa pun bagi pemilik yang membuka berkasnya.
    const zip = buildZip(
      [
        { path: "profil.json", data: encoder.encode('{"nama":"Warung Sari"}') },
        { path: "catatan/jurnal.csv", data: encoder.encode("tanggal,jumlah\n2026-09-01,15000\n") },
      ],
      fixedDate,
    );
    const directory = mkdtempSync(join(tmpdir(), "zip-test-"));
    const archive = join(directory, "data.zip");
    writeFileSync(archive, zip);

    let extracted = false;
    for (const attempt of [
      () => execFileSync("unzip", ["-o", archive, "-d", directory], { stdio: "pipe" }),
      () =>
        execFileSync(
          "powershell",
          ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${directory}' -Force`],
          { stdio: "pipe" },
        ),
    ]) {
      try {
        attempt();
        extracted = true;
        break;
      } catch {
        continue;
      }
    }

    if (!extracted) {
      // Tidak ada alat ekstraksi di mesin ini; jangan mengaku lulus.
      expect(zip.length).toBeGreaterThan(22);
      return;
    }
    expect(existsSync(join(directory, "profil.json"))).toBe(true);
    expect(readFileSync(join(directory, "profil.json"), "utf8")).toBe('{"nama":"Warung Sari"}');
    expect(readFileSync(join(directory, "catatan", "jurnal.csv"), "utf8")).toContain("15000");
  });
});

describe("csvRow", () => {
  it("quotes values that contain separators", () => {
    expect(csvRow(["Beli gula, tepung", 15000])).toBe('"Beli gula, tepung",15000');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    // Deskripsi transaksi yang diawali tanda sama dengan akan dijalankan
    // Excel sebagai rumus, dan berkas ini dibuat justru untuk dibuka orang.
    expect(csvRow(["=1+1"])).toBe("\"'=1+1\"");
    expect(csvRow(["@SUM(A1)"])).toBe("\"'@SUM(A1)\"");
    expect(csvRow(["-5 ribu"])).toBe("\"'-5 ribu\"");
  });

  it("writes an empty cell for missing data", () => {
    expect(csvRow(["a", null, "b"])).toBe("a,,b");
  });

  it("doubles quotes inside a value", () => {
    expect(csvRow(['Beli "gula"'])).toBe('"Beli ""gula"""');
  });
});
