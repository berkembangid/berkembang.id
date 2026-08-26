import { NextResponse } from "next/server";
import { bootstrapAccountFromSignupMetadata } from "@/lib/auth/bootstrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { portalPathForRole } from "@/modules/auth/role-resolution";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const role = await bootstrapAccountFromSignupMetadata(supabase, user);
    return NextResponse.json({ role, destination: portalPathForRole(role) });
  } catch (bootstrapError) {
    const code = bootstrapError instanceof Error ? bootstrapError.message : "ONBOARDING_FAILED";
    const status = code === "ONBOARDING_METADATA_MISSING" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
