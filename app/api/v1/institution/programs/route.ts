import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

const programSchema = z.object({
  name: z.string().trim().min(3).max(200),
  region: z.string().trim().max(200).nullable().optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  missionPack: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
});

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

/** Daftar program milik organisasi terpilih. */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = await createServerSupabaseClient();
  const selected = selectedInstitution(request);
  let query = client.from("programs").select("id,name,region,join_code,status,starts_on,ends_on,mission_pack,created_at").order("created_at", { ascending: false });
  if (selected) query = query.eq("institution_id", selected);
  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: "PROGRAMS_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Buat program/kohort (DINAS/CSR, ADMIN organisasi). */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const selected = selectedInstitution(request);
  if (!selected) return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const { data: member } = await client.from("institution_members").select("role").eq("institution_id", selected).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (member?.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = programSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROGRAM" }, { status: 400 });
  const joinCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((byte) => "ABCDEFGHJKMNPQRSTVWXYZ23456789"[byte % 32]).join("");
  const { data, error } = await (client.from("programs") as unknown as {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string; join_code: string } | null; error: { message: string } | null }>;
      };
    };
  }).insert({
    institution_id: selected,
    name: parsed.data.name,
    region: parsed.data.region ?? null,
    starts_on: parsed.data.periodFrom ?? null,
    ends_on: parsed.data.periodTo ?? null,
    mission_pack: parsed.data.missionPack,
    join_code: joinCode,
    status: parsed.data.status,
    created_by: user.id,
  }).select("id,join_code").single();
  if (error) return NextResponse.json({ error: "PROGRAM_CREATE_FAILED" }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
