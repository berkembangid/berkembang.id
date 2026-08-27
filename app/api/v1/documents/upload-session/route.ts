import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  createDocumentUploadSessionRecord,
  type DocumentUploadSession,
} from "@/modules/documents/document-repository";
import {
  createDocumentUploadSessionSchema,
  documentIdempotencyKeySchema,
  type CreateDocumentUploadSessionRequest,
} from "@/modules/documents/document-schema";

export type UploadSessionRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  createSession: (
    input: CreateDocumentUploadSessionRequest,
    idempotencyKey: string,
  ) => Promise<DocumentUploadSession>;
};

const defaultDependencies: UploadSessionRouteDependencies = {
  authenticate: getAuthenticatedUser,
  createSession: createDocumentUploadSessionRecord,
};

export async function handleCreateDocumentUploadSessionRequest(
  request: Request,
  dependencies: UploadSessionRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));

    const idempotencyKey = documentIdempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotencyKey.success) return documentValidationErrorResponse(idempotencyKey.error);

    const body = await request.json().catch(() => null);
    if (
      typeof body === "object" && body !== null && "file" in body &&
      typeof body.file === "object" && body.file !== null
    ) {
      const file = body.file as { mimeType?: unknown; size?: unknown };
      if (typeof file.size === "number" && file.size > 10 * 1024 * 1024) {
        return documentErrorResponse(new DocumentOperationError("FILE_TOO_LARGE"));
      }
      if (
        typeof file.mimeType === "string" &&
        !["application/pdf", "image/jpeg", "image/png"].includes(file.mimeType)
      ) {
        return documentErrorResponse(new DocumentOperationError("UNSUPPORTED_MEDIA_TYPE"));
      }
    }
    const input = createDocumentUploadSessionSchema.safeParse(body);
    if (!input.success) return documentValidationErrorResponse(input.error);

    const session = await dependencies.createSession(input.data, idempotencyKey.data);
    return Response.json({ data: session }, { status: session.idempotent ? 200 : 201 });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return handleCreateDocumentUploadSessionRequest(request);
}
