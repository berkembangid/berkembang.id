import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const { adminClient, getEffectivePortalRole } = vi.hoisted(() => ({
  adminClient: { source: "service-role" },
  getEffectivePortalRole: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(() => adminClient),
}));
vi.mock("@/lib/auth/authorization", () => ({ getEffectivePortalRole }));

import { bootstrapAccountFromSignupMetadata } from "@/lib/auth/bootstrap";

const user = {
  id: "8751fdf5-62d0-46ec-8228-9161f4e92849",
  email: "owner@example.test",
  user_metadata: { signup_account_type: "umkm", nama_usaha: "Warung Uji" },
} as unknown as User;

describe("account bootstrap recovery", () => {
  beforeEach(() => getEffectivePortalRole.mockReset());

  it("checks existing membership with the trusted server client", async () => {
    getEffectivePortalRole.mockResolvedValue("umkm");

    await expect(bootstrapAccountFromSignupMetadata(user)).resolves.toBe("umkm");
    expect(getEffectivePortalRole).toHaveBeenCalledWith(adminClient, user.id);
  });

  it("does not invent an account type when signup metadata is missing", async () => {
    getEffectivePortalRole.mockResolvedValue(null);
    const incompleteUser = { ...user, user_metadata: {} } as unknown as User;

    await expect(bootstrapAccountFromSignupMetadata(incompleteUser)).rejects.toThrow(
      "ONBOARDING_METADATA_MISSING",
    );
  });
});
