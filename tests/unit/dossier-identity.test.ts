import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadDossierIdentity } from "@/modules/institution/dossier-identity";

const businessId = "50000000-0000-4000-8000-000000000001";
const profileId = "60000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown> | null;

/**
 * Klien palsu yang hanya mengenali dua tabel yang dibaca resolver identitas.
 * Rantai `.select().eq().maybeSingle()` ditiru apa adanya.
 */
function client(rows: { businesses: Row; profiles: Row }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "businesses" ? rows.businesses : rows.profiles,
            error: null,
          }),
        }),
      }),
    }),
  };
}

const businessRow = {
  name: "Warung Nita",
  legal_name: "Warung Nita",
  sector: "Kuliner",
  location: "Depok",
  phone: "021-000",
  legacy_profile_id: profileId,
  updated_at: "2026-01-10T00:00:00.000Z",
};

const profileRow = {
  nama_usaha: "Dapur Bu Nita",
  nama_pemilik: "Nita Rahmawati",
  nama_contact: null,
  name: "Nita",
  sektor_usaha: "Kuliner & Katering",
  lokasi: "Kota Depok",
  phone: "0812-0000-0000",
  email: "nita@example.id",
  bentuk_usaha: "perorangan",
  tahun_mulai_usaha: 2019,
  jumlah_karyawan: "1-4",
  updated_at: "2026-09-20T00:00:00.000Z",
};

function mockRows(rows: { businesses: Row; profiles: Row }) {
  vi.mocked(createServiceRoleClient).mockReturnValue(
    client(rows) as unknown as ReturnType<typeof createServiceRoleClient>,
  );
}

describe("identitas dossier mengikuti yang disunting pemilik", () => {
  beforeEach(() => vi.clearAllMocks());

  it("memakai nama dari profil, bukan baris usaha yang beku sejak akun dibuat", async () => {
    mockRows({ businesses: businessRow, profiles: profileRow });
    const identity = await loadDossierIdentity(businessId);
    expect(identity.businessName).toBe("Dapur Bu Nita");
    expect(identity.sector).toBe("Kuliner & Katering");
    expect(identity.city).toBe("Kota Depok");
    expect(identity.contactPhone).toBe("0812-0000-0000");
  });

  it("menerjemahkan nilai simpanan menjadi keterangan yang pantas dicetak", async () => {
    mockRows({ businesses: businessRow, profiles: profileRow });
    const identity = await loadDossierIdentity(businessId);
    expect(identity.businessForm).toBe("Usaha perorangan");
    expect(identity.employeeBand).toBe("1–4 orang");
    expect(identity.yearStarted).toBe(2019);
    expect(identity.ownerName).toBe("Nita Rahmawati");
  });

  it("jatuh ke baris usaha ketika profilnya sudah tidak ada", async () => {
    mockRows({ businesses: businessRow, profiles: null });
    const identity = await loadDossierIdentity(businessId);
    expect(identity.businessName).toBe("Warung Nita");
    expect(identity.sector).toBe("Kuliner");
    expect(identity.city).toBe("Depok");
    expect(identity.businessForm).toBeNull();
  });

  it("jatuh ke potret persetujuan ketika keduanya kosong", async () => {
    mockRows({ businesses: null, profiles: null });
    const identity = await loadDossierIdentity(businessId, {
      businessName: "Nama Saat Izin Disetujui",
      sector: "Kerajinan",
      generalLocation: "Bogor",
      contactName: "Pemilik",
      email: "lama@example.id",
      phone: "0811",
    });
    expect(identity.businessName).toBe("Nama Saat Izin Disetujui");
    expect(identity.sector).toBe("Kerajinan");
    expect(identity.city).toBe("Bogor");
    expect(identity.ownerName).toBe("Pemilik");
    expect(identity.contactEmail).toBe("lama@example.id");
  });

  it("melaporkan suntingan terbaru di antara profil dan baris usaha", async () => {
    mockRows({ businesses: businessRow, profiles: profileRow });
    expect((await loadDossierIdentity(businessId)).updatedAt).toBe("2026-09-20T00:00:00.000Z");

    mockRows({
      businesses: { ...businessRow, updated_at: "2026-10-01T00:00:00.000Z" },
      profiles: profileRow,
    });
    expect((await loadDossierIdentity(businessId)).updatedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("tidak pernah mengembalikan nama kosong", async () => {
    mockRows({ businesses: null, profiles: null });
    expect((await loadDossierIdentity(businessId)).businessName).toBe("Usaha");
  });
});
