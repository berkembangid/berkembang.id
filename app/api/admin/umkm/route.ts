import { NextResponse } from "next/server";
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
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  try {
    const admin = createServiceRoleClient();

    let query = admin
      .from("profiles")
      .select("*", { count: "exact" })
      .or("role.eq.umkm,role.is.null,nama_usaha.not.is.null")
      .neq("role", "admin")
      .order("created_at", { ascending: false, nullsFirst: false });

    if (search) {
      query = query.or(
        `nama_usaha.ilike.%${search}%,name.ilike.%${search}%,nama_pemilik.ilike.%${search}%,sektor_usaha.ilike.%${search}%,lokasi.ilike.%${search}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error("Failed to query UMKM profiles:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const mapped = (data || []).map((p, idx) => {
      const createdDate = p.created_at ? new Date(p.created_at) : now;
      const ageDays = Math.max(1, Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
      const konsistensiVal = Number(p.konsistensi_days) > 0 ? Number(p.konsistensi_days) : ageDays;

      const businessName = p.nama_usaha || p.name || `Usaha UMKM #${from + idx + 1}`;
      const ownerName =
        p.nama_pemilik ||
        (p.name && p.name !== businessName ? p.name : p.email ? p.email.split("@")[0] : "Pemilik Usaha");

      return {
        id: p.id,
        name: ownerName,
        usaha: businessName,
        sektor: p.sektor_usaha || "Kuliner",
        lokasi: p.lokasi || "Depok",
        score: Number(p.readiness_score) || 50,
        konsistensi: konsistensiVal,
        status: p.status || "active",
        createdAt: p.created_at,
      };
    });

    const total = count ?? mapped.length;
    const totalPages = Math.ceil(total / pageSize) || 1;

    return NextResponse.json({
      items: mapped,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
