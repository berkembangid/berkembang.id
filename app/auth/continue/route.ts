import { NextResponse } from "next/server";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { portalPathForRole } from "@/modules/auth/role-resolution";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    const role = await getEffectivePortalRole(supabase, user.id);
    if (role) {
      if (role === "umkm") {
        const transaction = await supabase.from("transactions").select("id").eq("user_id", user.id).limit(1).maybeSingle();
        if (!transaction.error && !transaction.data) {
          return NextResponse.redirect(new URL("/umkm/catat?onboarding=1", request.url));
        }
      }
      return NextResponse.redirect(new URL(portalPathForRole(role), request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/auth/login?error=authorization_unavailable", request.url));
  }

  return NextResponse.redirect(new URL("/auth/login?error=membership_required", request.url));
}
