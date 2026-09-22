import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/v1/demo-access/route";

/** Klien palsu yang mencatat baris yang disisipkan. */
function client(hasil: { error: { message: string } | null } = { error: null }) {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    client: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return hasil;
        },
      }),
    },
  };
}

function permintaan(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.berkembang.id/api/v1/demo-access", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function pasang(hasil?: { error: { message: string } | null }) {
  const palsu = client(hasil);
  vi.mocked(createServiceRoleClient).mockReturnValue(
    palsu.client as unknown as ReturnType<typeof createServiceRoleClient>,
  );
  return palsu;
}

describe("gerbang akun demo di /bio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("menukar nama dan surel dengan akun demo", async () => {
    const palsu = pasang();
    const response = await POST(permintaan({ name: "Sari Dewi", email: "sari@contoh.com" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.sandi).toBeTruthy();
    expect(body.data.akun).toHaveLength(3);
    expect(body.data.akun.map((a: { peran: string }) => a.peran)).toEqual([
      "Pemilik usaha",
      "Dinas / lembaga",
      "Investor",
    ]);
    expect(palsu.inserted).toHaveLength(1);
    expect(palsu.inserted[0]).toMatchObject({ name: "Sari Dewi", email: "sari@contoh.com" });
  });

  it("menormalkan surel supaya orang yang sama tidak tercatat dua rupa", async () => {
    const palsu = pasang();
    await POST(permintaan({ name: "  Sari Dewi  ", email: "  Sari@Contoh.COM " }));
    expect(palsu.inserted[0]).toMatchObject({ name: "Sari Dewi", email: "sari@contoh.com" });
  });

  it("menolak surel yang bukan surel, dan menyebut kolomnya", async () => {
    pasang();
    const response = await POST(permintaan({ name: "Sari Dewi", email: "bukan-surel" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fieldErrors.email).toBeTruthy();
  });

  it("menolak nama kosong", async () => {
    pasang();
    const response = await POST(permintaan({ name: " ", email: "sari@contoh.com" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeTruthy();
  });

  it("tidak jatuh pada badan permintaan yang bukan JSON", async () => {
    pasang();
    const response = await POST(
      new Request("https://www.berkembang.id/api/v1/demo-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bukan json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("tetap menyajikan akun ketika pencatatannya gagal", async () => {
    // Orang yang sudah mengetik namanya di depan poster tidak pantas dihukum
    // karena basis data kita sedang bermasalah.
    pasang({ error: { message: "relation does not exist" } });
    const response = await POST(permintaan({ name: "Sari Dewi", email: "sari@contoh.com" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.akun).toHaveLength(3);
  });

  it("menyimpan jejak asal kunjungan", async () => {
    const palsu = pasang();
    await POST(
      permintaan(
        { name: "Sari Dewi", email: "sari@contoh.com" },
        { referer: "https://www.berkembang.id/bio", "user-agent": "Ponsel/1.0" },
      ),
    );
    expect(palsu.inserted[0]).toMatchObject({
      referrer: "https://www.berkembang.id/bio",
      user_agent: "Ponsel/1.0",
    });
  });

  it("tidak menyebut satu pun perusahaan sungguhan pada persona investor", async () => {
    pasang();
    const body = await (await POST(permintaan({ name: "Sari", email: "sari@contoh.com" }))).json();
    const investor = body.data.akun.find((a: { peran: string }) => a.peran === "Investor");
    expect(investor.lembaga).not.toMatch(/BNI/i);
  });
});
