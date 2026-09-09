import { NextResponse } from "next/server";
import { z } from "zod";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseInvestorId(rawId: string) {
  if (rawId.startsWith("institution:")) return { source: "institutions" as const, id: rawId.slice(12) };
  if (rawId.startsWith("profile:")) return { source: "profiles" as const, id: rawId.slice(8) };
  return { source: "institutions" as const, id: rawId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    if ((await getEffectivePortalRole(sessionClient, user.id)) !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }

  const { id: rawId } = await params;
  const { source, id } = parseInvestorId(rawId);
  const admin = createServiceRoleClient();

  try {
    if (source === "institutions") {
      const { data, error } = await admin.from("institutions").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

      return NextResponse.json({
        id: `institution:${data.id}`,
        name: data.name,
        type: data.type,
        pic: data.contact_name || "",
        email: data.contact_email || "",
        phone: "",
        location: data.location || "",
        status: data.active ? "active" : "inactive",
        programsCount: data.programs_count,
        source: "institutions",
        createdAt: data.created_at,
      });
    } else {
      const { data, error } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

      return NextResponse.json({
        id: `profile:${data.id}`,
        name: data.nama_institusi || data.nama_usaha || data.name || "",
        type: data.jenis_institusi || "Investor / Offtaker",
        pic: data.nama_contact || data.nama_pemilik || data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        location: data.lokasi || "",
        status: data.status || "active",
        programsCount: 1,
        source: "profiles",
        createdAt: data.created_at,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "QUERY_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.string().trim().min(2).max(100),
  pic: z.string().trim().max(100).optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive"]),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    if ((await getEffectivePortalRole(sessionClient, user.id)) !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }

  const { id: rawId } = await params;
  const { source, id } = parseInvestorId(rawId);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const d = parsed.data;

  try {
    if (source === "institutions") {
      const { error } = await admin
        .from("institutions")
        .update({
          name: d.name,
          type: d.type,
          contact_name: d.pic || null,
          contact_email: d.email || null,
          location: d.location || null,
          active: d.status === "active",
          status: d.status === "active" ? "active" : "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("profiles")
        .update({
          name: d.name,
          nama_institusi: d.name,
          jenis_institusi: d.type,
          nama_contact: d.pic || null,
          email: d.email || null,
          phone: d.phone || null,
          lokasi: d.location || null,
          status: d.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UPDATE_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    if ((await getEffectivePortalRole(sessionClient, user.id)) !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }

  const { id: rawId } = await params;
  const { source, id } = parseInvestorId(rawId);
  const admin = createServiceRoleClient();

  try {
    if (source === "institutions") {
      await admin.from("institutions").update({ active: false, status: "archived" }).eq("id", id);
    } else {
      await admin.from("profiles").update({ status: "inactive" }).eq("id", id);
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "DELETE_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
