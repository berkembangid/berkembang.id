import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { fixedAssetUpdateSchema } from "@/modules/accounting/period-schema";
import { updateFixedAsset } from "@/modules/accounting/period";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";

export type UpdateFixedAssetDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  update: typeof updateFixedAsset;
};

const defaultDependencies: UpdateFixedAssetDependencies = {
  authenticate: getAuthenticatedUser,
  update: updateFixedAsset,
};

export async function handleUpdateFixedAssetRequest(
  request: Request,
  assetId: string,
  dependencies: UpdateFixedAssetDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const parsedId = transactionIdSchema.safeParse(assetId);
    if (!parsedId.success) return accountingValidationErrorResponse(parsedId.error);
    const input = fixedAssetUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);
    return Response.json({ data: await dependencies.update(parsedId.data, input.data) });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleUpdateFixedAssetRequest(request, id);
}
