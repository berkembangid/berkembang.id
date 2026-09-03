import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { listAnonymousCandidates } from "@/modules/consent/consent-repository";
import { candidateFilterSchema } from "@/modules/consent/consent-schema";

function headerInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

export async function GET(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const url = new URL(request.url);
    const legal = url.searchParams.get("legalComplete");
    const parsed = candidateFilterSchema.safeParse({
      institutionId: headerInstitution(request) ?? url.searchParams.get("institutionId"),
      programId: url.searchParams.get("programId"),
      sector: url.searchParams.get("sector") === "Semua" ? null : url.searchParams.get("sector"),
      region: url.searchParams.get("region"),
      minLevel: url.searchParams.get("minLevel"),
      ageBand: url.searchParams.get("ageBand"),
      legalComplete: legal === null || legal === "" ? null : legal === "true",
      sort: url.searchParams.get("sort") ?? "newest",
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const result = await listAnonymousCandidates(parsed.data);
    return Response.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return consentErrorResponse(error); }
}
