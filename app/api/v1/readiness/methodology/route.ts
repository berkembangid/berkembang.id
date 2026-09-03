import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ReadinessOperationError, readinessErrorResponse } from "@/modules/readiness/readiness-errors";
import { getReadinessMethodology } from "@/modules/readiness/level-repository";

/**
 * "Cara kami menghitung" — tabel aturan apa adanya dari konfigurasi.
 *
 * Transparansi ini yang membedakan tangga kesiapan dari skor kotak hitam.
 * Karena isinya konfigurasi terbit yang tidak bisa berubah tanpa versi baru,
 * ia boleh di-cache sebentar.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new ReadinessOperationError("UNAUTHENTICATED");
    return Response.json(
      { data: await getReadinessMethodology() },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return readinessErrorResponse(error);
  }
}
