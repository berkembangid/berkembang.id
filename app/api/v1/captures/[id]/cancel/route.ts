import { after } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import {
  cancelCaptureRecord,
  removeCaptureUpload,
  type CancelledCapture,
} from "@/modules/ledger/capture-repository";
import { captureIdSchema } from "@/modules/ledger/capture-schema";

export type CancelCaptureRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  cancel: (captureId: string) => Promise<CancelledCapture>;
  scheduleCleanup: (path: string | null) => void;
};

const defaultDependencies: CancelCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  cancel: cancelCaptureRecord,
  scheduleCleanup(path) {
    after(() => removeCaptureUpload(path));
  },
};

export async function handleCancelCaptureRequest(
  captureId: string,
  dependencies: CancelCaptureRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const parsedId = captureIdSchema.safeParse(captureId);
    if (!parsedId.success) return captureValidationErrorResponse(parsedId.error);

    const cancelled = await dependencies.cancel(parsedId.data);
    dependencies.scheduleCleanup(cancelled.storagePath);
    return Response.json({ data: cancelled });
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleCancelCaptureRequest(id);
}
