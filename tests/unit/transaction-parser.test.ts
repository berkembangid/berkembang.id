import { describe, expect, it } from "vitest";

import { parseProviderExtraction } from "@/modules/ai/schema";

describe("provider transaction parser", () => {
  it("normalizes explicit Indonesian nominal strings", () => {
    const result = parseProviderExtraction({
      transcription: "Laku dua nasi kotak total 50 ribu",
      items: [
        {
          item: "Nasi kotak",
          qty: "2 porsi",
          type: "masuk",
          nominal: "50 ribu",
          kategori: "Penjualan",
        },
      ],
    });

    expect(result?.transactions).toEqual([
      {
        item: "Nasi kotak",
        qty: "2 porsi",
        type: "masuk",
        nominal: 50_000,
        kategori: "Penjualan",
      },
    ]);
  });

  it("rejects incomplete or ambiguous items", () => {
    expect(
      parseProviderExtraction({
        transcription: "Ada transaksi",
        items: [
          {
            item: "Transaksi",
            qty: "",
            type: "masuk",
            nominal: "lima puluh ribu",
            kategori: "Penjualan",
          },
        ],
      }),
    ).toBeNull();
  });
});
