import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { trialBalanceQuerySchema } from "@/modules/accounting/accounting-schema";
import { ensurePeriodPosted } from "@/modules/accounting/period";
import { getTrialBalance } from "@/modules/accounting/reports";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const query = trialBalanceQuerySchema.safeParse({
      asOf: url.searchParams.get("asOf") ?? jakartaDate(),
    });
    if (!query.success) return accountingValidationErrorResponse(query.error);

/**
 * Penyusutan dan pajak diposting lebih dulu, sebelum angkanya dibaca.
 *
 * Tanpa ini, pemilik yang membuka laporan ini SEBELUM pernah membuka Laporan
 * Posisi Keuangan melihat laporan tanpa beban penyusutan sama sekali --
 * padahal alatnya sudah tercatat. Beban itu lahir dari `ensure_depreciation_posted`,
 * dan sebelumnya hanya Posisi Keuangan, Arus Kas, dan CALK yang memanggilnya.
 *
 * Akibatnya paling membingungkan justru karena ia SEMBUH SENDIRI: begitu
 * pemilik membuka Posisi Keuangan sekali, bebannya muncul di semua laporan.
 * Yang dilihatnya bukan angka yang salah, melainkan angka yang berubah tanpa
 * ia mengubah apa pun.
 */
    await ensurePeriodPosted(query.data.asOf);

    return Response.json(
      { data: await getTrialBalance(user.id, query.data.asOf) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
