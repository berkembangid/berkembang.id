import "server-only";

import type { StatementDocumentData } from "@/modules/accounting/statement-document";
import {
  renderFinancialStatementsPdf,
  type StatementWatermark,
} from "@/modules/accounting/statement-pdf";

export type DossierWatermark = StatementWatermark;

export async function renderInstitutionDossierPdf(
  data: StatementDocumentData,
  watermark: DossierWatermark,
): Promise<Uint8Array> {
  return renderFinancialStatementsPdf(data, watermark);
}

export function dossierFileName(businessName: string, documentUid: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "usaha";
  return `dossier-${slug}-${documentUid}.pdf`;
}

export const dossierDisclaimer =
  "Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.";
