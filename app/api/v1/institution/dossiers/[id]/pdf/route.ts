import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { institutionHeader } from "@/lib/api/institution";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { buildDocumentUid } from "@/modules/accounting/report-issue";
import {
  buildDossierDocument,
  dossierFormulaVersion,
  resolveInstitutionContext,
} from "@/modules/institution/dossier-repository";
import { dossierFileName, dossierTemplateIssuedAt } from "@/modules/institution/dossier-file";
import { renderFinancialStatementsPdf } from "@/modules/accounting/statement-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const selected = institutionHeader(request);
    const dossier = await resolveInstitutionContext(id, selected);
    if (!dossier.downloadAllowed) throw new ConsentOperationError("DOWNLOAD_NOT_APPROVED");

    const client = withPortalRpc(await createServerSupabaseClient());

    /**
     * Gerbang unduhan, dijalankan SEBAGAI PENGGUNA sebelum satu bita pun
     * disajikan.
     *
     * Dulu panggilan ini berjalan lewat klien service role SESUDAH berkas
     * dikirim. Dengan service role `auth.uid()` kosong: pemeriksaan anggota di
     * dalam RPC gagal, peristiwanya tercatat sebagai "ditolak" tanpa pelaku,
     * dan log audit lembaga berisi unduhan tanpa nama. Jalur unduh-ulang
     * bahkan mengabaikan hasilnya sama sekali.
     *
     * Admin platform bukan anggota lembaga, jadi RPC ini selalu menolaknya;
     * aksesnya sudah diperiksa `resolveInstitutionContext`.
     */
    if (!dossier.isPlatformAdmin) {
      const { data: gate, error: gateError } = await client.rpc("access_verified_business_profile", {
        p_dossier_id: dossier.dossierId, p_resource_scope: "financial_summary", p_action: "download",
      });
      if (gateError) throw new ConsentOperationError("SERVICE_UNAVAILABLE", gateError);
      const verdict = (gate ?? {}) as { allowed?: boolean; code?: string };
      if (!verdict.allowed) {
        throw new ConsentOperationError(verdict.code === "DOWNLOAD_NOT_APPROVED" ? "DOWNLOAD_NOT_APPROVED" : "ACCESS_DENIED");
      }
    }

    const printedAt = new Date().toISOString();
    // Arsip dicari per dosir. Dulu yang dibaca 20 terbitan terakhir SE-LEMBAGA
    // lalu disaring di memori, jadi lembaga yang sibuk kehilangan arsipnya dan
    // setiap unduhan menerbitkan nomor dokumen baru.
    const { data: archivedRows } = await client
      .from("report_issues")
      .select("document_uid,document_id,created_at")
      .eq("audience", "institution")
      .eq("institution_id", dossier.institutionId)
      .eq("dossier_id", dossier.dossierId)
      .order("created_at", { ascending: false })
      .limit(1);
    const url = new URL(request.url);
    const forceFresh = url.searchParams.get("fresh") === "true" || url.searchParams.get("fresh") === "1";
    const archived = (archivedRows ?? [])[0] as { document_uid: string; document_id: string | null; created_at: string } | undefined;

    // Arsip disajikan apa adanya supaya satu nomor dokumen selalu berarti satu
    // berkas yang sama -- tetapi hanya selama ia masih menggambarkan keadaan.
    // Dua hal membuatnya kedaluwarsa: bahan dossier berubah (pemilik mengganti
    // nama usahanya, atau mengunggah dokumen baru), atau tampilan dossier
    // sendiri berubah. Keduanya menerbitkan dokumen baru bernomor baru pada
    // unduhan berikutnya; yang lama tetap tersimpan.
    const supersededAt = [dossier.sourceUpdatedAt, dossierTemplateIssuedAt]
      .map((value) => new Date(value).getTime())
      .reduce((a, b) => Math.max(a, b));
    const outdated = Boolean(archived && new Date(archived.created_at).getTime() < supersededAt);
    const match = forceFresh || outdated ? null : archived;
    const documentUid = match?.document_uid ?? buildDocumentUid(printedAt);
    const documentId = match?.document_id ?? crypto.randomUUID();

    // Unduh ulang menyajikan bita yang sama persis bila arsipnya ada.
    if (match?.document_id) {
      const storagePath = `${dossier.institutionId}/${dossier.businessId}/${match.document_id}/${match.document_id}.pdf`;
      const admin = createServiceRoleClient();
      const downloaded = await admin.storage.from("documents").download(storagePath);
      if (!downloaded.error && downloaded.data) {
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        return new Response(bytes as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${dossierFileName(dossier.businessName, documentUid)}"`,
            "X-Document-Uid": documentUid,
          },
        });
      }
    }

    const document = await buildDossierDocument(dossier, documentUid, printedAt);
    const pdf = await renderFinancialStatementsPdf(document, {
      institutionName: dossier.institutionName,
      memberLabel: dossier.memberLabel,
      downloadedAt: printedAt,
      documentUid,
    });

    const storagePath = `${dossier.institutionId}/${dossier.businessId}/${documentId}/${documentId}.pdf`;
    const admin = createServiceRoleClient();
    const upload = await admin.storage.from("documents").upload(storagePath, pdf as unknown as ArrayBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
    // Nomor dokumen dicatat sebagai pengguna: RPC ini menolak `auth.uid()`
    // kosong, dan dulu penolakan itu ditelan -- arsip tidak pernah tertulis.
    // Admin platform tidak mengarsipkan; ia bukan penerima dosir.
    if (!upload.error && !dossier.isPlatformAdmin) {
      const recorded = await client.rpc("record_institution_report_issue", {
        p_business_id: dossier.businessId,
        p_institution_id: dossier.institutionId,
        p_dossier_id: dossier.dossierId,
        p_document_id: documentId,
        p_document_uid: documentUid,
        p_report_kind: "pdf_sak_emkm",
        p_storage_path: storagePath,
        p_file_size: pdf.byteLength,
        p_checksum_sha256: await sha256Hex(pdf),
        p_name: dossierFileName(dossier.businessName, documentUid),
        p_period_from: document.period.from,
        p_period_to: document.period.to,
        p_formula_version: dossierFormulaVersion(),
      });
      if (recorded.error) console.error("[dossier pdf] arsip tidak tercatat:", recorded.error.message);
    }

    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${dossierFileName(dossier.businessName, documentUid)}"`,
        "X-Document-Uid": documentUid,
      },
    });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
