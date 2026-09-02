import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { documentOperationError } from "@/modules/documents/document-errors";
import { sectorFromAnswer } from "@/modules/accounting/templates";
import type { AccountingSector } from "@/modules/accounting/coa";

/**
 * Kelengkapan dokumen per sektor, dibaca dari `document_requirements` (`0041`).
 *
 * Sebelum ini status wajib/disarankan ditulis tangan di dalam halaman Dokumen
 * sebagai `required: boolean`. Akibatnya NPWP tampil "Wajib" untuk semua orang,
 * padahal bagi usaha pangan olahan ia baru relevan saat penjualan setahun
 * mendekati Rp500 juta. Menyebut sesuatu wajib padahal tidak adalah cara
 * tercepat membuat pemilik berhenti percaya pada seluruh daftar.
 */
export type DocumentRequirementView = {
  docType: string;
  requirement: "wajib" | "disarankan";
  orderIndex: number;
  missionKey: string | null;
  note: string | null;
};

export type CabinetPayload = {
  sector: AccountingSector;
  bentukUsaha: "perorangan" | "badan_usaha";
  requirements: DocumentRequirementView[];
  /** Nota dan bukti yang menempel, dengan transaksi yang ditunjuknya. */
  evidence: {
    id: string;
    name: string;
    docType: string;
    createdAt: string;
    transactionId: string | null;
  }[];
};

export async function getCabinetPayload(userId: string): Promise<CabinetPayload> {
  const client = await createServerSupabaseClient();

  const profileResult = await client
    .from("profiles")
    .select("sektor_usaha,bentuk_usaha")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (profileResult.error) throw documentOperationError(new Error(profileResult.error.message));

  const sector = sectorFromAnswer(profileResult.data?.sektor_usaha);
  const bentukUsaha =
    profileResult.data?.bentuk_usaha === "badan_usaha" ? "badan_usaha" : "perorangan";

  const [requirementResult, evidenceResult] = await Promise.all([
    client
      .from("document_requirements")
      .select("doc_type,requirement,order_index,mission_key,note")
      .eq("sector", sector)
      .order("order_index", { ascending: true }),
    client
      .from("documents")
      .select("id,name,doc_type,created_at,document_attachments(target_type,target_id,removed_at)")
      .eq("doc_class", "bukti_transaksi")
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (requirementResult.error) throw documentOperationError(new Error(requirementResult.error.message));
  if (evidenceResult.error) throw documentOperationError(new Error(evidenceResult.error.message));

  type EvidenceRow = {
    id: string;
    name: string;
    doc_type: string;
    created_at: string;
    document_attachments: { target_type: string; target_id: string; removed_at: string | null }[] | null;
  };

  return {
    sector,
    bentukUsaha,
    requirements: (requirementResult.data ?? []).map((row) => ({
      docType: row.doc_type,
      requirement: row.requirement === "wajib" ? "wajib" : "disarankan",
      orderIndex: row.order_index,
      missionKey: row.mission_key,
      note: row.note,
    })),
    evidence: (evidenceResult.data as unknown as EvidenceRow[]).map((row) => {
      const live = (row.document_attachments ?? []).find(
        (link) => link.removed_at === null && link.target_type === "transaction",
      );
      return {
        id: row.id,
        name: row.name,
        docType: row.doc_type,
        createdAt: row.created_at,
        transactionId: live?.target_id ?? null,
      };
    }),
  };
}
