import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), getAuthenticatedUser: vi.fn() }));
vi.mock("@/modules/consent/consent-repository", () => ({
  summarizeRequestedBusinesses: vi.fn(async () => new Map()),
  fallbackCandidateCode: (id: string) => `UMKM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
}));

import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { GET } from "@/app/api/v1/institution/dossiers/route";

const ORG = "11111111-1111-4111-8111-111111111111";

type Filter = { column: string; value: unknown };

/**
 * Klien palsu yang MENCATAT setiap penyaring. Yang diuji bukan hanya hasilnya,
 * tetapi bahwa kueri dosir selalu dibatasi ke organisasi yang terperiksa --
 * dulu penyaring itu hanya ditambahkan bila header ada.
 */
function fakeClient(options: { resolved: string | null; grants: Array<{ id: string; download_allowed: boolean }> }) {
  const filters: Record<string, Filter[]> = {};
  const dossiers = [
    { id: "d-1", request_id: "r-1", grant_id: "g-1", business_id: "bcb53e7c-0000-4000-8000-000000000001", status: "ready", expires_at: "2099-01-01T00:00:00Z", generated_at: "2026-09-01T00:00:00Z" },
    { id: "d-2", request_id: "r-2", grant_id: "g-2", business_id: "aaaaaaaa-0000-4000-8000-000000000002", status: "ready", expires_at: "2099-01-01T00:00:00Z", generated_at: "2026-09-01T00:00:00Z" },
  ];
  const tables: Record<string, unknown[]> = {
    dossiers,
    consent_grants: options.grants,
    discovery_optins: [],
    dossier_requests: [
      { id: "r-1", requested_scopes: ["readiness"], requested_duration_days: 90, download_requested: false },
    ],
  };
  const client = {
    rpc: vi.fn(async (fn: string) => fn === "resolve_my_institution_id"
      ? (options.resolved ? { data: options.resolved, error: null } : { data: null, error: { message: "INSTITUTION_ACCESS_DENIED" } })
      : { data: null, error: null }),
    from(table: string) {
      filters[table] = [];
      const result = { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters[table].push({ column, value }); return chain; },
        gt: () => chain,
        order: () => chain,
        in: async () => result,
        limit: async () => result,
      };
      return chain;
    },
  };
  return { client, filters };
}

describe("GET /api/v1/institution/dossiers", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "u-1" } as never);
  });

  it("selalu menyaring ke organisasi terpilih, bahkan tanpa header", async () => {
    const { client, filters } = fakeClient({ resolved: ORG, grants: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    const response = await GET(new Request("http://localhost/api/v1/institution/dossiers"));
    expect(response.status).toBe(200);
    expect(filters.dossiers).toContainEqual({ column: "institution_id", value: ORG });
  });

  it("menolak dengan 403 bila pemanggil bukan anggota organisasi yang ia sebut", async () => {
    const { client } = fakeClient({ resolved: null, grants: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    const response = await GET(new Request("http://localhost/api/v1/institution/dossiers", { headers: { "x-institution-id": ORG } }));
    expect(response.status).toBe(403);
  });

  it("mengambil izin unduh dari persetujuan pemilik, bukan true untuk semua", async () => {
    const { client } = fakeClient({ resolved: ORG, grants: [{ id: "g-1", download_allowed: true }, { id: "g-2", download_allowed: false }] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    const body = await (await GET(new Request("http://localhost/api/v1/institution/dossiers"))).json();
    const byId = Object.fromEntries((body.data as Array<{ id: string; downloadAllowed: boolean }>).map((row) => [row.id, row.downloadAllowed]));
    expect(byId).toEqual({ "d-1": true, "d-2": false });
  });

  it("menyertakan lingkup permintaan asal untuk Minta pembaruan", async () => {
    const { client } = fakeClient({ resolved: ORG, grants: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    const body = await (await GET(new Request("http://localhost/api/v1/institution/dossiers"))).json();
    const first = (body.data as Array<{ id: string; original: unknown; candidateCode: string }>).find((row) => row.id === "d-1");
    expect(first?.original).toEqual({ scopes: ["readiness"], durationDays: 90, downloadRequested: false });
    // Tanpa ringkasan, kodenya tetap kode -- bukan kata "Kandidat".
    expect(first?.candidateCode).toBe("UMKM-BCB53E7C");
  });
});
