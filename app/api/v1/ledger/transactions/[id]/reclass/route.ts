import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { reclassTransactionSchema } from "@/modules/accounting/accounting-schema";
import { reclassTransaction } from "@/modules/accounting/posting";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";

export type ReclassRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  reclass: typeof reclassTransaction;
};

const defaultDependencies: ReclassRouteDependencies = {
  authenticate: getAuthenticatedUser,
  reclass: reclassTransaction,
};

export async function handleReclassRequest(
  request: Request,
  transactionId: string,
  dependencies: ReclassRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const parsedId = transactionIdSchema.safeParse(transactionId);
    if (!parsedId.success) return accountingValidationErrorResponse(parsedId.error);

    const input = reclassTransactionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);

    return Response.json({ data: await dependencies.reclass(parsedId.data, input.data) });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReclassRequest(request, id);
}
