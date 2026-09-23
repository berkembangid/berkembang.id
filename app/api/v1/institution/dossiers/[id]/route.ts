import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { resolveInstitutionContext } from "@/modules/institution/dossier-repository";
import { institutionHeader } from "@/lib/api/institution";

const disclaimer =
  "Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.";

/** Payload dossier blok §4: header + kesiapan + keuangan 6 bln + legalitas + kualitas + jejak. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const { id } = await context.params;
    const dossier = await resolveInstitutionContext(id, institutionHeader(request));

    // Membuka detail dosir dicatat SEBAGAI PENGGUNA. Dulu rute ini membaca
    // semuanya lewat service role tanpa satu panggilan akses pun, jadi tatapan
    // paling rinci di portal ini -- keuangan, legalitas, identitas -- tidak
    // pernah muncul di log audit organisasi maupun di jejak yang dilihat
    // pemilik usaha. Trigger `0055` meneruskan peristiwa ini ke log audit.
    if (!dossier.isPlatformAdmin && dossier.scopes.length > 0) {
      const client = withPortalRpc(await createServerSupabaseClient());
      const { data: gate } = await client.rpc("access_verified_business_profile", {
        p_dossier_id: dossier.dossierId, p_resource_scope: dossier.scopes[0], p_action: "view",
      });
      if ((gate as { allowed?: boolean } | null)?.allowed === false) throw new ConsentOperationError("ACCESS_DENIED");
    }

    const readiness = (dossier.items.readiness ?? {}) as Record<string, unknown>;
    const financial = (dossier.items.financial_summary ?? {}) as Record<string, unknown>;
    const qris = (dossier.items.qris_history ?? {}) as Record<string, unknown>;
    // Identitas hidup, bukan potret: layar lembaga dan PDF harus menyebut nama
    // yang sama, dan potret membeku sejak izin disetujui.

    const legalScopes = ["nib", "npwp", "owner_identity", "sector_certificates"] as const;
    const legalitas = legalScopes
      .filter((scope) => dossier.scopes.includes(scope))
      .map((scope) => ({ scope, ...(dossier.items[scope] ?? {}) }));

    const admin = createServiceRoleClient();
    const [issuesResult, stateResult, missionResult] = await Promise.all([
      admin.from("report_issues").select("id,document_uid,report_kind,period_from,period_to,created_at")
        // Per dosir. Dulu disaring per lembaga saja, sehingga jejak satu
        // dosir memperlihatkan nomor dokumen milik usaha-usaha lain.
        .eq("audience", "institution").eq("institution_id", dossier.institutionId).eq("dossier_id", dossier.dossierId)
        .order("created_at", { ascending: false }).limit(20),
      admin.from("business_readiness_state").select("level,level_since,formula_version,updated_at").eq("business_id", dossier.businessId).maybeSingle(),
      admin.from("business_missions").select("status").eq("business_id", dossier.businessId),
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
          identity: dossier.scopes.includes("business_identity") ? dossier.identity : null,
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
        legalitasNote: "Status dan keyakinan dokumen. Pindaian beserta nomornya ikut tercetak di dossier PDF yang diunduh. Keyakinan bukan jaminan keaslian.",
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
