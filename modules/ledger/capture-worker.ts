import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  CaptureProviderError,
  createCaptureProviderAdapters,
  type AudioInput,
  type CaptureProviderAdapter,
} from "@/modules/ai/capture-providers";
import type { Json } from "@/types/database.generated";
import { enforceParserAmounts } from "@/modules/ledger/capture-amount-guard";

const claimedJobSchema = z.object({
  jobId: z.uuid(),
  runId: z.uuid(),
  attemptNumber: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  captureId: z.uuid(),
  businessId: z.uuid(),
  requestedBy: z.uuid().nullable(),
  inputMethod: z.enum(["voice", "manual"]),
  sourceText: z.string().nullable(),
  storagePath: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
});

const failedJobSchema = z.object({
  captureId: z.uuid(),
  status: z.string(),
  retry: z.boolean(),
});

type ClaimedJob = z.infer<typeof claimedJobSchema>;

export type CaptureWorkerRepository = {
  getJobState(jobId: string): Promise<{
    status: string;
    attemptCount: number;
    maxAttempts: number;
  } | null>;
  claim(
    jobId: string,
    workerId: string,
    provider: string,
    model: string,
  ): Promise<ClaimedJob | null>;
  downloadAudio(path: string, mimeType: string): Promise<AudioInput>;
  complete(input: {
    jobId: string;
    attemptNumber: number;
    transcription: string;
    draft: Json;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
  }): Promise<void>;
  fail(input: {
    jobId: string;
    attemptNumber: number;
    code: string;
    message: string;
    retryable: boolean;
    latencyMs: number;
    retryReason: string | null;
  }): Promise<{ retry: boolean }>;
  removeUpload(path: string | null): Promise<void>;
};

function databaseError(error: { message: string } | null) {
  if (error) throw new Error(`CAPTURE_WORKER_DATABASE_ERROR:${error.message}`);
}

function createWorkerRepository(): CaptureWorkerRepository {
  const client = createServiceRoleClient();
  return {
    async getJobState(jobId) {
      const { data, error } = await client
        .from("ai_jobs")
        .select("status,attempt_count,max_attempts")
        .eq("id", jobId)
        .maybeSingle();
      databaseError(error);
      if (!data) return null;
      return {
        status: data.status,
        attemptCount: data.attempt_count,
        maxAttempts: data.max_attempts,
      };
    },
    async claim(jobId, workerId, provider, model) {
      const { data, error } = await client.rpc("claim_capture_ai_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_provider: provider,
        p_model: model,
      });
      databaseError(error);
      if (data === null) return null;
      const parsed = claimedJobSchema.safeParse(data);
      if (!parsed.success) throw new Error("CAPTURE_WORKER_INVALID_CLAIM");
      return parsed.data;
    },
    async downloadAudio(path, mimeType) {
      const { data, error } = await client.storage.from("captures").download(path);
      if (error || !data) throw new CaptureProviderError("CAPTURE_AUDIO_UNAVAILABLE", false);
      if (data.size < 1 || data.size > 10 * 1024 * 1024) {
        throw new CaptureProviderError("CAPTURE_AUDIO_INVALID", false);
      }
      const extension = mimeType === "audio/mp4" ? "mp4" : mimeType === "audio/ogg" ? "ogg" : mimeType === "audio/mpeg" ? "mp3" : "webm";
      return {
        file: new File([data], `capture.${extension}`, { type: mimeType }),
        mimeType,
      };
    },
    async complete(input) {
      const { error } = await client.rpc("complete_capture_ai_job", {
        p_job_id: input.jobId,
        p_attempt_number: input.attemptNumber,
        p_transcription: input.transcription,
        p_draft_payload: input.draft,
        p_latency_ms: input.latencyMs,
        ...(input.promptTokens === undefined ? {} : { p_prompt_tokens: input.promptTokens }),
        ...(input.completionTokens === undefined
          ? {}
          : { p_completion_tokens: input.completionTokens }),
      });
      databaseError(error);
    },
    async fail(input) {
      const { data, error } = await client.rpc("fail_capture_ai_job", {
        p_job_id: input.jobId,
        p_attempt_number: input.attemptNumber,
        p_failure_code: input.code,
        p_failure_message: input.message,
        p_retryable: input.retryable,
        p_latency_ms: input.latencyMs,
        ...(input.retryReason === null ? {} : { p_retry_reason: input.retryReason }),
      });
      databaseError(error);
      const parsed = failedJobSchema.safeParse(data);
      if (!parsed.success) throw new Error("CAPTURE_WORKER_INVALID_FAILURE_RESULT");
      return { retry: parsed.data.retry };
    },
    async removeUpload(path) {
      if (!path) return;
      const { error } = await client.storage.from("captures").remove([path]);
      if (error) {
        console.warn("Capture upload cleanup failed", { code: "CAPTURE_STORAGE_CLEANUP_FAILED" });
      }
    },
  };
}

const unconfiguredProvider: CaptureProviderAdapter = {
  provider: "unconfigured",
  model: "none",
  async process() {
    throw new CaptureProviderError("AI_PROVIDER_NOT_CONFIGURED", false);
  },
};

function safeProviderFailure(error: unknown) {
  if (error instanceof CaptureProviderError) return error;
  return new CaptureProviderError("AI_PROVIDER_FAILED", true, { cause: error });
}

function providerTimeoutMs() {
  const configured = Number(process.env.AI_PROVIDER_TIMEOUT_MS);
  return Number.isSafeInteger(configured) && configured >= 1_000 && configured <= 45_000
    ? configured
    : 18_000;
}

async function withProviderTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new CaptureProviderError("AI_TIMEOUT", true)),
          providerTimeoutMs(),
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function processQueuedCaptureJob(
  jobId: string,
  dependencies?: {
    repository?: CaptureWorkerRepository;
    providers?: CaptureProviderAdapter[];
    workerId?: string;
  },
) {
  const repository = dependencies?.repository ?? createWorkerRepository();
  const providers = dependencies?.providers ?? createCaptureProviderAdapters();
  const availableProviders = providers.length > 0 ? providers : [unconfiguredProvider];
  const workerId = dependencies?.workerId ?? `next-after-${crypto.randomUUID()}`;

  for (let loop = 0; loop < 3; loop += 1) {
    const state = await repository.getJobState(jobId);
    if (!state || state.status !== "queued" || state.attemptCount >= state.maxAttempts) return;

    const provider = availableProviders[state.attemptCount % availableProviders.length];
    const claim = await repository.claim(jobId, workerId, provider.provider, provider.model);
    if (!claim) return;

    const startedAt = Date.now();
    try {
      let audio: AudioInput | undefined;
      if (claim.inputMethod === "voice") {
        if (!claim.storagePath || !claim.mimeType) {
          throw new CaptureProviderError("CAPTURE_AUDIO_UNAVAILABLE", false);
        }
        audio = await repository.downloadAudio(claim.storagePath, claim.mimeType);
      }

      const result = await withProviderTimeout(
        provider.process({
          ...(claim.sourceText ? { sourceText: claim.sourceText } : {}),
          ...(audio ? { audio } : {}),
        }),
      );
      // Nominal yang dikembalikan model tidak pernah menjadi kebenaran.
      // Parser deterministik membacanya ulang dari transkrip yang sama, dan
      // hasilnyalah yang masuk draf. Lihat `capture-amount-guard.ts`.
      const guarded = enforceParserAmounts(result.items, result.transcription);
      if (guarded.overridden > 0 || guarded.dropped > 0) {
        console.warn("Capture draft amounts corrected by parser", {
          jobId,
          captureId: claim.captureId,
          overridden: guarded.overridden,
          dropped: guarded.dropped,
        });
      }

      await repository.complete({
        jobId,
        attemptNumber: claim.attemptNumber,
        transcription: result.transcription,
        draft: JSON.parse(JSON.stringify(guarded.items)) as Json,
        latencyMs: Date.now() - startedAt,
        ...(result.promptTokens === undefined ? {} : { promptTokens: result.promptTokens }),
        ...(result.completionTokens === undefined
          ? {}
          : { completionTokens: result.completionTokens }),
      });
      await repository.removeUpload(claim.storagePath);
      console.info("Capture AI job completed", {
        jobId,
        captureId: claim.captureId,
        provider: provider.provider,
        attemptNumber: claim.attemptNumber,
        itemCount: guarded.items.length,
        latencyMs: Date.now() - startedAt,
      });
      return;
    } catch (error) {
      const failure = safeProviderFailure(error);
      const hasDifferentProvider = availableProviders.length > 1;
      const retryable = failure.retryable || (failure.code === "AI_VALIDATION_FAILED" && hasDifferentProvider);
      const failed = await repository.fail({
        jobId,
        attemptNumber: claim.attemptNumber,
        code: failure.code,
        message: "Catatan belum berhasil dipahami. Coba rekam ulang atau gunakan Tulis Teks.",
        retryable,
        latencyMs: Date.now() - startedAt,
        retryReason: retryable ? (hasDifferentProvider ? "provider_fallback" : "transient_error") : null,
      });
      console.warn("Capture AI job attempt failed", {
        jobId,
        captureId: claim.captureId,
        provider: provider.provider,
        attemptNumber: claim.attemptNumber,
        code: failure.code,
        retry: failed.retry,
      });
      if (!failed.retry) {
        await repository.removeUpload(claim.storagePath);
        return;
      }
    }
  }
}
