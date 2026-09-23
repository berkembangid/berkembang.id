import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), getAuthenticatedUser: vi.fn() }));

import { institutionHeader, resolveSelectedInstitution } from "@/lib/api/institution";
import { fallbackCandidateCode } from "@/modules/consent/consent-repository";
import { portalFromPath } from "@/modules/consent/portal-copy";
import { notificationTarget } from "@/modules/consent/notification-center";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

function request(headers: Record<string, string>) {
  return new Request("http://localhost/api/v1/institution/dossiers", { headers });
}

describe("organisasi terpilih", () => {
  it("memakai header bila ada, dan kuki bila tidak", () => {
    expect(institutionHeader(request({ "x-institution-id": ORG_A }))).toBe(ORG_A);
    expect(institutionHeader(request({ cookie: `lain=1; berkembang_institution_id=${ORG_B}` }))).toBe(ORG_B);
    // Header menang atas kuki: layar yang mengirim header tahu pilihannya sendiri.
    expect(institutionHeader(request({ "x-institution-id": ORG_A, cookie: `berkembang_institution_id=${ORG_B}` }))).toBe(ORG_A);
  });

  it("menolak nilai yang bukan UUID, bukan meneruskannya ke basis data", () => {
    expect(institutionHeader(request({ "x-institution-id": "bukan-uuid" }))).toBeNull();
    expect(institutionHeader(request({ cookie: "berkembang_institution_id='; drop table x" }))).toBeNull();
    expect(institutionHeader(request({}))).toBeNull();
  });

  it("memeriksa keanggotaan lewat resolve_my_institution_id, dan menjawab null bila ditolak", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: ORG_A, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "INSTITUTION_ACCESS_DENIED" } });
    const client = { rpc } as unknown as Parameters<typeof resolveSelectedInstitution>[0];

    await expect(resolveSelectedInstitution(client, request({ "x-institution-id": ORG_A }))).resolves.toBe(ORG_A);
    expect(rpc).toHaveBeenLastCalledWith("resolve_my_institution_id", { p_institution_id: ORG_A });

    await expect(resolveSelectedInstitution(client, request({ "x-institution-id": ORG_B }))).resolves.toBeNull();
  });
});

describe("kode kandidat cadangan", () => {
  it("dirumuskan sama dengan SQL: 'UMKM-' + delapan heksa pertama, huruf besar", () => {
    expect(fallbackCandidateCode("bcb53e7c-1234-4abc-8def-000000000000")).toBe("UMKM-BCB53E7C");
    expect(fallbackCandidateCode("bcb53e7c-1234-4abc-8def-000000000000")).toMatch(/^UMKM-[A-Z0-9]{8}$/);
  });
});

describe("portal dari alamat", () => {
  it("membaca portal dari alamat, bukan dari organisasi terpilih", () => {
    expect(portalFromPath("/investor").key).toBe("investor");
    expect(portalFromPath("/investor/dosir").purposeCode).toBe("partnership_review");
    expect(portalFromPath("/lembaga").key).toBe("lembaga");
    expect(portalFromPath("/lembaga/permintaan").purposeCode).toBe("program_review");
  });
});

describe("tautan pemberitahuan", () => {
  const base = { id: "n1", title: "t", body: "b", status: "unread", created_at: "2026-09-01T00:00:00Z" };

  it("menuju dosir atau permintaan yang dimaksud, di portal yang sedang dibuka", () => {
    expect(notificationTarget({ ...base, data: { dossierId: "d-1" } }, "/investor")).toBe("/investor/dosir?id=d-1");
    expect(notificationTarget({ ...base, data: { requestId: "r-1" } }, "/lembaga")).toBe("/lembaga/permintaan?id=r-1");
    expect(notificationTarget({ ...base, data: null }, "/lembaga")).toBeNull();
  });
});
