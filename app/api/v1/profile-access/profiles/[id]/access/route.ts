import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { accessVerifiedProfile } from "@/modules/consent/consent-repository";
import { accessProfileSchema } from "@/modules/consent/consent-schema";

async function sha256(value: string | null) {
  if (!value) return undefined;
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const parsed = accessProfileSchema.safeParse(await request.json());
    if (!parsed.success) throw new ConsentOperationError("VALIDATION_FAILED", parsed.error);
    const { id } = await context.params;
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const [ipHash, userAgentHash] = await Promise.all([sha256(forwarded), sha256(request.headers.get("user-agent"))]);
    return Response.json({ data: await accessVerifiedProfile(id, parsed.data.scope, parsed.data.action, { ipHash, userAgentHash }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return consentErrorResponse(error); }
}
