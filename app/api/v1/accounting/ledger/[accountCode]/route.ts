import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { accountCodeSchema, generalLedgerQuerySchema } from "@/modules/accounting/accounting-schema";
import { ensurePeriodPosted } from "@/modules/accounting/period";
import { getGeneralLedger } from "@/modules/accounting/reports";

export async function GET(
  request: Request,
  context: { params: Promise<{ accountCode: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const { accountCode } = await context.params;
    const code = accountCodeSchema.safeParse(accountCode);
    if (!code.success) return accountingValidationErrorResponse(code.error);

    const url = new URL(request.url);
    const range = generalLedgerQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);

    // Penyusutan dan pajak diposting lebih dulu, sebelum angkanya dibaca.
    //
    // Tanpa ini, pemilik yang membuka layar ini SEBELUM pernah membuka Laporan
    // Posisi Keuangan melihatnya tanpa satu baris penyusutan pun -- padahal
    // alatnya sudah tercatat. Dan ia SEMBUH SENDIRI begitu Posisi Keuangan
    // dibuka sekali, jadi yang dilihat pemilik bukan angka yang salah,
    // melainkan angka yang berubah tanpa ia mengubah apa pun.
    await ensurePeriodPosted(range.data.to);

    return Response.json(
      { data: await getGeneralLedger(user.id, code.data, range.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
