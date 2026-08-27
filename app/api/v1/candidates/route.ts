import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { listAnonymousCandidates } from "@/modules/consent/consent-repository";

export async function GET() {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    return Response.json({ data: { candidates: await listAnonymousCandidates() } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return consentErrorResponse(error); }
}

