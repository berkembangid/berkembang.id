import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentOperationError,
} from "@/modules/documents/document-errors";
import {
  documentMimeTypeSchema,
  parseDocumentOcrResult,
  documentStatusSchema,
  documentTypeSchema,
  matchesDocumentMagic,
  supportsDocumentOcr,
  type CreateDocumentUploadSessionRequest,
  type DocumentStatus,
  type DocumentType,
} from "@/modules/documents/document-schema";
import type { Database, Json } from "@/types/database.generated";

const uploadReservationSchema = z.object({
  sessionId: z.uuid(),
  documentId: z.uuid(),
  businessId: z.uuid(),
  docType: documentTypeSchema,
  originalName: z.string(),
  version: z.number().int().positive(),
  storagePath: z.string(),
  mimeType: documentMimeTypeSchema,
  fileSize: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "completed", "rejected", "expired"]),
  expiresAt: z.string(),
  idempotent: z.boolean(),
});

const completedVersionSchema = z.object({
  documentId: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  status: z.literal("processing"),
  jobId: z.uuid(),
  idempotent: z.boolean(),
});

const archivedDocumentSchema = z.object({
  documentId: z.uuid(),
  status: z.literal("superseded"),
  idempotent: z.boolean(),
});

const confirmedExtractionSchema = z.object({
  documentId: z.uuid(),
  documentVersionId: z.uuid(),
  reviewStatus: z.enum(["owner_confirmed", "owner_corrected"]),
  confirmedAt: z.string(),
});

const retriedExtractionSchema = z.object({
  documentId: z.uuid(),
  documentVersionId: z.uuid(),
  jobId: z.uuid(),
  status: z.literal("queued"),
});

export type DocumentUploadReservation = z.infer<typeof uploadReservationSchema>;
export type CompletedDocumentVersion = z.infer<typeof completedVersionSchema>;
export type ArchivedDocument = z.infer<typeof archivedDocumentSchema>;
export type ConfirmedDocumentExtraction = z.infer<typeof confirmedExtractionSchema>;
export type RetriedDocumentExtraction = z.infer<typeof retriedExtractionSchema>;

export type DocumentUploadSession = DocumentUploadReservation & {
  upload: {
    bucket: "documents";
    path: string;
    token: string;
    signedUrl: string;
    expiresInSeconds: 7200;
  };
};

export type DocumentVersionView = {
  id: string;
  version: number;
  originalName: string | null;
  status: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string | null;
  createdAt: string;
  extraction: {
    status: string;
    structuredData: Json | null;
    ownerReviewStatus: string;
    confirmedData: Json | null;
    ownerConfirmedAt: string | null;
    failureCode: string | null;
    failureMessage: string | null;
  } | null;
  verification: { status: string; notes: string | null; verifiedAt: string | null } | null;
};

export type CurrentDocumentExtractionView = {
  versionId: string;
  status: string;
  extractor: string | null;
  ownerReviewStatus: string;
  ownerConfirmedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type DocumentView = {
  id: string;
  businessId: string | null;
  name: string;
  docType: DocumentType;
  status: DocumentStatus;
  currentVersion: number;
  mimeType: string | null;
  fileSize: number | null;
  checksumSha256: string | null;
  notes: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Rak tempat dokumen ini berada (`0041`). */
  docClass: string | null;
  /** Metadata izin, ditampilkan di kartu rak "Izin usaha" (`0041`). */
  docNumber: string | null;
  issuer: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  assuranceLevel: string;
  needsClassReview: boolean;
  /**
   * Dokumen tanpa berkas adalah nomor yang diketik pemilik, bukan izin yang
   * sudah difoto. Layar harus bisa membedakannya, dan mesin kesiapan tidak
   * menghitungnya (`0045`).
   */
  hasFile: boolean;
  currentExtraction: CurrentDocumentExtractionView | null;
  versions: DocumentVersionView[];
};

function parseRpc<T>(schema: z.ZodType<T>, value: Json | null) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DocumentOperationError("INTERNAL_ERROR", { cause: parsed.error });
  return parsed.data;
}

function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return null;
  return documentOperationError(new Error(error.message), error.code?.startsWith("22") ? "VALIDATION_FAILED" : "INTERNAL_ERROR");
}

async function markUploadRejected(sessionId: string, code: string, reason: string) {
  try {
    const admin = createServiceRoleClient();
    await admin.rpc("reject_document_upload_session", {
      p_session_id: sessionId,
      p_rejection_code: code,
      p_rejection_reason: reason,
    });
  } catch {
    console.warn("Document upload rejection could not be recorded", { code: "DOCUMENT_REJECTION_AUDIT_FAILED" });
  }
}

async function removeUpload(path: string) {
  try {
    const admin = createServiceRoleClient();
    await admin.storage.from("documents").remove([path]);
  } catch {
    console.warn("Invalid document cleanup failed", { code: "DOCUMENT_STORAGE_CLEANUP_FAILED" });
  }
}

export async function createDocumentUploadSessionRecord(
  input: CreateDocumentUploadSessionRequest,
  idempotencyKey: string,
): Promise<DocumentUploadSession> {
  const client = await createServerSupabaseClient();
  const args: Database["public"]["Functions"]["create_document_upload_session"]["Args"] = {
    p_idempotency_key: idempotencyKey,
    p_doc_type: input.docType,
    p_original_name: input.file.name,
    p_mime_type: input.file.mimeType,
    p_file_size: input.file.size,
    p_checksum_sha256: input.file.checksumSha256,
  };
  if (input.businessId) args.p_business_id = input.businessId;
  if (input.documentId) args.p_document_id = input.documentId;

  const { data, error } = await client.rpc("create_document_upload_session", args);
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  const reservation = parseRpc(uploadReservationSchema, data);
  if (reservation.status !== "pending") {
    throw new DocumentOperationError("DOCUMENT_UPLOAD_SESSION_INVALID");
  }

  if (supportsDocumentOcr(input.docType)) {
    if (!input.ocrConsent) throw new DocumentOperationError("DOCUMENT_OCR_CONSENT_REQUIRED");
    const { error: consentError } = await client.rpc("record_document_ocr_consent", {
      p_session_id: reservation.sessionId,
    });
    const consentOperationError = rpcError(consentError);
    if (consentOperationError) {
      await markUploadRejected(reservation.sessionId, "OCR_CONSENT_FAILED", "Persetujuan OCR belum dapat dicatat.");
      throw consentOperationError;
    }
  }

  try {
    const admin = createServiceRoleClient();
    const { data: upload, error: uploadError } = await admin.storage
      .from("documents")
      .createSignedUploadUrl(reservation.storagePath, { upsert: false });
    if (uploadError || !upload) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: uploadError });
    return {
      ...reservation,
      upload: {
        bucket: "documents",
        path: upload.path,
        token: upload.token,
        signedUrl: upload.signedUrl,
        expiresInSeconds: 7200,
      },
    };
  } catch (error) {
    await markUploadRejected(reservation.sessionId, "SIGNED_UPLOAD_FAILED", "Sesi unggah privat belum dapat dibuat.");
    throw documentOperationError(error, "SERVICE_UNAVAILABLE");
  }
}

async function getPendingUploadSession(documentId: string, sessionId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("document_upload_sessions")
    .select("id,document_id,storage_path,mime_type,file_size,checksum_sha256,status,expires_at")
    .eq("id", sessionId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: error });
  if (!data) throw new DocumentOperationError("DOCUMENT_UPLOAD_SESSION_NOT_FOUND");
  if (data.status === "completed") return data;
  if (data.status !== "pending") throw new DocumentOperationError("DOCUMENT_UPLOAD_SESSION_INVALID");
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new DocumentOperationError("DOCUMENT_UPLOAD_SESSION_EXPIRED");
  }
  return data;
}

export async function completeDocumentVersionRecord(
  documentId: string,
  sessionId: string,
): Promise<CompletedDocumentVersion> {
  const session = await getPendingUploadSession(documentId, sessionId);
  if (session.status !== "completed") {
    const mimeType = documentMimeTypeSchema.parse(session.mime_type);
    let bytes: Uint8Array;
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin.storage.from("documents").download(session.storage_path);
      if (error || !data) throw new DocumentOperationError("DOCUMENT_OBJECT_NOT_FOUND", { cause: error });
      bytes = new Uint8Array(await data.arrayBuffer());
    } catch (error) {
      throw documentOperationError(error, "DOCUMENT_OBJECT_NOT_FOUND");
    }

    if (bytes.byteLength !== session.file_size) {
      await markUploadRejected(session.id, "FILE_SIZE_MISMATCH", "Ukuran file hasil unggah tidak sesuai metadata awal.");
      await removeUpload(session.storage_path);
      throw new DocumentOperationError("CHECKSUM_MISMATCH");
    }
    if (!matchesDocumentMagic(bytes, mimeType)) {
      await markUploadRejected(session.id, "FILE_SIGNATURE_MISMATCH", "Isi file tidak sesuai format yang dipilih.");
      await removeUpload(session.storage_path);
      throw new DocumentOperationError("FILE_SIGNATURE_MISMATCH");
    }
    const checksumInput = new Uint8Array(bytes.byteLength);
    checksumInput.set(bytes);
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", checksumInput.buffer)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (checksum !== session.checksum_sha256) {
      await markUploadRejected(session.id, "CHECKSUM_MISMATCH", "Checksum file hasil unggah tidak cocok.");
      await removeUpload(session.storage_path);
      throw new DocumentOperationError("CHECKSUM_MISMATCH");
    }
  }

  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("complete_document_upload_session", {
    p_document_id: documentId,
    p_session_id: sessionId,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpc(completedVersionSchema, data);
}

function parseDocumentBase(
  row: Database["public"]["Tables"]["documents"]["Row"],
): Omit<DocumentView, "versions" | "currentExtraction"> {
  const docType = documentTypeSchema.safeParse(row.doc_type);
  const status = documentStatusSchema.safeParse(row.status);
  if (!docType.success || !status.success) throw new DocumentOperationError("INTERNAL_ERROR");
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    docType: docType.data,
    status: status.data,
    currentVersion: row.current_version,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksumSha256: row.checksum_sha256,
    notes: row.ai_notes,
    rejectionCode: row.rejection_code,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    docClass: row.doc_class,
    docNumber: row.doc_number,
    issuer: row.issuer,
    issuedOn: row.issued_on,
    validUntil: row.valid_until,
    assuranceLevel: row.assurance_level,
    needsClassReview: row.needs_class_review,
    hasFile: row.storage_path !== null,
  };
}

export async function listDocumentRecords(): Promise<DocumentView[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("documents")
    .select("*")
    .neq("status", "superseded")
    .order("updated_at", { ascending: false });
  if (error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: error });
  const documents = data ?? [];
  if (documents.length === 0) return [];
  const documentIds = documents.map((document) => document.id);
  const versionsResult = await client
    .from("document_versions")
    .select("id,document_id,version")
    .in("document_id", documentIds);
  if (versionsResult.error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: versionsResult.error });
  const currentVersions = (versionsResult.data ?? []).filter((version) => {
    const document = documents.find((item) => item.id === version.document_id);
    return document?.current_version === version.version;
  });
  const versionIds = currentVersions.map((version) => version.id);
  const extractionsResult = versionIds.length > 0
    ? await client
        .from("document_extractions")
        .select("document_version_id,status,extractor,owner_review_status,owner_confirmed_at,failure_code,failure_message")
        .in("document_version_id", versionIds)
    : { data: [], error: null };
  if (extractionsResult.error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: extractionsResult.error });
  const extractionByVersion = new Map(
    (extractionsResult.data ?? []).map((extraction) => [extraction.document_version_id, extraction]),
  );
  const versionByDocument = new Map(currentVersions.map((version) => [version.document_id, version]));
  return documents.map((row) => {
    const version = versionByDocument.get(row.id);
    const extraction = version ? extractionByVersion.get(version.id) : null;
    return {
      ...parseDocumentBase(row),
      currentExtraction: version && extraction ? {
        versionId: version.id,
        status: extraction.status,
        extractor: extraction.extractor,
        ownerReviewStatus: extraction.owner_review_status,
        ownerConfirmedAt: extraction.owner_confirmed_at,
        failureCode: extraction.failure_code,
        failureMessage: extraction.failure_message,
      } : null,
      versions: [],
    };
  });
}

export async function getDocumentRecord(documentId: string): Promise<DocumentView> {
  const client = await createServerSupabaseClient();
  const documentResult = await client.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (documentResult.error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: documentResult.error });
  if (!documentResult.data) throw new DocumentOperationError("DOCUMENT_NOT_FOUND");
  const documentRow = documentResult.data;

  const versionsResult = await client
    .from("document_versions")
    .select("id,version,original_name,status,mime_type,file_size,checksum_sha256,created_at")
    .eq("document_id", documentId)
    .order("version", { ascending: false });
  if (versionsResult.error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: versionsResult.error });
  const versionIds = (versionsResult.data ?? []).map((version) => version.id);
  const [extractionsResult, verificationsResult] = versionIds.length > 0
    ? await Promise.all([
        client.from("document_extractions").select("document_version_id,status,extractor,structured_data,owner_review_status,confirmed_data,owner_confirmed_at,failure_code,failure_message").in("document_version_id", versionIds),
        client.from("document_verifications").select("document_version_id,status,notes,verified_at").in("document_version_id", versionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (extractionsResult.error || verificationsResult.error) {
    throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: extractionsResult.error ?? verificationsResult.error });
  }
  const extractions = new Map((extractionsResult.data ?? []).map((item) => [item.document_version_id, item]));
  const verifications = new Map((verificationsResult.data ?? []).map((item) => [item.document_version_id, item]));
  const versions: DocumentVersionView[] = (versionsResult.data ?? []).map((version) => {
    const extraction = extractions.get(version.id);
    const verification = verifications.get(version.id);
    return {
      id: version.id,
      version: version.version,
      originalName: version.original_name,
      status: version.status,
      mimeType: version.mime_type,
      fileSize: version.file_size,
      checksumSha256: version.checksum_sha256,
      createdAt: version.created_at,
      extraction: extraction ? {
        status: extraction.status,
        structuredData: extraction.structured_data,
        ownerReviewStatus: extraction.owner_review_status,
        confirmedData: extraction.confirmed_data,
        ownerConfirmedAt: extraction.owner_confirmed_at,
        failureCode: extraction.failure_code,
        failureMessage: extraction.failure_message,
      } : null,
      verification: verification ? {
        status: verification.status,
        notes: verification.notes,
        verifiedAt: verification.verified_at,
      } : null,
    };
  });
  const currentVersion = versions.find((version) => version.version === documentRow.current_version);
  return {
    ...parseDocumentBase(documentRow),
    currentExtraction: currentVersion?.extraction ? {
      versionId: currentVersion.id,
      status: currentVersion.extraction.status,
      extractor: extractions.get(currentVersion.id)?.extractor ?? null,
      ownerReviewStatus: currentVersion.extraction.ownerReviewStatus,
      ownerConfirmedAt: currentVersion.extraction.ownerConfirmedAt,
      failureCode: currentVersion.extraction.failureCode,
      failureMessage: currentVersion.extraction.failureMessage,
    } : null,
    versions,
  };
}

export async function confirmDocumentExtractionRecord(
  documentId: string,
  documentVersionId: string,
  value: unknown,
): Promise<ConfirmedDocumentExtraction> {
  const client = await createServerSupabaseClient();
  const { data: document, error: documentError } = await client
    .from("documents")
    .select("doc_type")
    .eq("id", documentId)
    .maybeSingle();
  if (documentError) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: documentError });
  if (!document) throw new DocumentOperationError("DOCUMENT_NOT_FOUND");
  const docType = documentTypeSchema.safeParse(document.doc_type);
  if (!docType.success || !supportsDocumentOcr(docType.data)) {
    throw new DocumentOperationError("DOCUMENT_OCR_NOT_SUPPORTED");
  }
  let confirmedData;
  try {
    confirmedData = parseDocumentOcrResult(docType.data, value);
  } catch (error) {
    throw new DocumentOperationError("DOCUMENT_EXTRACTION_CONFIRMATION_INVALID", { cause: error });
  }
  const { data, error } = await client.rpc("confirm_document_extraction", {
    p_document_id: documentId,
    p_document_version_id: documentVersionId,
    p_confirmed_data: confirmedData as unknown as Json,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpc(confirmedExtractionSchema, data);
}

export async function createDocumentDownloadUrl(documentId: string, userId: string) {
  const client = await createServerSupabaseClient();
  const { data: document, error } = await client
    .from("documents")
    .select("id,business_id,storage_path,status")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: error });
  if (!document?.storage_path) throw new DocumentOperationError("DOCUMENT_NOT_FOUND");
  if (document.status === "superseded") throw new DocumentOperationError("DOCUMENT_ARCHIVED");

  const admin = createServiceRoleClient();
  const { data: signed, error: signedError } = await admin.storage
    .from("documents")
    .createSignedUrl(document.storage_path, 60);
  if (signedError || !signed?.signedUrl) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: signedError });
  const { error: auditError } = await admin.from("audit_events").insert({
    actor_user_id: userId,
    actor_type: "business_owner",
    business_id: document.business_id,
    action: "CREATE_DOCUMENT_SIGNED_URL",
    target_type: "document",
    target_id: document.id,
    status: "success",
    metadata: { ttl_seconds: 60 },
  });
  if (auditError) throw new DocumentOperationError("SERVICE_UNAVAILABLE", { cause: auditError });
  return { signedUrl: signed.signedUrl, expiresInSeconds: 60 as const };
}

export async function archiveDocumentRecord(documentId: string): Promise<ArchivedDocument> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("archive_document", { p_document_id: documentId });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpc(archivedDocumentSchema, data);
}

export async function retryDocumentExtractionRecord(documentId: string): Promise<RetriedDocumentExtraction> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("retry_document_extraction", { p_document_id: documentId });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return parseRpc(retriedExtractionSchema, data);
}
