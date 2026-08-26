import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  createCaptureRecord,
  createCaptureUploadSession,
  type CaptureUploadSession,
  type CreatedCapture,
} from "@/modules/ledger/capture-repository";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import {
  createCaptureRequestSchema,
  idempotencyKeySchema,
  type CreateCaptureRequest,
} from "@/modules/ledger/capture-schema";

type AuthenticatedUser = { id: string };

export type CreateCaptureRouteDependencies = {
  authenticate: () => Promise<AuthenticatedUser | null>;
  createCapture: (input: CreateCaptureRequest, idempotencyKey: string) => Promise<CreatedCapture>;
  createUploadSession: (path: string) => Promise<CaptureUploadSession>;
};

const defaultDependencies: CreateCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  createCapture: createCaptureRecord,
  createUploadSession: createCaptureUploadSession,
};

export async function handleCreateCaptureRequest(
  request: Request,
  dependencies: CreateCaptureRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotencyKey.success) return captureValidationErrorResponse(idempotencyKey.error);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return captureValidationErrorResponse();
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "file" in body &&
      typeof body.file === "object" &&
      body.file !== null
    ) {
      const file = body.file as { mimeType?: unknown; size?: unknown };
      if (typeof file.size === "number" && file.size > 10 * 1024 * 1024) {
        return captureErrorResponse(new CaptureOperationError("FILE_TOO_LARGE"));
      }
      if (
        typeof file.mimeType === "string" &&
        !["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"].includes(file.mimeType)
      ) {
        return captureErrorResponse(new CaptureOperationError("UNSUPPORTED_MEDIA_TYPE"));
      }
    }

    const parsedBody = createCaptureRequestSchema.safeParse(body);
    if (!parsedBody.success) return captureValidationErrorResponse(parsedBody.error);

    const capture = await dependencies.createCapture(parsedBody.data, idempotencyKey.data);
    const upload =
      capture.inputMethod === "voice" && capture.status === "draft" && capture.storagePath
        ? await dependencies.createUploadSession(capture.storagePath)
        : null;

    return Response.json(
      { data: { capture, upload } },
      { status: capture.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return handleCreateCaptureRequest(request);
}
