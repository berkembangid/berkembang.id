import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/portal", () => ({ withPortalRpc: (client: unknown) => client }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/modules/accounting/statement-pdf", () => ({ renderFinancialStatementsPdf: vi.fn() }));
vi.mock("@/modules/institution/dossier-repository", () => ({
  resolveInstitutionContext: vi.fn(),
  buildDossierDocument: vi.fn(),
  dossierFormulaVersion: () => "uji",
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveInstitutionContext } from "@/modules/institution/dossier-repository";
import { GET } from "@/app/api/v1/institution/dossiers/[id]/pdf/route";

const context = {
  dossierId: "d-1", grantId: "g-1", requestId: "r-1", businessId: "b-1", businessName: "Usaha",
  institutionId: "i-1", institutionName: "Lembaga", memberLabel: "anggota (viewer)", isPlatformAdmin: false,
  scopes: ["financial_summary"], downloadAllowed: true, expiresAt: null, snapshotAt: null, items: {},
  identity: {}, sourceUpdatedAt: "2026-09-01T00:00:00Z",
};

function call() {
  return GET(new Request("http://localhost/api/v1/institution/dossiers/d-1/pdf"), { params: Promise.resolve({ id: "d-1" }) });
}

describe("gerbang unduhan dosir PDF", () => {
  const storageDownload = vi.fn();

  beforeEach(() => {
    storageDownload.mockReset();
    vi.mocked(createServiceRoleClient).mockReturnValue({
      storage: { from: () => ({ download: storageDownload, upload: vi.fn() }) },
    } as never);
  });

  it("menolak bila pemilik tidak mengizinkan unduhan, sebelum menyentuh berkas", async () => {
    vi.mocked(resolveInstitutionContext).mockResolvedValue({ ...context, downloadAllowed: false } as never);
    const response = await call();
    expect(response.status).toBe(403);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("menjalankan gerbang akses sebagai pengguna dan menghormati penolakannya", async () => {
    vi.mocked(resolveInstitutionContext).mockResolvedValue(context as never);
    const rpc = vi.fn(async () => ({ data: { allowed: false, code: "INSTITUTION_ACCESS_DENIED" }, error: null }));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc, from: vi.fn() } as never);

    const response = await call();
    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith("access_verified_business_profile", expect.objectContaining({ p_dossier_id: "d-1", p_action: "download" }));
    expect(storageDownload).not.toHaveBeenCalled();
  });
});
