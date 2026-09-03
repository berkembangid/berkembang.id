import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
} from "@/modules/documents/document-errors";
import { getCabinetPayload } from "@/modules/documents/cabinet-repository";

/**
 * Semua yang dibutuhkan lemari dokumen dalam satu permintaan: sektor, bentuk
 * usaha, kelengkapan per sektor, dan nota yang sudah menempel.
 *
 * Digabung karena halaman ini menampilkan semuanya sekaligus; memisahnya
 * menjadi empat permintaan hanya menambah tiga kesempatan gagal untuk satu
 * layar yang sama.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    return Response.json(
      { data: await getCabinetPayload(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}
