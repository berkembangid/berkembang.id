import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "Sesi berakhir. Silakan masuk kembali.",
          retryable: false,
          requestId: crypto.randomUUID(),
        },
      },
      { status: 401 },
    );
  }

  return Response.json(
    {
      error: {
        code: "ENDPOINT_RETIRED",
        message: "Gunakan unggah dokumen privat agar hasil ekstraksi memiliki versi dan jejak audit.",
        retryable: false,
        requestId: crypto.randomUUID(),
      },
    },
    { status: 410 },
  );
}
