import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  archiveDocumentRecord,
  type ArchivedDocument,
} from "@/modules/documents/document-repository";
import { documentIdSchema } from "@/modules/documents/document-schema";

export type ArchiveDocumentRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  archiveDocument: (documentId: string) => Promise<ArchivedDocument>;
};

const defaultDependencies: ArchiveDocumentRouteDependencies = {
  authenticate: getAuthenticatedUser,
  archiveDocument: archiveDocumentRecord,
};

export async function handleArchiveDocumentRequest(
  documentId: string,
  dependencies: ArchiveDocumentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const archived = await dependencies.archiveDocument(parsedId.data);
    return Response.json({ data: archived });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleArchiveDocumentRequest(id);
}
