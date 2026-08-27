import { getAuthenticatedUser } from "@/lib/supabase/server";
import { processQueuedCaptureJob } from "@/modules/ledger/capture-worker";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import {
  scheduleCaptureProcessing,
  type ScheduledCapture,
} from "@/modules/ledger/capture-repository";
import { captureIdSchema } from "@/modules/ledger/capture-schema";

export const maxDuration = 60;

export type ProcessCaptureRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  schedule: (captureId: string) => Promise<ScheduledCapture>;
  process: (jobId: string) => Promise<void>;
};

const defaultDependencies: ProcessCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  schedule: scheduleCaptureProcessing,
  process: processQueuedCaptureJob,
};

export async function handleProcessCaptureRequest(
  captureId: string,
  dependencies: ProcessCaptureRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const parsedId = captureIdSchema.safeParse(captureId);
    if (!parsedId.success) return captureValidationErrorResponse(parsedId.error);

    const scheduled = await dependencies.schedule(parsedId.data);
    // Run the MVP worker before returning. A serverless `after()` callback is
    // not a durable queue and was leaving remote jobs permanently queued.
    await dependencies.process(scheduled.jobId);
    return Response.json({ data: scheduled }, { status: 202 });
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleProcessCaptureRequest(id);
}
