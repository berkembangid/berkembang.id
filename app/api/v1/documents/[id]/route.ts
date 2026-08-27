import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import { getDocumentRecord, type DocumentView } from "@/modules/documents/document-repository";
import { documentIdSchema } from "@/modules/documents/document-schema";

export type GetDocumentRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  getDocument: (documentId: string) => Promise<DocumentView>;
};

const defaultDependencies: GetDocumentRouteDependencies = {
  authenticate: getAuthenticatedUser,
  getDocument: getDocumentRecord,
};

export async function handleGetDocumentRequest(
  documentId: string,
  dependencies: GetDocumentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const document = await dependencies.getDocument(parsedId.data);
    return Response.json(
      { data: { document } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleGetDocumentRequest(id);
}
