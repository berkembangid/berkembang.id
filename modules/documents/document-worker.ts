import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  createDocumentExtractionProviders,
  DocumentProviderError,
  type DocumentExtractionProvider,
} from "@/modules/documents/document-extractors";
import {
  documentMimeTypeSchema,
  documentTypeSchema,
  supportsDocumentOcr,
} from "@/modules/documents/document-schema";
import type { Json } from "@/types/database.generated";

const claimedJobSchema = z.object({
  jobId: z.uuid(),
  runId: z.uuid(),
  attemptNumber: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  documentId: z.uuid(),
  documentVersionId: z.uuid(),
  businessId: z.uuid(),
  requestedBy: z.uuid().nullable(),
  docType: documentTypeSchema,
  storagePath: z.string(),
  mimeType: documentMimeTypeSchema,
  fileSize: z.number().int().positive(),
});

type ClaimedJob = z.infer<typeof claimedJobSchema>;

export interface DocumentWorkerRepository {
  getDocumentType(jobId: string): Promise<z.infer<typeof documentTypeSchema> | null>;
  hasOcrConsent(jobId: string): Promise<boolean>;
  claim(jobId: string, workerId: string, provider: string, model: string): Promise<ClaimedJob | null>;
  download(path: string): Promise<Uint8Array>;
  complete(jobId: string, attempt: number, extractor: string, data: Json, latencyMs: number): Promise<void>;
  fail(jobId: string, attempt: number, code: string, message: string, retryable: boolean, latencyMs: number): Promise<{ retry: boolean }>;
}

function createWorkerRepository(): DocumentWorkerRepository {
  const client = createServiceRoleClient();
  return {
    async getDocumentType(jobId) {
      const job = await client.from("ai_jobs").select("document_version_id").eq("id", jobId).eq("job_type", "document_extraction").maybeSingle();
      if (job.error || !job.data?.document_version_id) return null;
      const version = await client.from("document_versions").select("document_id").eq("id", job.data.document_version_id).maybeSingle();
      if (version.error || !version.data) return null;
      const document = await client.from("documents").select("doc_type").eq("id", version.data.document_id).maybeSingle();
      const parsed = documentTypeSchema.safeParse(document.data?.doc_type);
      return parsed.success ? parsed.data : null;
    },
    async hasOcrConsent(jobId) {
      const job = await client.from("ai_jobs").select("document_version_id").eq("id", jobId).eq("job_type", "document_extraction").maybeSingle();
      if (job.error || !job.data?.document_version_id) return false;
      const version = await client.from("document_versions").select("storage_path").eq("id", job.data.document_version_id).maybeSingle();
      if (version.error || !version.data) return false;
      const session = await client
        .from("document_upload_sessions")
        .select("ocr_consent_at")
        .eq("storage_path", version.data.storage_path)
        .maybeSingle();
      return !session.error && Boolean(session.data?.ocr_consent_at);
    },
    async claim(jobId, workerId, provider, model) {
      const { data, error } = await client.rpc("claim_document_extraction_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_provider: provider,
        p_model: model,
      });
      if (error) throw new Error("DOCUMENT_JOB_CLAIM_FAILED", { cause: error });
      if (data === null) return null;
      const parsed = claimedJobSchema.safeParse(data);
      if (!parsed.success) throw new Error("DOCUMENT_JOB_INVALID", { cause: parsed.error });
      return parsed.data;
    },
    async download(path) {
      const { data, error } = await client.storage.from("documents").download(path);
      if (error || !data) throw new Error("DOCUMENT_DOWNLOAD_FAILED", { cause: error });
      return new Uint8Array(await data.arrayBuffer());
    },
    async complete(jobId, attempt, extractor, data, latencyMs) {
      const { error } = await client.rpc("complete_document_extraction_job", {
        p_job_id: jobId,
        p_attempt_number: attempt,
        p_extractor: extractor,
        p_structured_data: data,
        p_latency_ms: latencyMs,
      });
      if (error) throw new Error("DOCUMENT_JOB_COMPLETE_FAILED", { cause: error });
    },
    async fail(jobId, attempt, code, message, retryable, latencyMs) {
      const { data, error } = await client.rpc("fail_document_extraction_job", {
        p_job_id: jobId,
        p_attempt_number: attempt,
        p_failure_code: code.slice(0, 80),
        p_failure_message: message.slice(0, 240),
        p_retryable: retryable,
        p_latency_ms: latencyMs,
      });
      if (error) throw new Error("DOCUMENT_JOB_FAIL_FAILED", { cause: error });
      const parsed = z.object({ retry: z.boolean() }).safeParse(data);
      if (!parsed.success) throw new Error("DOCUMENT_JOB_INVALID", { cause: parsed.error });
      return parsed.data;
    },
  };
}

const manualProvider: DocumentExtractionProvider = {
  name: "manual-review",
  model: "manual-review-v1",
  async extractDocument() {
    throw new DocumentProviderError("Ekstraksi otomatis tidak tersedia; dokumen menunggu pemeriksaan manual.", false);
  },
};

export async function processDocumentExtractionJob(
  jobId: string,
  dependencies?: {
    repository?: DocumentWorkerRepository;
    providers?: DocumentExtractionProvider[];
    workerId?: string;
  },
) {
  const repository = dependencies?.repository ?? createWorkerRepository();
  const docType = await repository.getDocumentType(jobId);
  if (!docType) return;
  const workerId = dependencies?.workerId ?? `next-after-${crypto.randomUUID()}`;

  if (!supportsDocumentOcr(docType)) {
    const claimed = await repository.claim(jobId, workerId, "metadata", "document-metadata-v1");
    if (!claimed) return;
    const startedAt = Date.now();
    try {
      await repository.complete(
        jobId,
        claimed.attemptNumber,
        "metadata",
        { documentType: docType, automatedExtraction: "not_required" },
        Date.now() - startedAt,
      );
    } catch {
      await repository.fail(
        jobId,
        claimed.attemptNumber,
        "DOCUMENT_METADATA_FINALIZATION_FAILED",
        "Pemrosesan metadata belum berhasil; dokumen tersimpan dan menunggu pemeriksaan manual.",
        false,
        Date.now() - startedAt,
      );
    }
    return;
  }

  if (!await repository.hasOcrConsent(jobId)) {
    const claimed = await repository.claim(jobId, workerId, "consent-gate", "document-consent-v1");
    if (!claimed) return;
    await repository.fail(
      jobId,
      claimed.attemptNumber,
      "DOCUMENT_OCR_CONSENT_REQUIRED",
      "Dokumen tersimpan, tetapi OCR tidak dijalankan karena persetujuan pemrosesan belum tercatat.",
      false,
      0,
    );
    return;
  }

  const providers = dependencies?.providers ?? createDocumentExtractionProviders();
  const attempts = providers.length > 0 ? providers.slice(0, 3) : [manualProvider];
  for (let index = 0; index < attempts.length; index += 1) {
    const provider = attempts[index];
    const claimed = await repository.claim(jobId, workerId, provider.name, provider.model);
    if (!claimed) return;
    const startedAt = Date.now();
    try {
      const bytes = await repository.download(claimed.storagePath);
      if (bytes.byteLength !== claimed.fileSize) throw new DocumentProviderError("Ukuran file tersimpan tidak sesuai.", false);
      const extracted = await provider.extractDocument({
        bytes,
        mimeType: claimed.mimeType,
        docType,
      });
      await repository.complete(
        jobId,
        claimed.attemptNumber,
        provider.name,
        extracted as unknown as Json,
        Date.now() - startedAt,
      );
      return;
    } catch (error) {
      const providerError = error instanceof DocumentProviderError
        ? error
        : new DocumentProviderError("Ekstraksi dokumen belum berhasil.", true, error);
      const retryable = providerError.retryable && index < attempts.length - 1;
      const result = await repository.fail(
        jobId,
        claimed.attemptNumber,
        providerError.message.includes("TIMEOUT") ? "DOCUMENT_PROVIDER_TIMEOUT" : "DOCUMENT_EXTRACTION_FAILED",
        providerError.retryable
          ? "Ekstraksi otomatis belum berhasil. Sistem akan mencoba provider berikutnya atau menunggu pemeriksaan manual."
          : providerError.message,
        retryable,
        Date.now() - startedAt,
      );
      if (!result.retry) return;
    }
  }
}
