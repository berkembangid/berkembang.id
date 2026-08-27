import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import { createDocumentDownloadUrl } from "@/modules/documents/document-repository";
import { documentIdSchema } from "@/modules/documents/document-schema";

export type SignedUrlRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  createSignedUrl: (documentId: string, userId: string) => Promise<{
    signedUrl: string;
    expiresInSeconds: 60;
  }>;
};

const defaultDependencies: SignedUrlRouteDependencies = {
  authenticate: getAuthenticatedUser,
  createSignedUrl: createDocumentDownloadUrl,
};

export async function handleCreateDocumentSignedUrlRequest(
  documentId: string,
  dependencies: SignedUrlRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const signed = await dependencies.createSignedUrl(parsedId.data, user.id);
    return Response.json({ data: signed }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCreateDocumentSignedUrlRequest(id);
}
