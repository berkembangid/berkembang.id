import { after } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  retryDocumentExtractionRecord,
  type RetriedDocumentExtraction,
} from "@/modules/documents/document-repository";
import { documentIdSchema } from "@/modules/documents/document-schema";
import { processDocumentExtractionJob } from "@/modules/documents/document-worker";

export const maxDuration = 60;

export type RetryDocumentExtractionRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  retryExtraction: (documentId: string) => Promise<RetriedDocumentExtraction>;
  scheduleBackground: (jobId: string) => void;
};

const defaultDependencies: RetryDocumentExtractionRouteDependencies = {
  authenticate: getAuthenticatedUser,
  retryExtraction: retryDocumentExtractionRecord,
  scheduleBackground(jobId) {
    after(async () => {
      try {
        await processDocumentExtractionJob(jobId);
      } catch {
        console.error("Document extraction retry invocation failed", {
          jobId,
          code: "DOCUMENT_RETRY_INVOCATION_FAILED",
        });
      }
    });
  },
};

export async function handleRetryDocumentExtractionRequest(
  documentId: string,
  dependencies: RetryDocumentExtractionRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const result = await dependencies.retryExtraction(parsedId.data);
    dependencies.scheduleBackground(result.jobId);
    return Response.json({ data: result });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleRetryDocumentExtractionRequest(id);
}
