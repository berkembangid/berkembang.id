import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { buildDocumentUid } from "@/modules/accounting/report-issue";
import {
  buildDossierDocument,
  dossierFormulaVersion,
  resolveInstitutionContext,
} from "@/modules/institution/dossier-repository";
import { dossierFileName, renderInstitutionDossierPdf } from "@/modules/institution/dossier-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const selected = selectedInstitution(request);
    const dossier = await resolveInstitutionContext(id, selected);
    if (!dossier.downloadAllowed) throw new ConsentOperationError("DOWNLOAD_NOT_APPROVED");

    const client = withPortalRpc(await createServerSupabaseClient());
    const { data: existing } = await client
      .from("report_issues")
      .select("document_uid,document_id")
      .eq("audience", "institution")
      .eq("institution_id", dossier.institutionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const printedAt = new Date().toISOString();
    const existingRow = existing as unknown as { document_uid: string; document_id: string | null } | null;
    // Baris arsip dihubungkan ke dossier lewat RPC record (kolom dossier_id
    // ada setelah migrasi 0058). Filter dossier dilakukan di memori supaya
    // select tetap valid pada DB yang belum dimigrasi.
    const { data: dossierIssues } = await client
      .from("report_issues")
      .select("document_uid,document_id,dossier_id" as never)
      .eq("audience", "institution")
      .eq("institution_id", dossier.institutionId)
      .order("created_at", { ascending: false })
      .limit(20);
    const url = new URL(request.url);
    const forceFresh = url.searchParams.get("fresh") === "true" || url.searchParams.get("fresh") === "1";
    const match = forceFresh
      ? null
      : ((dossierIssues ?? []) as unknown as Array<{ document_uid: string; document_id: string | null; dossier_id?: string | null }>)
          .find((row) => row.dossier_id === dossier.dossierId);
    const documentUid = match?.document_uid ?? buildDocumentUid(printedAt);
    const documentId = match?.document_id ?? crypto.randomUUID();

    // Unduh ulang menyajikan bita yang sama persis bila arsipnya ada.
    if (match?.document_id) {
      const storagePath = `${dossier.institutionId}/${dossier.businessId}/${match.document_id}/${match.document_id}.pdf`;
      const admin = createServiceRoleClient();
      const downloaded = await admin.storage.from("documents").download(storagePath);
      if (!downloaded.error && downloaded.data) {
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        await client.rpc("access_verified_business_profile", {
          p_dossier_id: dossier.dossierId, p_resource_scope: "financial_summary", p_action: "download",
        });
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
    const pdf = await renderInstitutionDossierPdf(document, {
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
    if (!upload.error) {
      await admin.rpc("record_institution_report_issue" as never, {
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
      } as never);
    }

    await admin.rpc("access_verified_business_profile" as never, {
      p_dossier_id: dossier.dossierId, p_resource_scope: "financial_summary", p_action: "download",
    } as never);

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
    console.error("[institution/dossiers/[id]/pdf GET ERROR]", error);
    return consentErrorResponse(error);
  }
}
