import { describe, expect, it } from "vitest";
import {
  isCompressibleImage,
  maxLongEdgePx,
  qualityLadder,
  scaledDimensions,
  shouldUseCompressed,
  targetBytes,
} from "@/modules/documents/image-compression";

describe("scaledDimensions", () => {
  it("shrinks a phone photo to a readable receipt size", () => {
    // Foto ponsel 12 MP tegak: sisi terpanjang turun ke 1600, rasio tetap.
    expect(scaledDimensions({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
  });

  it("shrinks landscape photos on their long edge too", () => {
    expect(scaledDimensions({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
  });

  it("never enlarges a photo that is already small", () => {
    // Memperbesar hanya menambah byte tanpa menambah satu pun detail, dan
    // byte itu yang membuat unggahan putus di sinyal 3G.
    expect(scaledDimensions({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it("keeps a photo exactly at the limit untouched", () => {
    expect(scaledDimensions({ width: maxLongEdgePx, height: 900 })).toEqual({
      width: maxLongEdgePx,
      height: 900,
    });
  });

  it("never produces a zero-width image from an extreme ratio", () => {
    // Nota panjang difoto miring bisa memberi rasio ekstrem; pembulatan ke
    // nol akan membuat kanvas gagal dan bukti hilang diam-diam.
    const result = scaledDimensions({ width: 20000, height: 3 });
    expect(result.width).toBe(maxLongEdgePx);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("reports nothing for an undecodable image", () => {
    expect(scaledDimensions({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe("isCompressibleImage", () => {
  it("compresses the formats a canvas can actually draw", () => {
    expect(isCompressibleImage("image/jpeg")).toBe(true);
    expect(isCompressibleImage("IMAGE/PNG")).toBe(true);
  });

  it("leaves PDFs and unknown formats alone", () => {
    // Perjanjian pinjaman berbentuk PDF. Lebih baik berkas besar daripada
    // berkas rusak karena dipaksa lewat kanvas.
    expect(isCompressibleImage("application/pdf")).toBe(false);
    expect(isCompressibleImage("image/heic")).toBe(false);
  });
});

describe("shouldUseCompressed", () => {
  it("keeps the original when re-encoding made it bigger", () => {
    expect(shouldUseCompressed(90_000, 120_000)).toBe(false);
  });

  it("uses the compressed file when it genuinely saved bytes", () => {
    expect(shouldUseCompressed(4_000_000, 380_000)).toBe(true);
  });

  it("keeps the original when the canvas produced nothing", () => {
    expect(shouldUseCompressed(4_000_000, 0)).toBe(false);
  });
});

describe("kompresi punya batas yang masuk akal untuk warung", () => {
  it("aims below a size a 3G upload can finish", () => {
    expect(targetBytes).toBeLessThanOrEqual(1024 * 1024);
  });

  it("stops lowering quality before receipt figures blur", () => {
    expect(Math.min(...qualityLadder)).toBeGreaterThanOrEqual(0.5);
    expect([...qualityLadder]).toEqual([...qualityLadder].sort((a, b) => b - a));
  });
});
