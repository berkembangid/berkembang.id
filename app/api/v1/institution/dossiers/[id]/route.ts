import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { resolveInstitutionContext } from "@/modules/institution/dossier-repository";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

const disclaimer =
  "Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.";

/** Payload dossier blok §4: header + kesiapan + keuangan 6 bln + legalitas + kualitas + jejak. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const { id } = await context.params;
    const dossier = await resolveInstitutionContext(id, selectedInstitution(request));

    const readiness = (dossier.items.readiness ?? {}) as Record<string, unknown>;
    const financial = (dossier.items.financial_summary ?? {}) as Record<string, unknown>;
    const qris = (dossier.items.qris_history ?? {}) as Record<string, unknown>;
    const identity = (dossier.items.business_identity ?? {}) as Record<string, unknown>;

    const legalScopes = ["nib", "npwp", "owner_identity", "sector_certificates"] as const;
    const legalitas = legalScopes
      .filter((scope) => dossier.scopes.includes(scope))
      .map((scope) => ({ scope, ...(dossier.items[scope] ?? {}) }));

    const client = await createServerSupabaseClient();
    const [issuesResult, stateResult, missionResult] = await Promise.all([
      client.from("report_issues").select("id,document_uid,report_kind,period_from,period_to,created_at")
        .eq("audience", "institution").eq("institution_id", dossier.institutionId).order("created_at", { ascending: false }).limit(20),
      client.from("business_readiness_state").select("level,level_since,formula_version,updated_at").eq("business_id", dossier.businessId).maybeSingle(),
      client.from("business_missions").select("status").eq("business_id", dossier.businessId),
    ]);

    const missions = (missionResult.data ?? []) as Array<{ status: string }>;
    const completed = missions.filter((item) => item.status === "completed").length;

    return NextResponse.json({
      data: {
        header: {
          businessName: dossier.businessName,
          dossierId: dossier.dossierId,
          snapshotAt: dossier.snapshotAt,
          expiresAt: dossier.expiresAt,
          scopes: dossier.scopes,
          downloadAllowed: dossier.downloadAllowed,
          identity: dossier.scopes.includes("business_identity") ? identity : null,
        },
        readiness: {
          snapshot: readiness,
          state: stateResult.data ?? null,
          formulaVersion: (stateResult.data?.formula_version as string | undefined) ?? null,
        },
        financial6m: {
          summary: financial,
          activity: qris,
          note: "Angka ringkas dari snapshot yang dibekukan saat admin menyetujui. PDF lengkap memuat 6 bulan dari fungsi SQL yang sama.",
        },
        legalitas,
        legalitasNote: "Status ketersediaan dan keyakinan dokumen; file dan nomor lengkap tidak dibagikan. Keyakinan bukan jaminan keaslian.",
        dataQuality: {
          activeDays: (financial.activeDays as number | undefined) ?? null,
          transactionCount: (financial.transactionCount as number | undefined) ?? null,
          missionsCompleted: completed,
          missionsTotal: missions.length,
        },
        evidence: {
          note: "Persentase nilai belanja besar berbukti dan sumber input dihitung dari lampiran transaksi; lihat PDF untuk rincian 6 bulan.",
        },
        reportTrail: issuesResult.data ?? [],
        disclaimer,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
