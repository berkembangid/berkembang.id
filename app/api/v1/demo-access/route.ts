import {
  demoAccessPayload,
  recordDemoAccessRequest,
} from "@/modules/marketing/demo-access-repository";
import { demoAccessRequestSchema } from "@/modules/marketing/demo-access-schema";

/**
 * Menukar nama dan surel dengan akun demo.
 *
 * Route ini SENGAJA terbuka tanpa autentikasi: yang memanggilnya adalah orang
 * yang belum punya akun, berdiri di depan poster, baru memindai QR. Menuntut
 * sesi di sini berarti menuntut hal yang justru sedang ia coba dapatkan.
 *
 * Yang menjaganya bukan autentikasi melainkan bentuk datanya: dua kolom
 * tervalidasi, panjang dibatasi, dan penulisannya lewat service role di server
 * — bukan lewat kunci anon yang tertanam di peramban setiap pengunjung.
 *
 * `no-store` karena jawabannya memuat sandi demo; ia tidak pantas mengendap di
 * cache bersama milik siapa pun.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "VALIDATION_FAILED", message: "Isian belum terbaca." } },
      { status: 400 },
    );
  }

  const parsed = demoAccessRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return Response.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Periksa kembali nama dan alamat surel Anda.",
          fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  // Dicatat lebih dulu, tetapi hasilnya tidak menahan apa pun -- lihat
  // `recordDemoAccessRequest`.
  await recordDemoAccessRequest(parsed.data, {
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
  });

  return Response.json(
    { data: demoAccessPayload() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
