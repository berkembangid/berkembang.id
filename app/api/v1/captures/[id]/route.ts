import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import { getCaptureView, type CaptureView } from "@/modules/ledger/capture-repository";
import { captureIdSchema } from "@/modules/ledger/capture-schema";

type GetCaptureDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  getCapture: (captureId: string) => Promise<CaptureView>;
};

const defaultDependencies: GetCaptureDependencies = {
  authenticate: getAuthenticatedUser,
  getCapture: getCaptureView,
};

export async function handleGetCaptureRequest(
  captureId: string,
  dependencies: GetCaptureDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const parsedId = captureIdSchema.safeParse(captureId);
    if (!parsedId.success) return captureValidationErrorResponse(parsedId.error);

    const capture = await dependencies.getCapture(parsedId.data);
    return Response.json(
      { data: { capture } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleGetCaptureRequest(id);
}
