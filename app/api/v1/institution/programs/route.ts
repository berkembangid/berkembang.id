import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { z } from "zod";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { institutionHeader, resolveSelectedInstitution } from "@/lib/api/institution";

const programSchema = z.object({
  name: z.string().trim().min(3).max(200),
  region: z.string().trim().max(200).nullable().optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  missionPack: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
});

/** Daftar program milik organisasi terpilih. */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const selected = await resolveSelectedInstitution(client, request);
  if (!selected) return gagal("FORBIDDEN", 403);
  const { data, error } = await client.from("programs")
    .select("id,name,region,join_code,status,starts_on,ends_on,mission_pack,created_at")
    .eq("institution_id", selected)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return gagal("PROGRAMS_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Buat program/kohort (DINAS/CSR, ADMIN organisasi). */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = institutionHeader(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);
  const client = await createServerSupabaseClient();
  const { data: member } = await client.from("institution_members").select("role").eq("institution_id", selected).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (member?.role !== "admin") return gagal("FORBIDDEN", 403);
  const parsed = programSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gagal("INVALID_PROGRAM", 400);
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
  if (error) return gagal("PROGRAM_CREATE_FAILED", 400);
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * Menyunting program yang sudah dibuat.
 *
 * Sebelumnya rute ini hanya GET dan POST. Program yang namanya salah ketik --
 * atau yang wilayahnya keliru -- tinggal begitu selamanya, terlihat oleh
 * setiap UMKM yang memegang kode gabungnya. Basis data sudah mengizinkannya
 * sejak awal (`programs_update` untuk admin lembaga); yang tidak ada hanyalah
 * jalannya.
 */
const suntingSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(3).max(200).optional(),
  region: z.string().trim().max(200).nullable().optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["draft", "active", "paused", "closed"]).optional(),
});

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = institutionHeader(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const parsed = suntingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gagal("INVALID_PROGRAM", 400);

  const { id, periodFrom, periodTo, ...sisa } = parsed.data;
  // Bentuknya ditulis eksplisit, bukan `Record<string, unknown>`: tipe
  // generated menolak indeks bebas, dan menolaknya dengan benar -- kolom yang
  // salah eja akan lolos diam-diam kalau bentuknya dibiarkan longgar.
  const patch: {
    name?: string;
    region?: string | null;
    status?: string;
    starts_on?: string | null;
    ends_on?: string | null;
    updated_at?: string;
  } = {};
  if (sisa.name !== undefined) patch.name = sisa.name;
  if (sisa.region !== undefined) patch.region = sisa.region;
  if (sisa.status !== undefined) patch.status = sisa.status;
  if (periodFrom !== undefined) patch.starts_on = periodFrom;
  if (periodTo !== undefined) patch.ends_on = periodTo;
  if (Object.keys(patch).length === 0) return gagal("INVALID_PROGRAM", 400);
  patch.updated_at = new Date().toISOString();

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("programs")
    .update(patch)
    .eq("id", id)
    .eq("institution_id", selected)
    .select("id,status");

  if (error) return gagal("PROGRAM_UPDATE_FAILED");
  // Nol baris = RLS menolak (bukan admin lembaga ini). Penolakan itu datang
  // sebagai 200, jadi ia harus dihitung, bukan diasumsikan berhasil.
  if (!data || data.length === 0) return gagal("TIDAK_ADA_YANG_BERUBAH");

  return NextResponse.json({ data: data[0] });
}

/**
 * Menghapus program.
 *
 * HANYA SELAMA MASIH DRAF, dan itu aturan basis data (`programs_delete`
 * mensyaratkan `status = 'draft'`), bukan keputusan layar. Program yang pernah
 * aktif punya peserta yang bergabung memakai kodenya; menghapusnya membuat
 * mereka menjadi peserta dari sesuatu yang tidak pernah ada.
 *
 * Untuk program yang sudah berjalan, yang benar adalah menutupnya lewat PATCH
 * -- riwayatnya tetap utuh dan kodenya berhenti menerima peserta baru.
 */
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = institutionHeader(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return gagal("INVALID_PROGRAM", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("programs")
    .delete()
    .eq("id", id)
    .eq("institution_id", selected)
    .select("id");

  if (error) return gagal("PROGRAM_UPDATE_FAILED");
  if (!data || data.length === 0) return gagal("TIDAK_ADA_YANG_BERUBAH");

  return NextResponse.json({ ok: true });
}
