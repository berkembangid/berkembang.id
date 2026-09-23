import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { DocumentOperationError, documentErrorResponse, documentValidationErrorResponse } from "@/modules/documents/document-errors";
import { documentIdSchema } from "@/modules/documents/document-schema";

/**
 * Masa berlaku dokumen izin (0108). Layar Dokumen sudah lama meminta
 * « isi masa berlakunya », tetapi tidak ada tempat untuk mengisinya.
 * `validUntil: null` menghapus tanggalnya.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new DocumentOperationError("UNAUTHENTICATED");
    const { id } = await context.params;
    const parsedId = documentIdSchema.safeParse(id);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const body = await request.json().catch(() => null) as { validUntil?: unknown } | null;
    const validUntil = body?.validUntil ?? null;
    if (validUntil !== null && (typeof validUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil))) {
      throw new DocumentOperationError("VALIDATION_FAILED");
    }
    const client = withPortalRpc(await createServerSupabaseClient());
    const { data, error } = await client.rpc("set_document_validity", { p_document_id: parsedId.data, p_valid_until: validUntil });
    if (error) {
      if (error.message.includes("DOCUMENT_NOT_FOUND")) throw new DocumentOperationError("DOCUMENT_NOT_FOUND");
      if (error.message.includes("DOCUMENT_ARCHIVED")) throw new DocumentOperationError("DOCUMENT_ARCHIVED");
      throw new DocumentOperationError("VALIDATION_FAILED");
    }
    return NextResponse.json({ data });
  } catch (error) {
    return documentErrorResponse(error);
  }
}
