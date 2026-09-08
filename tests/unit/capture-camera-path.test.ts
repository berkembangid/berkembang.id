import { describe, expect, it } from "vitest";
import { enforceReceiptAmount } from "@/modules/ledger/capture-amount-guard";
import { createCaptureRequestSchema, maxReceiptImageBytes } from "@/modules/ledger/capture-schema";

/**
 * Jalur kamera menumpang pipeline suara, dan yang harus dibuktikan justru
 * bahwa ia tidak membuka jalan pintas apa pun: tidak ada angka dari model,
 * tidak ada tebakan ketika notanya tidak terbaca, dan tidak ada foto yang
 * lolos tanpa dikecilkan lebih dulu.
 */

import type { TransactionDraftItem } from "@/modules/ledger/capture-schema";

/** Nominalnya sengaja mustahil: kalau ia lolos, ada jalan angka model masuk. */
const base: TransactionDraftItem = {
  clientItemId: "draf-1",
  transactionType: "expense",
  amountIdr: 999_999,
  transactionDate: "2026-09-07",
  categoryCode: "materials",
  description: "Belanja bahan",
  emkmCategoryCode: 5,
  confidence: 0.9,
};

describe("nominal pada jalur foto nota", () => {
  it("mengambil total, bukan nominal pertama yang terbaca", () => {
    // Inilah alasan struk tidak boleh memakai aturan « draf ke-n memakai
    // nominal ke-n »: nominal pertama pada nota adalah harga barang pertama.
    const guarded = enforceReceiptAmount(
      [base],
      "Nasi goreng 25.000\nEs teh 5.000\nTOTAL 30.000\nTUNAI 50.000\nKEMBALI 20.000",
    );
    expect(guarded.items[0].amountIdr).toBe(30000);
  });

  it("tidak pernah memakai nominal yang dikembalikan model", () => {
    // Nominal bawaan draf sengaja mustahil. Kalau ia lolos, berarti ada jalan
    // di mana angka model menjadi angka pembukuan.
    const guarded = enforceReceiptAmount([base], "TOTAL 47.000");
    expect(guarded.items[0].amountIdr).toBe(47000);
    expect(guarded.overridden).toBe(1);
  });

  it("mengosongkan nominal ketika notanya tidak terbaca", () => {
    const guarded = enforceReceiptAmount([base], "terima kasih atas kunjungan anda");
    expect(guarded.items[0].amountIdr).toBe(0);
    expect(guarded.candidates).toEqual([]);
  });

  it("mengosongkan nominal ketika dua kandidat terlalu rapat", () => {
    // Menebak di antara dua angka yang sama meyakinkannya berarti mencatat
    // angka yang tidak pernah dilihat siapa pun.
    const guarded = enforceReceiptAmount([base], "15.000\n16.000");
    expect(guarded.ambiguous).toBe(true);
    expect(guarded.items[0].amountIdr).toBe(0);
    expect(guarded.candidates).toHaveLength(2);
  });

  it("selalu menghasilkan satu draf dari satu foto", () => {
    // Itemisasi per baris struk belum dikerjakan; sepuluh draf dari satu foto
    // berarti pemilik memeriksa sepuluh hal untuk satu kali belanja.
    const guarded = enforceReceiptAmount([base, base, base], "TOTAL 30.000");
    expect(guarded.items).toHaveLength(1);
    expect(guarded.dropped).toBe(2);
  });

  it("membawa baris sumbernya untuk disorot", () => {
    const guarded = enforceReceiptAmount([base], "Nasi 20.000\nTOTAL BAYAR 20.000");
    expect(guarded.excerpt).toContain("TOTAL BAYAR");
  });
});

describe("pintu masuk foto nota", () => {
  const request = (file: unknown) =>
    createCaptureRequestSchema.safeParse({ inputMethod: "camera", file });

  it("menerima JPEG dan PNG", () => {
    expect(request({ mimeType: "image/jpeg", size: 400_000 }).success).toBe(true);
    expect(request({ mimeType: "image/png", size: 400_000 }).success).toBe(true);
  });

  it("menolak PDF", () => {
    expect(request({ mimeType: "application/pdf", size: 400_000 }).success).toBe(false);
  });

  it("menolak foto tanpa berkas", () => {
    expect(createCaptureRequestSchema.safeParse({ inputMethod: "camera" }).success).toBe(false);
  });

  it("menolak foto yang belum dikecilkan", () => {
    expect(request({ mimeType: "image/jpeg", size: maxReceiptImageBytes + 1 }).success).toBe(false);
  });

  it("tidak mengubah aturan jalur suara", () => {
    // Suara tetap sah dengan transkrip saja, tanpa berkas apa pun.
    const voice = createCaptureRequestSchema.safeParse({
      inputMethod: "voice",
      clientTranscript: { text: "jual nasi goreng dua puluh ribu", confidence: 0.9 },
    });
    expect(voice.success).toBe(true);
  });
});
