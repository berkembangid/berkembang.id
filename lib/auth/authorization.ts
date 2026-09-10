import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEffectivePortalRole,
  type AppRole,
} from "@/modules/auth/role-resolution";
import type { Database } from "@/types/database.generated";

export class AuthorizationLookupError extends Error {
  constructor() {
    super("AUTHORIZATION_LOOKUP_FAILED");
    this.name = "AuthorizationLookupError";
  }
}

export async function getEffectivePortalRole(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole | null> {
  const [platformAdmin, institutionMember, businessMember] = await Promise.all([
    client
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    client
      .from("institution_members")
      .select("id, institution_id, institutions(type)")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    client
      .from("businesses")
      .select("id")
      .eq("legacy_profile_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (platformAdmin.error || institutionMember.error || businessMember.error) {
    throw new AuthorizationLookupError();
  }

  let isInvestor = false;
  if (institutionMember.data) {
    const inst = institutionMember.data as unknown as { institutions?: { type?: string } | Array<{ type?: string }> };
    const instType = Array.isArray(inst.institutions)
      ? inst.institutions[0]?.type || ""
      : inst.institutions?.type || "";
    const lowerType = instType.toLowerCase();
    if (lowerType.includes("investor") || lowerType.includes("offtaker") || lowerType.includes("ventura") || lowerType.includes("buyer")) {
      isInvestor = true;
    }
  }

  return resolveEffectivePortalRole({
    hasActivePlatformAdmin: Boolean(platformAdmin.data),
    hasActiveInstitutionMembership: Boolean(institutionMember.data),
    hasActiveBusinessMembership: Boolean(businessMember.data),
    isInvestor,
  });
}

