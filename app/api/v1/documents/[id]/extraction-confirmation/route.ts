import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  confirmDocumentExtractionRecord,
  type ConfirmedDocumentExtraction,
} from "@/modules/documents/document-repository";
import {
  confirmDocumentExtractionSchema,
  documentIdSchema,
} from "@/modules/documents/document-schema";

export type ConfirmDocumentExtractionRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  confirmExtraction: (
    documentId: string,
    documentVersionId: string,
    data: Record<string, unknown>,
  ) => Promise<ConfirmedDocumentExtraction>;
};

const defaultDependencies: ConfirmDocumentExtractionRouteDependencies = {
  authenticate: getAuthenticatedUser,
  confirmExtraction: confirmDocumentExtractionRecord,
};

export async function handleConfirmDocumentExtractionRequest(
  request: Request,
  documentId: string,
  dependencies: ConfirmDocumentExtractionRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const input = confirmDocumentExtractionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return documentValidationErrorResponse(input.error);
    const result = await dependencies.confirmExtraction(
      parsedId.data,
      input.data.documentVersionId,
      input.data.data,
    );
    return Response.json({ data: result });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleConfirmDocumentExtractionRequest(request, id);
}
