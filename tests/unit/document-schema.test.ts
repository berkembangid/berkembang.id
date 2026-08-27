import { describe, expect, it } from "vitest";
import {
  createDocumentUploadSessionSchema,
  hasMatchingDocumentExtension,
  matchesDocumentMagic,
  maxDocumentBytes,
  parseDocumentOcrResult,
  sanitizeDocumentFilename,
} from "@/modules/documents/document-schema";

describe("WP-06 document validation", () => {
  const checksum = "a".repeat(64);

  it("accepts a valid private PDF and sanitizes the display filename", () => {
    const result = createDocumentUploadSessionSchema.safeParse({
      docType: "nib",
      ocrConsent: true,
      file: {
        name: "../NIB Usaha<script>.pdf",
        mimeType: "application/pdf",
        size: 1024,
        checksumSha256: checksum.toUpperCase(),
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file.name).toBe("NIB Usaha-script-.pdf");
      expect(result.data.file.checksumSha256).toBe(checksum);
    }
  });

  it("rejects MIME, extension, checksum, and per-type size mismatches", () => {
    expect(createDocumentUploadSessionSchema.safeParse({
      docType: "ktp",
      ocrConsent: true,
      file: { name: "ktp.exe", mimeType: "application/pdf", size: 100, checksumSha256: checksum },
    }).success).toBe(false);
    expect(createDocumentUploadSessionSchema.safeParse({
      docType: "ktp",
      ocrConsent: true,
      file: { name: "ktp.pdf", mimeType: "text/plain", size: 100, checksumSha256: checksum },
    }).success).toBe(false);
    expect(createDocumentUploadSessionSchema.safeParse({
      docType: "ktp",
      ocrConsent: true,
      file: { name: "ktp.pdf", mimeType: "application/pdf", size: maxDocumentBytes("ktp") + 1, checksumSha256: checksum },
    }).success).toBe(false);
    expect(createDocumentUploadSessionSchema.safeParse({
      docType: "ktp",
      ocrConsent: true,
      file: { name: "ktp.pdf", mimeType: "application/pdf", size: 100, checksumSha256: "not-a-checksum" },
    }).success).toBe(false);
  });

  it("checks extensions and file signatures without trusting browser MIME alone", () => {
    expect(hasMatchingDocumentExtension("dokumen.jpeg", "image/jpeg")).toBe(true);
    expect(hasMatchingDocumentExtension("dokumen.png", "image/jpeg")).toBe(false);
    expect(matchesDocumentMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "application/pdf")).toBe(true);
    expect(matchesDocumentMagic(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
    expect(matchesDocumentMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(matchesDocumentMagic(new TextEncoder().encode("not a pdf"), "application/pdf")).toBe(false);
  });

  it("removes path components and control characters from filenames", () => {
    expect(sanitizeDocumentFilename("..\\folder\\NIB\u0000.pdf")).toBe("NIB.pdf");
  });

  it("requires explicit OCR consent for identity documents", () => {
    expect(createDocumentUploadSessionSchema.safeParse({
      docType: "ktp",
      file: { name: "ktp.jpg", mimeType: "image/jpeg", size: 100, checksumSha256: checksum },
    }).success).toBe(false);
  });

  it("validates and normalizes document-specific OCR results", () => {
    expect(parseDocumentOcrResult("ktp", {
      documentType: "ktp",
      nik: "3276 0101 0101 0001",
      name: "Budi Santoso",
      placeOfBirth: null,
      dateOfBirth: null,
      address: "Depok",
      confidence: 0.92,
    })).toMatchObject({ nik: "3276010101010001", name: "Budi Santoso" });
    expect(() => parseDocumentOcrResult("nib", {
      documentType: "nib",
      nib: "123",
      confidence: 0.8,
    })).toThrow();
  });
});
