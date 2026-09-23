import { getAuthenticatedUser } from "@/lib/supabase/server";
import { DocumentOperationError, documentErrorResponse } from "@/modules/documents/document-errors";
import { listDocumentRecords, type DocumentView } from "@/modules/documents/document-repository";

export type ListDocumentsRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  listDocuments: (options?: { archived?: boolean }) => Promise<DocumentView[]>;
};

const defaultDependencies: ListDocumentsRouteDependencies = {
  authenticate: getAuthenticatedUser,
  listDocuments: listDocumentRecords,
};

export async function handleListDocumentsRequest(
  dependencies: ListDocumentsRouteDependencies = defaultDependencies,
  options: { archived?: boolean } = {},
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const documents = await dependencies.listDocuments(options);
    return Response.json(
      { data: { documents } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}

/** `?arsip=1` = rak arsip. */
export async function GET(request: Request) {
  const archived = new URL(request.url).searchParams.get("arsip") === "1";
  return handleListDocumentsRequest(defaultDependencies, { archived });
}
