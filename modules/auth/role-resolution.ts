export type AppRole = "umkm" | "institution" | "admin";

type EffectiveMemberships = {
  hasActivePlatformAdmin: boolean;
  hasActiveInstitutionMembership: boolean;
  hasActiveBusinessMembership: boolean;
};

export function resolveEffectivePortalRole({
  hasActivePlatformAdmin,
  hasActiveInstitutionMembership,
  hasActiveBusinessMembership,
}: EffectiveMemberships): AppRole | null {
  if (hasActivePlatformAdmin) return "admin";
  if (hasActiveInstitutionMembership) return "institution";
  if (hasActiveBusinessMembership) return "umkm";
  return null;
}

export function portalPathForRole(role: AppRole) {
  if (role === "admin") return "/admin" as const;
  if (role === "institution") return "/institusi" as const;
  return "/umkm" as const;
}
