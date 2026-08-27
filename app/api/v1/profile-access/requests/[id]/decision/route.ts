import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { decideConsentRequest } from "@/modules/consent/consent-repository";
import { decideConsentRequestSchema } from "@/modules/consent/consent-schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const parsed = decideConsentRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const { id } = await context.params;
    return Response.json({ data: await decideConsentRequest(id, parsed.data) });
  } catch (error) { return consentErrorResponse(error); }
}
