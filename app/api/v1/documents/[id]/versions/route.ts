import { after } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  completeDocumentVersionRecord,
  type CompletedDocumentVersion,
} from "@/modules/documents/document-repository";
import {
  completeDocumentVersionSchema,
  documentIdSchema,
} from "@/modules/documents/document-schema";
import { processDocumentExtractionJob } from "@/modules/documents/document-worker";

export const maxDuration = 60;

export type CompleteVersionRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  completeVersion: (documentId: string, sessionId: string) => Promise<CompletedDocumentVersion>;
  scheduleBackground: (jobId: string) => void;
};

const defaultDependencies: CompleteVersionRouteDependencies = {
  authenticate: getAuthenticatedUser,
  completeVersion: completeDocumentVersionRecord,
  scheduleBackground(jobId) {
    after(async () => {
      try {
        await processDocumentExtractionJob(jobId);
      } catch {
        console.error("Document extraction worker invocation failed", {
          jobId,
          code: "DOCUMENT_WORKER_INVOCATION_FAILED",
        });
      }
    });
  },
};

export async function handleCompleteDocumentVersionRequest(
  request: Request,
  documentId: string,
  dependencies: CompleteVersionRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const input = completeDocumentVersionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return documentValidationErrorResponse(input.error);

    const completed = await dependencies.completeVersion(parsedId.data, input.data.uploadSessionId);
    dependencies.scheduleBackground(completed.jobId);
    return Response.json({ data: completed }, { status: completed.idempotent ? 200 : 201 });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCompleteDocumentVersionRequest(request, id);
}
