import { NextResponse } from "next/server";
import { z } from "zod";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase() || "";

  try {
    const admin = createServiceRoleClient();

    // 1. Fetch from institutions table where type indicates investor/offtaker
    const { data: instData, error: instError } = await admin
      .from("institutions")
      .select("*")
      .neq("status", "archived")
      .or("type.ilike.%investor%,type.ilike.%offtaker%");

    if (instError) throw instError;

    // 2. Fetch from profiles where role = 'investor'
    const { data: profData, error: profError } = await admin
      .from("profiles")
      .select("*")
      .neq("status", "inactive")
      .or("role.eq.investor,jenis_institusi.ilike.%investor%,jenis_institusi.ilike.%offtaker%");

    if (profError) throw profError;

    const list: Array<{
      id: string;
      name: string;
      pic: string;
      type: string;
      email: string;
      phone: string;
      location: string;
      status: string;
      source: "institutions" | "profiles";
      sourceId: string;
      createdAt: string;
    }> = [];

    const existingNames = new Set<string>();

    (instData || []).forEach((item) => {
      const name = item.name || "Investor / Offtaker";
      existingNames.add(name.toLowerCase().trim());
      list.push({
        id: `institution:${item.id}`,
        name,
        pic: item.contact_name || "-",
        type: item.type || "Investor / Offtaker",
        email: item.contact_email || "-",
        phone: "-",
        location: item.location || "Indonesia",
        status: item.active ? "active" : "inactive",
        source: "institutions",
        sourceId: item.id,
        createdAt: item.created_at,
      });
    });

    (profData || []).forEach((p, idx) => {
      const name = p.nama_institusi || p.nama_usaha || p.name || `Investor #${idx + 1}`;
      const norm = name.toLowerCase().trim();
      if (!existingNames.has(norm)) {
        existingNames.add(norm);
        list.push({
          id: `profile:${p.id}`,
          name,
          pic: p.nama_contact || p.nama_pemilik || p.name || "-",
          type: p.jenis_institusi || "Investor / Offtaker",
          email: p.email || "-",
          phone: p.phone || "-",
          location: p.lokasi || "Indonesia",
          status: p.status || "active",
          source: "profiles",
          sourceId: p.id,
          createdAt: p.created_at,
        });
      }
    });

    let filtered = list;
    if (search) {
      filtered = list.filter(
        (i) =>
          i.name.toLowerCase().includes(search) ||
          i.pic.toLowerCase().includes(search) ||
          i.type.toLowerCase().includes(search) ||
          i.location.toLowerCase().includes(search) ||
          i.email.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "QUERY_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.string().trim().min(2).max(100),
  pic: z.string().trim().max(100).optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function POST(request: Request) {
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

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const data = parsed.data;

    const inserted = await admin
      .from("institutions")
      .insert({
        name: data.name,
        type: data.type,
        programs_count: 1,
        active: data.status === "active",
        status: data.status === "active" ? "active" : "inactive",
        contact_name: data.pic || null,
        contact_email: data.email || null,
        location: data.location || "Indonesia",
        verification_status: "verified",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (inserted.error) throw inserted.error;

    return NextResponse.json({ ok: true, id: inserted.data.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "INSERT_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
