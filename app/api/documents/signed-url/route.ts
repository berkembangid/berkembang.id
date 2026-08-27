import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { DocumentOperationError, documentErrorResponse } from "@/modules/documents/document-errors";
import { createDocumentDownloadUrl } from "@/modules/documents/document-repository";

const requestSchema = z.object({ documentId: z.uuid() });

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new DocumentOperationError("UNAUTHENTICATED");
    const input = requestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new DocumentOperationError("VALIDATION_FAILED", { cause: input.error });
    const signed = await createDocumentDownloadUrl(input.data.documentId, user.id);
    return Response.json(
      { signedUrl: signed.signedUrl, expiresIn: signed.expiresInSeconds },
      {
        headers: {
          "Cache-Control": "private, no-store",
          Deprecation: "true",
          Link: `</api/v1/documents/${input.data.documentId}/signed-url>; rel=successor-version`,
        },
      },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}
