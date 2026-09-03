import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDrafts,
  buildQuestions,
  captureSubmittedEvent,
  chooseCapturePath,
  clientServerDivergence,
  clientTranscriptMinConfidence,
  defaultClientTranscriptMinConfidence,
  draftReturnedEvent,
  gatingTier,
  LlmAmountViolationError,
  llmAmountViolationCount,
  parseLlmCategory,
  resetLlmAmountViolationCount,
} from "@/modules/ledger/capture-routing";
import { enforceParserAmounts } from "@/modules/ledger/capture-amount-guard";
import { parseUtterance } from "@/modules/nominal-parser";
import type { TransactionDraftItem } from "@/modules/ledger/capture-schema";

const now = new Date("2026-09-02T05:00:00Z");
const confident = (text: string) => ({ text, confidence: 0.91 });

// ---------------------------------------------------------------------------
// Router dua jalur (spek 4.3)
// ---------------------------------------------------------------------------
describe("router jalur", () => {
  it("memilih TEXT_ONLY saat transkrip yakin DAN parser menemukan nominal", () => {
    const decision = chooseCapturePath({
      transcript: confident("tadi laku 35 ribu qris"),
      hasAudio: true,
      now,
    });
    expect(decision.path).toBe("TEXT_ONLY");
    expect(decision).toMatchObject({ reason: "CONFIDENT" });
  });

  it("jatuh ke WHISPER saat keyakinan transkrip di bawah ambang", () => {
    const decision = chooseCapturePath({
      transcript: { text: "tadi laku 35 ribu", confidence: 0.4 },
      hasAudio: true,
      now,
    });
    expect(decision.path).toBe("WHISPER");
  });

  it("jatuh ke WHISPER saat transkrip yakin tetapi tidak memuat nominal", () => {
    // Inilah separuh kedua dari syarat V3. Transkrip yang terdengar jelas tapi
    // tanpa angka tidak berguna untuk membuat satu baris jurnal.
    const decision = chooseCapturePath({
      transcript: confident("tadi laku banyak sekali"),
      hasAudio: true,
      now,
    });
    expect(decision.path).toBe("WHISPER");
  });

  it("memakai teks apa adanya saat audio tidak ada, walau keyakinannya rendah", () => {
    const decision = chooseCapturePath({
      transcript: { text: "laku lima ratus", confidence: 0.3 },
      hasAudio: false,
      now,
    });
    expect(decision).toMatchObject({ path: "TEXT_ONLY", reason: "ONLY_SOURCE" });
  });

  it("menolak saat tidak ada transkrip maupun audio", () => {
    expect(chooseCapturePath({ transcript: null, hasAudio: false, now })).toEqual({
      path: null,
      reason: "NO_SOURCE",
    });
    expect(chooseCapturePath({ transcript: { text: "   ", confidence: 1 }, hasAudio: false, now })).toEqual({
      path: null,
      reason: "NO_SOURCE",
    });
  });

  it("ambangnya konfigurasi, bukan konstanta", () => {
    expect(clientTranscriptMinConfidence({})).toBe(defaultClientTranscriptMinConfidence);
    expect(clientTranscriptMinConfidence({ VOICE_CLIENT_TRANSCRIPT_MIN_CONF: "0.7" })).toBe(0.7);
    // Nilai yang tidak masuk akal dikembalikan ke bawaan, bukan dipakai.
    for (const bad of ["0", "1.4", "-1", "banyak", ""]) {
      expect(clientTranscriptMinConfidence({ VOICE_CLIENT_TRANSCRIPT_MIN_CONF: bad })).toBe(
        defaultClientTranscriptMinConfidence,
      );
    }
  });

  it("ambang yang diturunkan mengubah keputusan", () => {
    const transcript = { text: "laku 35 ribu", confidence: 0.6 };
    expect(chooseCapturePath({ transcript, hasAudio: true, now }).path).toBe("WHISPER");
    expect(chooseCapturePath({ transcript, hasAudio: true, minConfidence: 0.5, now }).path).toBe(
      "TEXT_ONLY",
    );
  });
});

// ---------------------------------------------------------------------------
// Gating (spek Bagian 5)
// ---------------------------------------------------------------------------
describe("gating kepercayaan", () => {
  const draftsFor = (text: string, confidence = 0.91) =>
    buildDrafts(parseUtterance(text, { now }), confidence);

  it("TINGGI: satu nominal pasti, kategori dari kata kunci, transkrip yakin", () => {
    const [draft] = draftsFor("tadi laku 35 ribu qris");
    expect(draft.tier).toBe("TINGGI");
    expect(draft.amountCandidates).toHaveLength(1);
    expect(draft.category?.source).toBe("KEYWORD");
    expect(draft.paymentMethod).toBe("QRIS");
  });

  it("SEDANG: nominal pasti tetapi kategori tidak terbaca", () => {
    const [draft] = draftsFor("35 ribu");
    expect(draft.tier).toBe("SEDANG");
    expect(draft.category).toBeNull();
  });

  it("SEDANG: kategori jelas tetapi transkripnya tidak yakin", () => {
    const [draft] = draftsFor("laku 35 ribu", 0.4);
    expect(draft.tier).toBe("SEDANG");
  });

  it("RENDAH: dua kandidat nominal", () => {
    const [draft] = draftsFor("laku lima ratus");
    expect(draft.tier).toBe("RENDAH");
    expect(draft.amountCandidates.map((amount) => amount.value)).toEqual([500, 500_000]);
  });

  it("RENDAH: tidak ada nominal sama sekali", () => {
    const [draft] = draftsFor("laku banyak hari ini");
    expect(draft.tier).toBe("RENDAH");
    expect(draft.amountCandidates).toHaveLength(0);
  });

  it("tidak pernah ada tingkat yang menyimpan otomatis", () => {
    const tiers = ["TINGGI", "SEDANG", "RENDAH"];
    for (const text of ["tadi laku 35 ribu qris", "35 ribu", "lima ratus", "apa saja"]) {
      for (const draft of draftsFor(text)) expect(tiers).toContain(draft.tier);
    }
  });

  it("gatingTier menolak lebih dari satu kandidat", () => {
    const tier = gatingTier(
      {
        amountCandidates: [
          { value: 500, span: [0, 3], confidence: 0.5 },
          { value: 500_000, span: [0, 3], confidence: 0.5 },
        ],
        category: null,
      },
      1,
    );
    expect(tier).toBe("RENDAH");
  });
});

// ---------------------------------------------------------------------------
// Pertanyaan (maksimal satu)
// ---------------------------------------------------------------------------
describe("pertanyaan", () => {
  it('"lima ratus" menghasilkan satu pertanyaan dua pilihan', () => {
    const drafts = buildDrafts(parseUtterance("laku lima ratus", { now }), 0.91);
    const questions = buildQuestions(drafts);
    expect(questions).toEqual([
      { draftIndex: 0, field: "amount", type: "CHOICE", choices: [500, 500_000] },
    ]);
  });

  it("tanpa nominal sama sekali meminta numpad", () => {
    const drafts = buildDrafts(parseUtterance("laku banyak", { now }), 0.91);
    expect(buildQuestions(drafts)[0]).toMatchObject({ type: "NUMPAD" });
  });

  it("draf yang jelas tidak menghasilkan pertanyaan", () => {
    const drafts = buildDrafts(parseUtterance("tadi laku 35 ribu qris", { now }), 0.91);
    expect(buildQuestions(drafts)).toEqual([]);
  });

  it("tidak pernah lebih dari satu pertanyaan, walau dua draf sama-sama ragu", () => {
    // Bertanya dua kali menghabiskan target dua ketukan, dan pemilik yang
    // ditanya berulang berhenti memakai fitur suara.
    const drafts = buildDrafts(parseUtterance("laku lima ratus sama beli gas dua ratus", { now }), 0.91);
    expect(drafts.length).toBeGreaterThan(1);
    expect(buildQuestions(drafts)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Model bahasa tidak boleh mengeluarkan angka (V4)
// ---------------------------------------------------------------------------
describe("penjaga keluaran model bahasa", () => {
  beforeEach(() => resetLlmAmountViolationCount());

  it("menerima kategori tanpa satu pun medan angka nominal", () => {
    expect(
      parseLlmCategory({ category_code: 6, subtype: "5210", confidence: 0.9, evidence_span: [5, 8] }),
    ).toMatchObject({ category_code: 6 });
    expect(llmAmountViolationCount()).toBe(0);
  });

  const forbidden = ["amount", "amountIdr", "nominal", "total", "harga", "jumlah", "price", "value_idr"];
  for (const field of forbidden) {
    it(`menolak keras payload yang memuat "${field}"`, () => {
      expect(() =>
        parseLlmCategory({ category_code: 1, confidence: 0.9, evidence_span: [0, 4], [field]: 35_000 }),
      ).toThrow(LlmAmountViolationError);
      expect(llmAmountViolationCount()).toBe(1);
    });
  }

  it("menolak medan tambahan apa pun, bukan hanya yang berbau angka", () => {
    expect(() =>
      parseLlmCategory({ category_code: 1, confidence: 0.9, evidence_span: [0, 4], catatan: "x" }),
    ).toThrow();
  });

  it("menolak kategori di luar 1..10", () => {
    for (const code of [0, 11, -1, 1.5]) {
      expect(() => parseLlmCategory({ category_code: code, confidence: 1, evidence_span: [0, 1] })).toThrow();
    }
  });

  it("penghitung pelanggaran bertambah, dan targetnya nol", () => {
    expect(llmAmountViolationCount()).toBe(0);
    try {
      parseLlmCategory({ category_code: 1, confidence: 1, evidence_span: [0, 1], nominal: 1 });
    } catch {
      // disengaja
    }
    expect(llmAmountViolationCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Penjaga nominal pada jalur Whisper
// ---------------------------------------------------------------------------
describe("nominal draf selalu dari parser", () => {
  const item = (overrides: Partial<TransactionDraftItem> = {}): TransactionDraftItem => ({
    clientItemId: "a",
    transactionType: "income",
    amountIdr: 999_999,
    transactionDate: "2026-09-02",
    categoryCode: "sales",
    description: "Penjualan",
    ...overrides,
  });

  it("menimpa angka model dengan angka parser", () => {
    // Model mengembalikan 999.999; ucapannya jelas 35.000. Yang masuk buku
    // harus yang diucapkan pemilik.
    const result = enforceParserAmounts([item()], "tadi laku 35 ribu qris");
    expect(result.items[0].amountIdr).toBe(35_000);
    expect(result.overridden).toBe(1);
  });

  it("membiarkan angka yang sudah cocok", () => {
    const result = enforceParserAmounts([item({ amountIdr: 35_000 })], "laku 35 ribu");
    expect(result.overridden).toBe(0);
    expect(result.items[0].amountIdr).toBe(35_000);
  });

  it("memasangkan draf ke nominal berurutan pada ucapan multi-transaksi", () => {
    const result = enforceParserAmounts(
      [item({ clientItemId: "a" }), item({ clientItemId: "b" })],
      "laku 50 ribu sama beli gas 22 ribu",
    );
    expect(result.items.map((entry) => entry.amountIdr)).toEqual([50_000, 22_000]);
  });

  it("membuang draf yang tidak punya pasangan nominal", () => {
    const result = enforceParserAmounts(
      [item({ clientItemId: "a" }), item({ clientItemId: "b" })],
      "laku 50 ribu",
    );
    expect(result.items).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("tidak menyentuh apa pun bila transkripnya kosong", () => {
    expect(enforceParserAmounts([item()], null).items[0].amountIdr).toBe(999_999);
    expect(enforceParserAmounts([item()], "   ").overridden).toBe(0);
  });

  it("tidak memakai kandidat ambigu", () => {
    // "lima ratus" bisa 500 atau 500.000. Menebak di sini justru mengulang
    // kesalahan yang sedang dicegah.
    const result = enforceParserAmounts([item()], "laku lima ratus");
    expect(result.overridden).toBe(0);
    expect(result.items[0].amountIdr).toBe(999_999);
  });
});

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------
describe("telemetry", () => {
  it("tidak pernah memuat transkrip maupun audio", () => {
    const drafts = buildDrafts(parseUtterance("bu ani ngutang 50 ribu", { now }), 0.91);
    const events = [
      captureSubmittedEvent({ path: "TEXT_ONLY", hasTranscript: true, hasAudio: false }),
      draftReturnedEvent({ drafts, path: "TEXT_ONLY", processingMs: 120 }),
    ];
    for (const event of events) {
      const serialized = JSON.stringify(event);
      // Isi ucapan tidak pernah ikut: "ngutang" adalah kata pemilik, dan
      // "Ani" adalah nama pelanggan yang hanya boleh berada di tabel capture
      // yang ber-RLS.
      expect(serialized).not.toContain("ngutang");
      expect(serialized).not.toContain("Ani");

      // Yang boleh ada hanya penanda: angka, boolean, dan label pendek.
      // `has_audio` sah — itu penanda keberadaan, bukan audionya.
      for (const value of Object.values(event)) {
        if (typeof value !== "string") continue;
        expect(value.length).toBeLessThanOrEqual(24);
      }
    }
  });

  it("mencatat jalur, tingkat, dan lama proses", () => {
    const drafts = buildDrafts(parseUtterance("laku 35 ribu", { now }), 0.91);
    expect(draftReturnedEvent({ drafts, path: "TEXT_ONLY", processingMs: 640 })).toMatchObject({
      event: "draft_returned",
      tier: "TINGGI",
      draft_count: 1,
      path: "TEXT_ONLY",
      processing_ms: 640,
    });
  });

  it("membandingkan petunjuk klien tanpa mempercayainya", () => {
    const drafts = buildDrafts(parseUtterance("laku 35 ribu", { now }), 0.91);
    expect(clientServerDivergence({ amounts: [35_000], categoryCode: 1 }, drafts)).toEqual([]);
    expect(clientServerDivergence({ amounts: [350_000] }, drafts)).toEqual(["amount"]);
    expect(clientServerDivergence({ categoryCode: 5 }, drafts)).toEqual(["category"]);
    expect(clientServerDivergence(null, drafts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lima skenario Checkpoint 2
// ---------------------------------------------------------------------------
describe("skenario checkpoint 2", () => {
  const route = (text: string, confidence: number, hasAudio: boolean) =>
    chooseCapturePath({ transcript: { text, confidence }, hasAudio, now });

  it("1. TEXT_ONLY dipilih dan Whisper tidak pernah dipanggil", async () => {
    const transcribe = vi.fn();
    const decision = route("tadi laku 35 ribu qris", 0.93, true);
    if (decision.path === "WHISPER") transcribe();
    expect(decision.path).toBe("TEXT_ONLY");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("2. mundur ke WHISPER saat syaratnya tidak terpenuhi", () => {
    expect(route("suara tidak jelas", 0.93, true).path).toBe("WHISPER");
    expect(route("tadi laku 35 ribu", 0.2, true).path).toBe("WHISPER");
  });

  it("3. tanpa transkrip dan tanpa audio ditolak", () => {
    expect(chooseCapturePath({ transcript: null, hasAudio: false, now }).path).toBeNull();
  });

  it("4. ambiguitas menghasilkan dua kandidat dan satu pertanyaan", () => {
    const drafts = buildDrafts(parseUtterance("laku lima ratus", { now }), 0.93);
    expect(drafts[0].amountCandidates).toHaveLength(2);
    expect(buildQuestions(drafts)).toHaveLength(1);
  });

  it("5. ucapan multi-transaksi menghasilkan dua draf terpisah", () => {
    const drafts = buildDrafts(
      parseUtterance("belanja tepung 200 ribu sama gas 22 ribu", { now }),
      0.93,
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.amountCandidates[0].value)).toEqual([200_000, 22_000]);
    expect(drafts.map((draft) => draft.category?.code)).toEqual([5, 6]);
  });
});
