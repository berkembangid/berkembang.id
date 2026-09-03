import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  reportStoragePath,
  type ReportIssueView,
} from "@/modules/accounting/report-issue";

/**
 * Menyimpan berkas yang baru diterbitkan, lalu mencatat penerbitannya.
 *
 * URUTANNYA DISENGAJA: bita dulu, catatan kemudian.
 *
 * Kegagalan mencatat hanya meninggalkan objek yatim yang tidak terlihat siapa
 * pun dan bisa ditulis ulang. Urutan sebaliknya meninggalkan baris arsip yang
 * menjanjikan berkas yang tidak pernah ada — dan pemilik baru mengetahuinya
 * berbulan-bulan kemudian, tepat ketika berkas itu diminta.
 *
 * Penerbitannya juga tidak pernah menggagalkan pengunduhan. Pemilik menekan
 * "Unduh laporan" untuk mendapatkan berkasnya; arsip adalah catatan kita, dan
 * kegagalan mencatat bukan alasan menahan berkas yang sudah jadi.
 */
export async function archiveIssuedReport(input: {
  userId: string;
  businessId: string;
  documentId: string;
  documentUid: string;
  reportKind: "pdf_sak_emkm" | "snapshot_dossier";
  name: string;
  bytes: Uint8Array;
  periodFrom?: string | null;
  periodTo?: string | null;
  audience?: "self" | "institution";
  institutionId?: string | null;
  formulaVersion?: string | null;
}): Promise<{ archived: boolean }> {
  const storagePath = reportStoragePath(input.userId, input.businessId, input.documentId);

  const digest = await crypto.subtle.digest("SHA-256", input.bytes as unknown as ArrayBuffer);
  const checksum = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  const admin = createServiceRoleClient();
  const upload = await admin.storage
    .from("documents")
    .upload(storagePath, input.bytes as unknown as ArrayBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upload.error) return { archived: false };

  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("record_report_issue", {
    p_document_id: input.documentId,
    p_document_uid: input.documentUid,
    p_report_kind: input.reportKind,
    p_storage_path: storagePath,
    p_file_size: input.bytes.byteLength,
    p_checksum_sha256: checksum,
    p_name: input.name,
    p_period_from: input.periodFrom ?? undefined,
    p_period_to: input.periodTo ?? undefined,
    p_audience: input.audience ?? "self",
    p_institution_id: input.institutionId ?? undefined,
    p_formula_version: input.formulaVersion ?? undefined,
  });
  if (error) {
    // Objek yatim dibersihkan supaya penerbitan berikutnya dengan id yang
    // sama tidak tertahan oleh berkas yang tidak pernah tercatat.
    await admin.storage.from("documents").remove([storagePath]);
    return { archived: false };
  }
  return { archived: true };
}

type IssueRow = {
  id: string;
  document_id: string | null;
  document_uid: string;
  report_kind: string;
  period_from: string | null;
  period_to: string | null;
  audience: string;
  created_at: string;
};

/** Daftar "Laporan yang pernah dibuat", terbaru lebih dulu. */
export async function listReportIssues(limit = 50): Promise<ReportIssueView[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("report_issues")
    .select("id,document_id,document_uid,report_kind,period_from,period_to,audience,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as IssueRow[]).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    documentUid: row.document_uid,
    reportKind: row.report_kind as ReportIssueView["reportKind"],
    periodFrom: row.period_from,
    periodTo: row.period_to,
    audience: row.audience as ReportIssueView["audience"],
    createdAt: row.created_at,
  }));
}
