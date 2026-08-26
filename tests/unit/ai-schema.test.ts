import { describe, expect, it } from "vitest";

import {
  aiFailureResponseSchema,
  parseProviderExtraction,
} from "@/modules/ai/schema";

describe("AI external response schemas", () => {
  it("accepts a complete transaction supported by provider output", () => {
    const result = parseProviderExtraction(
      {
        transcription: "Laku nasi kotak lima puluh ribu",
        items: [
          {
            item: "Nasi kotak",
            qty: "",
            type: "masuk",
            nominal: 50_000,
            kategori: "Penjualan",
          },
        ],
      },
    );

    expect(result?.transactions[0]?.nominal).toBe(50_000);
  });

  it("rejects malformed or zero-value provider transactions", () => {
    expect(
      parseProviderExtraction({
        transcription: "Tidak jelas",
        items: [
          {
            item: "Pemasukan",
            qty: "",
            type: "masuk",
            nominal: 0,
            kategori: "Penjualan",
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires failed responses to contain no transactions", () => {
    const failed = {
      status: "failed",
      error: {
        code: "AI_PROCESSING_FAILED",
        message: "Belum dapat diproses.",
        retryable: true,
        requestId: crypto.randomUUID(),
      },
      transactions: [],
    };

    expect(aiFailureResponseSchema.safeParse(failed).success).toBe(true);
    expect(
      aiFailureResponseSchema.safeParse({
        ...failed,
        transactions: [{ nominal: 50_000 }],
      }).success,
    ).toBe(false);
  });
});

