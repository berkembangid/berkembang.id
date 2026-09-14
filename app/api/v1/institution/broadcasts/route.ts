import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { broadcastErrorCode, broadcastErrorMessage, broadcastErrorStatus } from "@/modules/broadcast/broadcast-messages";

const BANDS = ["Rutin mencatat", "Mulai rutin", "Jarang mencatat", "Belum mulai"];

function failure(message: string, fallback: string) {
  const code = broadcastErrorCode(message);
  return NextResponse.json(
    { error: { code: code ?? "UNKNOWN", message: broadcastErrorMessage(message, fallback) } },
    { status: broadcastErrorStatus(code) },
  );
}

/** Broadcast milik lembaga pemanggil, beserta sisa kuotanya. */
export async function GET() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_institution_broadcasts");
  if (error) return failure(error.message, "Daftar broadcast belum dapat dimuat.");
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Mengajukan broadcast. Tidak mengirim apa pun -- admin platform meninjau
 * lebih dulu, dan pengirimannya terjadi di dalam tinjauan itu.
 *
 * Penyaring dan panjang pesan diperiksa ULANG di dalam fungsi basis data.
 * Pemeriksaan di sini hanya supaya pesan galatnya enak dibaca; yang menjaga
 * aturannya bukan route ini.
 */
export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    message?: unknown; recordingBand?: unknown; legalComplete?: unknown;
    eventDate?: unknown; eventPlace?: unknown; eventLink?: unknown;
  } | null;

  if (typeof body?.message !== "string") {
    return NextResponse.json(
      { error: { code: "PESAN_TERLALU_PENDEK", message: "Tulis pesannya lebih dulu." } },
      { status: 400 },
    );
  }
  if (body.recordingBand !== undefined && body.recordingBand !== null && !BANDS.includes(String(body.recordingBand))) {
    return NextResponse.json(
      { error: { code: "BAND_TIDAK_DIKENAL", message: "Pilihan sasarannya tidak dikenali." } },
      { status: 400 },
    );
  }

  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("request_dinas_broadcast", {
    p_message: body.message,
    p_recording_band: typeof body.recordingBand === "string" ? body.recordingBand : undefined,
    p_legal_complete: typeof body.legalComplete === "boolean" ? body.legalComplete : undefined,
    p_event_date: typeof body.eventDate === "string" && body.eventDate ? body.eventDate : undefined,
    p_event_place: typeof body.eventPlace === "string" && body.eventPlace ? body.eventPlace : undefined,
    p_event_link: typeof body.eventLink === "string" && body.eventLink ? body.eventLink : undefined,
  });
  if (error) return failure(error.message, "Broadcast belum dapat diajukan.");
  return NextResponse.json({ data }, { status: 201 });
}
