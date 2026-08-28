import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ReadinessOperationError, readinessErrorResponse } from "@/modules/readiness/readiness-errors";
import { getMyReadiness } from "@/modules/readiness/readiness-repository";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new ReadinessOperationError("UNAUTHENTICATED");
    return Response.json({ data: await getMyReadiness() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/v1/readiness error:", error);
    return readinessErrorResponse(error);
  }
}
