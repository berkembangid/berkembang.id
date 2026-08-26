import { describe, expect, it } from "vitest";

import {
  portalPathForRole,
  resolveEffectivePortalRole,
} from "@/modules/auth/role-resolution";

describe("server-controlled effective portal role", () => {
  it("prioritizes an active platform-admin membership", () => {
    expect(resolveEffectivePortalRole({
      hasActivePlatformAdmin: true,
      hasActiveInstitutionMembership: true,
      hasActiveBusinessMembership: true,
    })).toBe("admin");
  });

  it("uses institution membership ahead of business membership", () => {
    expect(resolveEffectivePortalRole({
      hasActivePlatformAdmin: false,
      hasActiveInstitutionMembership: true,
      hasActiveBusinessMembership: true,
    })).toBe("institution");
  });

  it("uses an active business membership for the UMKM portal", () => {
    expect(resolveEffectivePortalRole({
      hasActivePlatformAdmin: false,
      hasActiveInstitutionMembership: false,
      hasActiveBusinessMembership: true,
    })).toBe("umkm");
  });

  it("fails closed when no controlled membership exists", () => {
    expect(resolveEffectivePortalRole({
      hasActivePlatformAdmin: false,
      hasActiveInstitutionMembership: false,
      hasActiveBusinessMembership: false,
    })).toBeNull();
  });

  it.each([
    ["admin", "/admin"],
    ["institution", "/institusi"],
    ["umkm", "/umkm"],
  ] as const)("maps role %s to %s", (role, expected) => {
    expect(portalPathForRole(role)).toBe(expected);
  });
});
