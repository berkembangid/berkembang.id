import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { createConsentRequest, listConsentWorkspace } from "@/modules/consent/consent-repository";
import { createConsentRequestSchema } from "@/modules/consent/consent-schema";
import { institutionHeader, resolveSelectedInstitution } from "@/lib/api/institution";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    // Portal lembaga selalu mengirim organisasinya; organisasi itu diperiksa
    // keanggotaannya, lalu daftar dibatasi padanya.
    let institutionId: string | null = null;
    if (institutionHeader(request)) {
      institutionId = await resolveSelectedInstitution(await createServerSupabaseClient(), request);
      if (!institutionId) throw new ConsentOperationError("ACCESS_DENIED");
    }
    return Response.json({ data: await listConsentWorkspace(institutionId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return consentErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const parsed = createConsentRequestSchema.safeParse({
      ...(await request.json()),
      institutionId: institutionHeader(request) ?? undefined,
    });
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
    const result = await createConsentRequest(parsed.data, idempotencyKey);
    return Response.json({ data: result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    console.error("[profile-access/requests POST ERROR]", error);
    return consentErrorResponse(error);
  }
}
