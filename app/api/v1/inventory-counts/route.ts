import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { inventoryCountInputSchema } from "@/modules/accounting/period-schema";
import { getInventoryCount, saveInventoryCount } from "@/modules/accounting/period";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const month = new URL(request.url).searchParams.get("month") ?? jakartaDate().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return accountingValidationErrorResponse();
    return Response.json(
      { data: { inventoryCount: await getInventoryCount(user.id, month) } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const input = inventoryCountInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);
    return Response.json({ data: await saveInventoryCount(input.data) }, { status: 201 });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
