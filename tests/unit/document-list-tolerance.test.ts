import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listDocumentRecords } from "@/modules/documents/document-repository";

const businessId = "50000000-0000-4000-8000-000000000001";

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    business_id: businessId,
    user_id: null,
    name: "KTP Pemilik",
    doc_type: "ktp",
    status: "uploaded",
    current_version: 1,
    storage_path: "a/b/c.jpg",
    mime_type: "image/jpeg",
    file_size: 1024,
    checksum_sha256: null,
    ai_notes: null,
    file_url: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    archived_at: null,
    rejection_code: null,
    rejection_reason: null,
    legacy_public_url_sha256: null,
    doc_class: "identitas",
    doc_number: null,
    issuer: null,
    issued_on: null,
    valid_until: null,
    name_on_doc: null,
    assurance_level: "self",
    attested_by: null,
    attested_at: null,
    needs_class_review: false,
    content_hash: null,
    ...overrides,
  };
}

/** Klien palsu: tabel `documents` mengembalikan `rows`, sisanya kosong. */
function client(rows: Array<Record<string, unknown>>) {
  return {
    from: (table: string) => ({
      select: () => {
        if (table === "documents") {
          const result = { data: rows, error: null };
          const chain = {
            neq: () => chain,
            order: async () => result,
          };
          return chain;
        }
        return { in: async () => ({ data: [], error: null }) };
      },
    }),
  };
}

function mockRows(rows: Array<Record<string, unknown>>) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    client(rows) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
  );
}

describe("daftar dokumen bertahan terhadap baris yang jenisnya tidak dikenal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("mengembalikan dokumen yang sah meski ada satu baris warisan", async () => {
    // Persis bentuk yang menjatuhkan GET /api/v1/documents di produksi: satu
    // baris ber-doc_type 'other' membuat SELURUH daftar menjawab 500.
    mockRows([
      documentRow(),
      documentRow({ id: "20000000-0000-4000-8000-000000000002", doc_type: "other", name: "Faktur Pembelian" }),
      documentRow({ id: "30000000-0000-4000-8000-000000000003", doc_type: "nib", name: "NIB" }),
    ]);
    const documents = await listDocumentRecords();
    expect(documents.map((item) => item.docType)).toEqual(["ktp", "nib"]);
  });

  it("melewati baris yang statusnya tidak dikenal juga", async () => {
    mockRows([
      documentRow(),
      documentRow({ id: "20000000-0000-4000-8000-000000000002", status: "archived" }),
    ]);
    expect(await listDocumentRecords()).toHaveLength(1);
  });

  it("mencatat id dan nilainya supaya barisnya bisa diperbaiki, bukan hilang diam-diam", async () => {
    mockRows([documentRow({ doc_type: "other" })]);
    await listDocumentRecords();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("tidak dikenal"),
      expect.objectContaining({ id: "10000000-0000-4000-8000-000000000001", docType: "other" }),
    );
  });

  it("tidak melewati apa pun ketika semua barisnya sah", async () => {
    mockRows([documentRow(), documentRow({ id: "20000000-0000-4000-8000-000000000002", doc_type: "npwp" })]);
    expect(await listDocumentRecords()).toHaveLength(2);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("daftar kosong tetap daftar kosong", async () => {
    mockRows([]);
    expect(await listDocumentRecords()).toEqual([]);
  });
});
