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
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    client
      .from("business_members")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (platformAdmin.error || institutionMember.error || businessMember.error) {
    throw new AuthorizationLookupError();
  }

  return resolveEffectivePortalRole({
    hasActivePlatformAdmin: Boolean(platformAdmin.data),
    hasActiveInstitutionMembership: Boolean(institutionMember.data),
    hasActiveBusinessMembership: Boolean(businessMember.data),
  });
}
