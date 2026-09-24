import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createCaptureRecord } from "@/modules/ledger/capture-repository";

/**
 * Jawaban `create_transaction_capture` harus terbaca untuk KETIGA jalur.
 *
 * Uji rute memalsukan repositori ini, jadi pembacanya sendiri tidak pernah
 * diuji -- dan ia lama menolak "OCR". Capture foto lahir di basis data, rute
 * menjawab galat, sesi unggah tidak pernah dibuat, dan foto nota tidak
 * pernah sampai dibaca.
 */
describe("createCaptureRecord", () => {
  beforeEach(() => rpc.mockReset());

  for (const capturePath of ["TEXT_ONLY", "WHISPER", "OCR"] as const) {
    it(`membaca jawaban jalur ${capturePath}`, async () => {
      rpc.mockResolvedValue({
        data: {
          id: "10000000-0000-4000-8000-000000000001",
          businessId: "20000000-0000-4000-8000-000000000001",
          inputMethod: capturePath === "OCR" ? "camera" : "voice",
          status: "draft",
          storagePath: "b/c/source.jpg",
          capturePath,
          createdAt: "2026-09-24T00:00:00Z",
          idempotent: false,
        },
        error: null,
      });

      const created = await createCaptureRecord(
        { inputMethod: capturePath === "OCR" ? "camera" : "voice", file: { mimeType: "image/jpeg", size: 1000 } },
        "capture:abc",
        capturePath,
      );
      expect(created.capturePath).toBe(capturePath);
      expect(created.storagePath).toBe("b/c/source.jpg");
    });
  }
});
