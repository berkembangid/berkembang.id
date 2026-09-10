export type AppRole = "umkm" | "institution" | "admin" | "investor";

type EffectiveMemberships = {
  hasActivePlatformAdmin: boolean;
  hasActiveInstitutionMembership: boolean;
  hasActiveBusinessMembership: boolean;
  isInvestor?: boolean;
};

export function resolveEffectivePortalRole({
  hasActivePlatformAdmin,
  hasActiveInstitutionMembership,
  hasActiveBusinessMembership,
  isInvestor = false,
}: EffectiveMemberships): AppRole | null {
  if (hasActivePlatformAdmin) return "admin";
  if (hasActiveInstitutionMembership) {
    return isInvestor ? "investor" : "institution";
  }
  if (hasActiveBusinessMembership) return "umkm";
  return null;
}

export function portalPathForRole(role: AppRole) {
  if (role === "admin") return "/admin" as const;
  if (role === "investor") return "/investor" as const;
  if (role === "institution") return "/institusi" as const;
  return "/umkm" as const;
}

