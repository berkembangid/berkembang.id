import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { journalQuerySchema } from "@/modules/accounting/accounting-schema";
import { getJournal } from "@/modules/accounting/reports";

function optionalNumber(value: string | null) {
  return value === null || value.trim() === "" ? undefined : Number(value);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const query = journalQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      limit: optionalNumber(url.searchParams.get("limit")),
      offset: optionalNumber(url.searchParams.get("offset")),
    });
    if (!query.success) return accountingValidationErrorResponse(query.error);

    return Response.json(
      { data: await getJournal(user.id, query.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
