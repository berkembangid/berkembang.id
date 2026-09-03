import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentOperationError,
} from "@/modules/documents/document-errors";
import {
  attachDocumentResultSchema,
  type AttachDocumentRequest,
  type AttachmentTargetType,
  type AttachmentView,
  type DetachDocumentRequest,
} from "@/modules/documents/attachment-schema";

/**
 * Menempelkan dokumen ke catatan akuntansi.
 *
 * Menempel ke sebuah transaksi ikut menempel ke alat atau pinjaman yang lahir
 * darinya; itu diputuskan RPC `attach_document`, bukan di sini. Layar tidak
 * perlu tahu bahwa pembelian kategori 8 melahirkan baris alat -- kalau ia
 * harus tahu, setiap layar baru harus mengingatnya lagi.
 */
export async function attachDocument(documentId: string, input: AttachDocumentRequest) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("attach_document", {
    p_document_id: documentId,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
  });
  if (error) throw documentOperationError(new Error(error.message));

  const payload = data as { document_id?: string; attachments?: unknown[] } | null;
  if (!payload?.document_id) throw new DocumentOperationError("INTERNAL_ERROR");
  return attachDocumentResultSchema.parse({
    documentId: payload.document_id,
    attachments: (payload.attachments ?? []).map((row) => {
      const link = row as { id: string; target_type: string; target_id: string };
      return { id: link.id, targetType: link.target_type, targetId: link.target_id };
    }),
  });
}

/** Melepas bukti. Barisnya tetap ada dengan alasannya; ini bukan penghapusan. */
export async function detachDocument(input: DetachDocumentRequest) {
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("detach_document", {
    p_attachment_id: input.attachmentId,
    p_reason: input.reason,
  });
  if (error) throw documentOperationError(new Error(error.message));
  return { id: input.attachmentId };
}

type AttachmentRow = {
  id: string;
  document_id: string;
  target_type: string;
  target_id: string;
  created_at: string;
  documents: { name: string; doc_type: string } | null;
};

function toView(row: AttachmentRow): AttachmentView {
  return {
    id: row.id,
    documentId: row.document_id,
    targetType: row.target_type as AttachmentTargetType,
    targetId: row.target_id,
    documentName: row.documents?.name ?? "Bukti",
    docType: row.documents?.doc_type ?? "nota",
    createdAt: row.created_at,
  };
}

const selection = "id,document_id,target_type,target_id,created_at,documents(name,doc_type)";

/**
 * Bukti yang menempel pada sekumpulan catatan sekaligus.
 *
 * Dibuat jamak sejak awal karena pemanggilnya adalah daftar: satu layar
 * riwayat menampilkan puluhan baris, dan menanyakan buktinya satu per satu
 * berarti puluhan permintaan untuk satu layar.
 */
export async function listAttachmentsForTargets(
  targetType: AttachmentTargetType,
  targetIds: readonly string[],
): Promise<AttachmentView[]> {
  if (targetIds.length === 0) return [];
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("document_attachments")
    .select(selection)
    .eq("target_type", targetType)
    .in("target_id", [...targetIds])
    .is("removed_at", null)
    .order("created_at", { ascending: true });
  if (error) throw documentOperationError(new Error(error.message));
  return (data as unknown as AttachmentRow[]).map(toView);
}

/** Semua tempat sebuah dokumen menempel, untuk layar lemari. */
export async function listAttachmentsForDocument(documentId: string): Promise<AttachmentView[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("document_attachments")
    .select(selection)
    .eq("document_id", documentId)
    .is("removed_at", null)
    .order("created_at", { ascending: true });
  if (error) throw documentOperationError(new Error(error.message));
  return (data as unknown as AttachmentRow[]).map(toView);
}

/**
 * Nota yang sudah diunggah tapi belum menempel ke mana-mana.
 *
 * Dipakai Pintu C: pemilik memotret nota lebih dulu lalu menempelkannya
 * belakangan, dan daftar inilah yang ditawarkan.
 */
export async function listUnattachedEvidence(limit = 20) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("documents")
    .select("id,name,doc_type,created_at,document_attachments(id,removed_at)")
    .eq("doc_class", "bukti_transaksi")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw documentOperationError(new Error(error.message));

  type Row = {
    id: string;
    name: string;
    doc_type: string;
    created_at: string;
    document_attachments: { id: string; removed_at: string | null }[] | null;
  };
  return (data as unknown as Row[])
    .filter((row) => !(row.document_attachments ?? []).some((link) => link.removed_at === null))
    .map((row) => ({
      id: row.id,
      name: row.name,
      docType: row.doc_type,
      createdAt: row.created_at,
    }));
}

/**
 * Apakah usaha ini punya bukti yang tertaut sama sekali.
 *
 * Dipakai catatan atas laporan keuangan: kalimat kebijakan bukti hanya boleh
 * dicetak bila buktinya memang ada. Menuliskannya pada laporan tanpa satu pun
 * lampiran adalah klaim yang tidak bisa ditunjukkan.
 */
export async function hasAnyEvidence(): Promise<boolean> {
  const client = await createServerSupabaseClient();
  const { count, error } = await client
    .from("document_attachments")
    .select("id", { count: "exact", head: true })
    .is("removed_at", null);
  if (error) throw documentOperationError(new Error(error.message));
  return (count ?? 0) > 0;
}
