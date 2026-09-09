import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { identifier?: string } | null;
    const identifier = body?.identifier?.trim() || "";

    if (!identifier) {
      return NextResponse.json({ error: "IDENTIFIER_REQUIRED" }, { status: 400 });
    }

    if (identifier.includes("@")) {
      return NextResponse.json({ email: identifier.toLowerCase() });
    }

    const clean = identifier.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (!clean) {
      return NextResponse.json({ email: identifier });
    }

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .or(`nama_contact.eq.${clean},name.eq.${clean},email.ilike.${clean}@%`)
      .limit(1)
      .maybeSingle();

    if (profile?.email) {
      return NextResponse.json({ email: profile.email });
    }

    // Default synthetic email pattern for username-based accounts
    return NextResponse.json({ email: `${clean}@lembaga.berkembang.id` });
  } catch (error) {
    console.error("Resolve identifier error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
