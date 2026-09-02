import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { loanUpdateSchema } from "@/modules/accounting/period-schema";
import { updateLoan } from "@/modules/accounting/period";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";

export type UpdateLoanDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  update: typeof updateLoan;
};

const defaultDependencies: UpdateLoanDependencies = {
  authenticate: getAuthenticatedUser,
  update: updateLoan,
};

export async function handleUpdateLoanRequest(
  request: Request,
  loanId: string,
  dependencies: UpdateLoanDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const parsedId = transactionIdSchema.safeParse(loanId);
    if (!parsedId.success) return accountingValidationErrorResponse(parsedId.error);
    const input = loanUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);
    return Response.json({ data: await dependencies.update(parsedId.data, input.data) });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleUpdateLoanRequest(request, id);
}
