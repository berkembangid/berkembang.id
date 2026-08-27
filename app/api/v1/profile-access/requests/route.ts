import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { createConsentRequest, listConsentWorkspace } from "@/modules/consent/consent-repository";
import { createConsentRequestSchema } from "@/modules/consent/consent-schema";

export async function GET() {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    return Response.json({ data: await listConsentWorkspace() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return consentErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const parsed = createConsentRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
    const result = await createConsentRequest(parsed.data, idempotencyKey);
    return Response.json({ data: result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) { return consentErrorResponse(error); }
}

