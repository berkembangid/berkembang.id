import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { reportPeriodQuerySchema } from "@/modules/accounting/period-schema";
import { getNotesData } from "@/modules/accounting/period";
import { accountingPolicyNotesFor } from "@/modules/accounting/statement-document";
import { hasAnyEvidence } from "@/modules/documents/attachment-repository";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const url = new URL(request.url);
    const range = reportPeriodQuerySchema.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);
    return Response.json(
      {
        data: {
          policies: accountingPolicyNotesFor({ hasEvidence: await hasAnyEvidence() }),
          notes: await getNotesData(user.id, range.data.from, range.data.to),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
