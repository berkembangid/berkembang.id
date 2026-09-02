import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";
import {
  CaptureOperationError,
  captureOperationError,
} from "@/modules/ledger/capture-errors";
import {
  captureInputMethodSchema,
  captureStatusSchema,
  transactionDraftItemsSchema,
  type CreateCaptureRequest,
  type TransactionDraftItem,
} from "@/modules/ledger/capture-schema";

const createdCaptureSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  inputMethod: captureInputMethodSchema,
  status: captureStatusSchema,
  storagePath: z.string().nullable(),
  capturePath: z.enum(["TEXT_ONLY", "WHISPER"]).nullable().optional(),
  createdAt: z.string(),
  idempotent: z.boolean(),
});

const scheduledCaptureSchema = z.object({
  captureId: z.uuid(),
  jobId: z.uuid(),
  status: z.string(),
  idempotent: z.boolean(),
});

const confirmedCaptureSchema = z.object({
  captureId: z.uuid(),
  status: z.literal("confirmed"),
  transactionIds: z.array(z.uuid()),
  idempotent: z.boolean(),
});

const cancelledCaptureSchema = z.object({
  captureId: z.uuid(),
  status: z.literal("cancelled"),
  storagePath: z.string().nullable(),
  idempotent: z.boolean(),
});

export type CreatedCapture = z.infer<typeof createdCaptureSchema>;
export type ScheduledCapture = z.infer<typeof scheduledCaptureSchema>;
export type ConfirmedCapture = z.infer<typeof confirmedCaptureSchema>;
export type CancelledCapture = z.infer<typeof cancelledCaptureSchema>;

export type CaptureView = {
  id: string;
  businessId: string;
  inputMethod: "voice" | "manual";
  status: z.infer<typeof captureStatusSchema>;
  transcription: string | null;
  draft: TransactionDraftItem[];
  failure: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
};

export type CaptureUploadSession = {
  bucket: "captures";
  path: string;
  token: string;
  signedUrl: string;
  expiresInSeconds: 7200;
};

function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return null;
  if (error.code?.startsWith("22")) {
    return new CaptureOperationError("VALIDATION_FAILED", { cause: error });
  }
  return captureOperationError(new Error(error.message));
}

function parseRpcResult<T>(schema: z.ZodType<T>, value: Json | null): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CaptureOperationError("INTERNAL_ERROR", { cause: result.error });
  }
  return result.data;
}

export async function createCaptureRecord(
  input: CreateCaptureRequest,
  idempotencyKey: string,
  capturePath?: "TEXT_ONLY" | "WHISPER",
): Promise<CreatedCapture> {
  const client = await createServerSupabaseClient();
  const args: Database["public"]["Functions"]["create_transaction_capture"]["Args"] = {
    p_idempotency_key: idempotencyKey,
    p_input_method: input.inputMethod,
  };
  if (input.businessId) args.p_business_id = input.businessId;
  // Transkrip peramban disimpan sebagai teks sumber. Ia yang menjadi bahan
  // jalur TEXT_ONLY, dan tetap berguna sebagai pembanding pada jalur Whisper.
  const sourceText = input.sourceText ?? input.clientTranscript?.text;
  if (sourceText) args.p_source_text = sourceText;
  if (capturePath) args.p_capture_path = capturePath;
  if (input.file && capturePath !== "TEXT_ONLY") {
    args.p_mime_type = input.file.mimeType;
    args.p_file_size = input.file.size;
    if (input.file.checksumSha256) args.p_checksum_sha256 = input.file.checksumSha256;
  }

  const { data, error } = await client.rpc("create_transaction_capture", args);
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpcResult(createdCaptureSchema, data);
}

export async function createCaptureUploadSession(path: string): Promise<CaptureUploadSession> {
  try {
    const serviceClient = createServiceRoleClient();
    const { data, error } = await serviceClient.storage
      .from("captures")
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      throw new CaptureOperationError("SERVICE_UNAVAILABLE", { cause: error });
    }

    return {
      bucket: "captures",
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      expiresInSeconds: 7200,
    };
  } catch (error) {
    throw captureOperationError(error, "SERVICE_UNAVAILABLE");
  }
}

export async function scheduleCaptureProcessing(captureId: string): Promise<ScheduledCapture> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("schedule_capture_processing", {
    p_capture_id: captureId,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpcResult(scheduledCaptureSchema, data);
}

export async function getCaptureView(captureId: string): Promise<CaptureView> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("transaction_captures")
    .select(
      "id,business_id,input_method,status,transcription,draft_payload,failure_code,failure_message,created_at,updated_at,confirmed_at,cancelled_at",
    )
    .eq("id", captureId)
    .maybeSingle();

  if (error) throw new CaptureOperationError("SERVICE_UNAVAILABLE", { cause: error });
  if (!data) throw new CaptureOperationError("CAPTURE_NOT_FOUND");

  let draft: TransactionDraftItem[] = [];
  if (data.draft_payload !== null) {
    const parsedDraft = transactionDraftItemsSchema.safeParse(data.draft_payload);
    if (!parsedDraft.success) {
      throw new CaptureOperationError("INTERNAL_ERROR", { cause: parsedDraft.error });
    }
    draft = parsedDraft.data;
  }

  const inputMethod = captureInputMethodSchema.safeParse(data.input_method);
  const status = captureStatusSchema.safeParse(data.status);
  if (!inputMethod.success || !status.success) {
    throw new CaptureOperationError("INTERNAL_ERROR");
  }

  return {
    id: data.id,
    businessId: data.business_id,
    inputMethod: inputMethod.data,
    status: status.data,
    transcription: data.transcription,
    draft,
    failure:
      data.failure_code && data.failure_message
        ? { code: data.failure_code, message: data.failure_message }
        : null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    confirmedAt: data.confirmed_at,
    cancelledAt: data.cancelled_at,
  };
}

export async function confirmCaptureRecord(
  captureId: string,
  idempotencyKey: string,
  items: TransactionDraftItem[],
): Promise<ConfirmedCapture> {
  const client = await createServerSupabaseClient();
  const jsonItems = JSON.parse(JSON.stringify(items)) as Json;
  const { data, error } = await client.rpc("confirm_transaction_capture", {
    p_capture_id: captureId,
    p_confirmation_idempotency_key: idempotencyKey,
    p_items: jsonItems,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpcResult(confirmedCaptureSchema, data);
}

export async function cancelCaptureRecord(captureId: string): Promise<CancelledCapture> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("cancel_transaction_capture", {
    p_capture_id: captureId,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpcResult(cancelledCaptureSchema, data);
}

export async function removeCaptureUpload(path: string | null) {
  if (!path) return;
  try {
    const serviceClient = createServiceRoleClient();
    const { error } = await serviceClient.storage.from("captures").remove([path]);
    if (error) console.warn("Capture upload cleanup failed", { code: "CAPTURE_STORAGE_CLEANUP_FAILED" });
  } catch {
    console.warn("Capture upload cleanup failed", { code: "CAPTURE_STORAGE_CLEANUP_FAILED" });
  }
}
