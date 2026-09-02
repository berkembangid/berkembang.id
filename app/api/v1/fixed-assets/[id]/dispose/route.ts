import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { fixedAssetDisposalSchema } from "@/modules/accounting/period-schema";
import { disposeFixedAsset } from "@/modules/accounting/period";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";

export type DisposeFixedAssetDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  dispose: typeof disposeFixedAsset;
};

const defaultDependencies: DisposeFixedAssetDependencies = {
  authenticate: getAuthenticatedUser,
  dispose: disposeFixedAsset,
};

/** Melepas alat adalah peristiwa dengan tanggal dan hasil jualnya sendiri. */
export async function handleDisposeFixedAssetRequest(
  request: Request,
  assetId: string,
  dependencies: DisposeFixedAssetDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const parsedId = transactionIdSchema.safeParse(assetId);
    if (!parsedId.success) return accountingValidationErrorResponse(parsedId.error);
    const input = fixedAssetDisposalSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);
    return Response.json({ data: await dependencies.dispose(parsedId.data, input.data) }, { status: 201 });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleDisposeFixedAssetRequest(request, id);
}
