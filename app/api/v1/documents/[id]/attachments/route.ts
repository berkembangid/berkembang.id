import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  DocumentOperationError,
  documentErrorResponse,
  documentValidationErrorResponse,
} from "@/modules/documents/document-errors";
import {
  attachDocument,
  detachDocument,
  listAttachmentsForDocument,
} from "@/modules/documents/attachment-repository";
import {
  attachDocumentSchema,
  detachDocumentSchema,
  type AttachDocumentRequest,
  type AttachDocumentResult,
  type AttachmentView,
  type DetachDocumentRequest,
} from "@/modules/documents/attachment-schema";
import { documentIdSchema } from "@/modules/documents/document-schema";

export type DocumentAttachmentRouteDependencies = {
  authenticate: () => Promise<{ id: string } | null>;
  attach: (documentId: string, input: AttachDocumentRequest) => Promise<AttachDocumentResult>;
  detach: (input: DetachDocumentRequest) => Promise<{ id: string }>;
  list: (documentId: string) => Promise<AttachmentView[]>;
};

const defaultDependencies: DocumentAttachmentRouteDependencies = {
  authenticate: getAuthenticatedUser,
  attach: attachDocument,
  detach: detachDocument,
  list: listAttachmentsForDocument,
};

export async function handleAttachDocumentRequest(
  documentId: string,
  request: Request,
  dependencies: DocumentAttachmentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const body = await request.json().catch(() => null);
    const input = attachDocumentSchema.safeParse(body);
    if (!input.success) return documentValidationErrorResponse(input.error);

    // Menempel bersifat idempotent di sisi basis data, jadi tombol yang
    // ditekan dua kali saat sinyal hilang tidak pernah menghasilkan galat.
    const result = await dependencies.attach(parsedId.data, input.data);
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function handleDetachDocumentRequest(
  documentId: string,
  request: Request,
  dependencies: DocumentAttachmentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const body = await request.json().catch(() => null);
    const input = detachDocumentSchema.safeParse(body);
    if (!input.success) return documentValidationErrorResponse(input.error);
    return Response.json({ data: await dependencies.detach(input.data) });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function handleListDocumentAttachmentsRequest(
  documentId: string,
  dependencies: DocumentAttachmentRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return documentErrorResponse(new DocumentOperationError("UNAUTHENTICATED"));
    const parsedId = documentIdSchema.safeParse(documentId);
    if (!parsedId.success) return documentValidationErrorResponse(parsedId.error);
    const attachments = await dependencies.list(parsedId.data);
    return Response.json(
      { data: { attachments } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return documentErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAttachDocumentRequest(id, request);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleDetachDocumentRequest(id, request);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleListDocumentAttachmentsRequest(id);
}
