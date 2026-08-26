import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import {
  confirmCaptureRecord,
  type ConfirmedCapture,
} from "@/modules/ledger/capture-repository";
import {
  captureIdSchema,
  confirmCaptureRequestSchema,
  idempotencyKeySchema,
  type TransactionDraftItem,
} from "@/modules/ledger/capture-schema";

export type ConfirmCaptureRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  confirm: (
    captureId: string,
    idempotencyKey: string,
    items: TransactionDraftItem[],
  ) => Promise<ConfirmedCapture>;
};

const defaultDependencies: ConfirmCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  confirm: confirmCaptureRecord,
};

export async function handleConfirmCaptureRequest(
  request: Request,
  captureId: string,
  dependencies: ConfirmCaptureRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const parsedId = captureIdSchema.safeParse(captureId);
    if (!parsedId.success) return captureValidationErrorResponse(parsedId.error);
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
    const parsedBody = confirmCaptureRequestSchema.safeParse(body);
    if (!parsedBody.success) return captureValidationErrorResponse(parsedBody.error);

    const result = await dependencies.confirm(
      parsedId.data,
      idempotencyKey.data,
      parsedBody.data.items,
    );
    return Response.json({ data: result });
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleConfirmCaptureRequest(request, id);
}
