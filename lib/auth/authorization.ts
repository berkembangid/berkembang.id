import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEffectivePortalRole,
  type AppRole,
} from "@/modules/auth/role-resolution";
import type { Database } from "@/types/database.generated";

export class AuthorizationLookupError extends Error {
  constructor() {
    super("AUTHORIZATION_LOOKUP_FAILED");
    this.name = "AuthorizationLookupError";
  }
}

export async function getEffectivePortalRole(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AppRole | null> {
  const [platformAdmin, institutionMember, businessMember] = await Promise.all([
    client
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    client
      .from("institution_members")
      .select("id, institution_id, institutions(portal_kind)")
      .eq("user_id", userId)
      .eq("status", "active")
      // Keanggotaan tertua, sama dengan `resolve_my_institution_id`. Tanpa
      // urutan, orang yang bernaung di satu lembaga dan satu investor bisa
      // dilempar ke portal yang berbeda dari satu permintaan ke berikutnya.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client
      .from("businesses")
      .select("id")
      .eq("legacy_profile_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (platformAdmin.error || institutionMember.error || businessMember.error) {
    throw new AuthorizationLookupError();
  }

  // Portal dibaca dari kolom `institutions.portal_kind`, bukan diturunkan dari
  // potongan kata pada `institutions.type`.
  //
  // Sebelum `0095`, baris ini berbunyi:
  //
  //   lowerType.includes("investor") || lowerType.includes("offtaker")
  //     || lowerType.includes("ventura") || lowerType.includes("buyer")
  //
  // Tiga hal salah dengan itu. Koperasi bernama jenis "Koperasi Investor
  // Bersama" terlempar ke portal investor tanpa ada yang tahu. Nilai `type`
  // untuk investor ditulis `bootstrap.ts` langsung dari metadata pendaftaran,
  // yang dikendalikan pendaftar dan tidak dicocokkan dengan `INVESTOR_TYPES`.
  // Dan yang paling menentukan: `signup_account_type` SUDAH menyatakan
  // investor atau bukan, dan nilai itu divalidasi -- menebaknya lagi dari
  // sebuah nama berarti membuang jawaban yang sahih.
  //
  // Kalau kolomnya tidak terbaca, jawabannya `institution`: portal pembiayaan
  // yang lebih sedikit akibatnya, bukan portal investor yang memuat dossier.
  const institusi = institutionMember.data as unknown as {
    institutions?: { portal_kind?: string } | Array<{ portal_kind?: string }>;
  } | null;
  const portalKind = Array.isArray(institusi?.institutions)
    ? institusi?.institutions[0]?.portal_kind
    : institusi?.institutions?.portal_kind;
  const isInvestor = portalKind === "investor";

  return resolveEffectivePortalRole({
    hasActivePlatformAdmin: Boolean(platformAdmin.data),
    hasActiveInstitutionMembership: Boolean(institutionMember.data),
    hasActiveBusinessMembership: Boolean(businessMember.data),
    isInvestor,
  });
}

