import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const requestSchema = z.object({ documentId: z.uuid() });

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "INVALID_DOCUMENT_REQUEST" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const document = await supabase
    .from("documents")
    .select("id, storage_path, business_id")
    .eq("id", input.data.documentId)
    .maybeSingle();
  if (document.error || !document.data?.storage_path) {
    return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
  }

  try {
    const admin = createServiceRoleClient();
    const signed = await admin.storage
      .from("documents")
      .createSignedUrl(document.data.storage_path, 60);
    if (signed.error || !signed.data.signedUrl) throw new Error("SIGNED_URL_FAILED");

    const audit = await admin.from("audit_events").insert({
      actor_user_id: user.id,
      actor_type: "business_owner",
      business_id: document.data.business_id,
      action: "CREATE_DOCUMENT_SIGNED_URL",
      target_type: "document",
      target_id: document.data.id,
      status: "success",
      metadata: { ttl_seconds: 60 },
    });
    if (audit.error) throw new Error("DOCUMENT_ACCESS_AUDIT_FAILED");

    return NextResponse.json({ signedUrl: signed.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SIGNED_URL_FAILED";
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
