import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { revokeConsent } from "@/modules/consent/consent-repository";
import { revokeConsentSchema } from "@/modules/consent/consent-schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const parsed = revokeConsentSchema.safeParse(await request.json());
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const { id } = await context.params;
    return Response.json({ data: await revokeConsent(id, parsed.data.reason) });
  } catch (error) { return consentErrorResponse(error); }
}
