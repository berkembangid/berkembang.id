import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Kewenangan sebuah lembaga: membaca keadaannya, dan menyetelnya.
 *
 * Route ini tidak memeriksa peran apa pun sendiri. Seluruh aturannya --
 * `is_platform_admin`, asimetri SUPER_ADMIN/OPS, alasan wajib, dan kedua
 * penjaga bentuk -- hidup di dalam `admin_set_institution_authority`. Route
 * yang ikut memeriksa akan melahirkan jawaban kedua yang suatu hari berselisih
 * dengan yang pertama.
 */

const MESSAGES: Record<string, string> = {
  BUKAN_ADMIN: "Hanya pengelola Berkembang.id yang bisa menyetel kewenangan lembaga.",
  BUTUH_PERAN_OPS: "Akun Anda belum punya peran untuk menyetel kewenangan lembaga.",
  MELONGGARKAN_BUTUH_SUPER_ADMIN:
    "Melonggarkan kewenangan butuh peran SUPER_ADMIN. Mengencangkannya bisa Anda lakukan sekarang.",
  ALASAN_WAJIB: "Tulis alasan singkat lebih dulu. Setiap perubahan kewenangan harus bisa dijelaskan nanti.",
  TINGKAT_TIDAK_DIKENAL: "Tingkat kesiapan itu tidak dikenali.",
  LEMBAGA_TIDAK_DITEMUKAN: "Lembaga itu sudah tidak ada.",
  WILAYAH_LEMBAGA_BELUM_DIISI:
    "Isi dulu kota atau kabupaten lembaga ini. Tanpa wilayah, dasbornya akan kosong tanpa penjelasan.",
  IDENTITAS_BUTUH_BATAS_WILAYAH:
    "Kewenangan melihat identitas hanya berlaku bersama batas wilayah. Nyalakan keduanya, atau tidak sama sekali.",
};

function failure(message: string, fallback: string) {
  const code = Object.keys(MESSAGES).find((key) => message.includes(key));
  const forbidden = code === "BUKAN_ADMIN" || code === "BUTUH_PERAN_OPS" || code === "MELONGGARKAN_BUTUH_SUPER_ADMIN";
  return NextResponse.json(
    { error: { code: code ?? "UNKNOWN", message: code ? MESSAGES[code] : fallback } },
    { status: forbidden ? 403 : 400 },
  );
}

export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const institutionId = new URL(request.url).searchParams.get("institutionId");
  if (!institutionId) {
    return NextResponse.json({ error: { code: "UNKNOWN", message: "Lembaga belum disebut." } }, { status: 400 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("admin_institution_authority", { p_institution_id: institutionId });
  if (error) return failure(error.message, "Kewenangan lembaga belum dapat dibaca.");
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    institutionId?: unknown; regionWide?: unknown; canSeeIdentity?: unknown;
    minLevel?: unknown; reason?: unknown; broadcastQuota?: unknown;
  } | null;

  if (typeof body?.institutionId !== "string"
    || typeof body.regionWide !== "boolean"
    || typeof body.canSeeIdentity !== "boolean") {
    return NextResponse.json({ error: { code: "UNKNOWN", message: "Setelannya belum lengkap." } }, { status: 400 });
  }

  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("admin_set_institution_authority", {
    p_institution_id: body.institutionId,
    p_region_wide: body.regionWide,
    p_can_see_identity: body.canSeeIdentity,
    // String kosong berarti "tanpa batas" di dalam fungsinya, jadi tidak perlu
    // nilai bawaan di sini -- satu arti, satu tempat.
    p_min_level: typeof body.minLevel === "string" ? body.minLevel : "",
    p_reason: typeof body.reason === "string" ? body.reason : "",
    p_broadcast_quota: typeof body.broadcastQuota === "number" ? body.broadcastQuota : undefined,
  });
  if (error) return failure(error.message, "Kewenangan belum dapat disimpan.");
  return NextResponse.json({ data });
}
