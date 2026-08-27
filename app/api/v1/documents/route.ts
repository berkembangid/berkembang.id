import { getAuthenticatedUser } from "@/lib/supabase/server";
import { DocumentOperationError, documentErrorResponse } from "@/modules/documents/document-errors";
import { listDocumentRecords, type DocumentView } from "@/modules/documents/document-repository";

export type ListDocumentsRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  listDocuments: () => Promise<DocumentView[]>;
};

const defaultDependencies: ListDocumentsRouteDependencies = {
  authenticate: getAuthenticatedUser,
  listDocuments: listDocumentRecords,
};

export async function handleListDocumentsRequest(
  dependencies: ListDocumentsRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const documents = await dependencies.listDocuments();
    return Response.json(
      { data: { documents } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function GET() {
  return handleListDocumentsRequest();
}
