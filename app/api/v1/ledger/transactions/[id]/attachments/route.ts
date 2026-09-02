import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import { listAttachmentsForTargets } from "@/modules/documents/attachment-repository";
import type { AttachmentView } from "@/modules/documents/attachment-schema";
import { documentIdSchema } from "@/modules/documents/document-schema";

/**
 * Bukti yang menempel pada satu catatan uang.
 *
 * Jalurnya `/api/v1/ledger/transactions/:id/attachments`, bukan
 * `/api/v1/transactions/:id/attachments` seperti spek, karena seluruh rute
 * transaksi di repo ini sudah berada di bawah `ledger/`. Menaruh satu rute
 * transaksi di tempat lain membuat jalur transaksi ada di dua pohon.
 *
 * Layar daftar TIDAK memakai rute ini; jumlah buktinya sudah ikut dalam
 * muatan daftar, supaya satu layar riwayat tidak menjadi puluhan permintaan.
 */
export type TransactionAttachmentRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  list: (targetType: "transaction", targetIds: string[]) => Promise<AttachmentView[]>;
};

const defaultDependencies: TransactionAttachmentRouteDependencies = {
  authenticate: getAuthenticatedUser,
  list: listAttachmentsForTargets,
};

export async function handleListTransactionAttachmentsRequest(
  transactionId: string,
  dependencies: TransactionAttachmentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(transactionId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const attachments = await dependencies.list("transaction", [parsedId.data]);
    return Response.json(
      { data: { attachments } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleListTransactionAttachmentsRequest(id);
}
