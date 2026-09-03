import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ReadinessOperationError, readinessErrorResponse } from "@/modules/readiness/readiness-errors";
import { getReadinessLevel } from "@/modules/readiness/level-repository";

/**
 * Tingkat Kesiapan — satu-satunya sumber untuk Beranda, halaman Kesiapan, dan
 * nanti dossier institusi.
 *
 * Tidak ada layar yang boleh menghitung ulang bagian mana pun dari respons ini.
 * Sebelumnya kesiapan dihitung di beberapa tempat sekaligus, dan hasilnya tiga
 * angka berbeda untuk satu konsep yang sama -- "17/100" di Beranda, "6/7" di
 * kartu langkah, dan nilai per komponen di halaman Perjalanan.
 *
 * Tanpa cache: responsnya menulis potret harian, dan potret yang di-cache akan
 * membuat kenaikan tingkat tertunda beberapa menit tepat di saat pemilik baru
 * saja mengerjakan langkahnya.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new ReadinessOperationError("UNAUTHENTICATED");
    return Response.json(
      { data: await getReadinessLevel() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/v1/readiness error:", error);
    return readinessErrorResponse(error);
  }
}
