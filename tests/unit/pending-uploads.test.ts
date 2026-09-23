import { describe, expect, it } from "vitest";
import { isExpired, shouldQueueForRetry } from "@/modules/ledger/pending-uploads";

describe("antrean kirim ulang", () => {
  it("mengantrekan kegagalan jaringan, bukan kegagalan membaca", () => {
    expect(shouldQueueForRetry({ code: "NETWORK_ERROR" }, true)).toBe(true);
    expect(shouldQueueForRetry({ code: "UPLOAD_FAILED" }, true)).toBe(true);
    expect(shouldQueueForRetry({ code: "EXTRACTION_FAILED" }, true)).toBe(false);
    expect(shouldQueueForRetry(new Error("apa pun"), false)).toBe(true);
  });

  it("membuang berkas yang lebih tua dari seminggu", () => {
    const now = Date.parse("2026-09-23T00:00:00Z");
    expect(isExpired({ createdAt: "2026-09-10T00:00:00Z" }, now)).toBe(true);
    expect(isExpired({ createdAt: "2026-09-20T00:00:00Z" }, now)).toBe(false);
  });
});
