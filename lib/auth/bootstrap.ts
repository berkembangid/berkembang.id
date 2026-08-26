import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/modules/auth/role-resolution";
import type { Database } from "@/types/database.generated";

function textValue(value: unknown, fallback = "", maxLength = 200) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function requireNoError(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}

export async function bootstrapAccountFromSignupMetadata(
  sessionClient: SupabaseClient<Database>,
  user: User,
): Promise<AppRole> {
  const existingRole = await getEffectivePortalRole(sessionClient, user.id);
  if (existingRole) return existingRole;

  const accountType = user.user_metadata?.signup_account_type;
  if (accountType !== "umkm" && accountType !== "institution") {
    throw new Error("ONBOARDING_METADATA_MISSING");
  }

  const metadata = user.user_metadata ?? {};
  const email = textValue(user.email, "", 320) || null;
  const admin = createServiceRoleClient();

  const ownerName = textValue(metadata.nama_pemilik ?? metadata.name, "Pemilik Usaha");
  const businessName = textValue(metadata.nama_usaha, ownerName || "Usaha Baru");
  const institutionName = textValue(metadata.nama_institusi ?? metadata.name, "Institusi Baru");
  const contactName = textValue(metadata.nama_contact ?? metadata.name, institutionName);
  const location = textValue(metadata.lokasi);

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      auth_user_id: user.id,
      email,
      role: accountType,
      name: accountType === "umkm" ? ownerName : institutionName,
      nama_pemilik: accountType === "umkm" ? ownerName : null,
      nama_usaha: accountType === "umkm" ? businessName : null,
      sektor_usaha: accountType === "umkm" ? textValue(metadata.sektor_usaha, "Lainnya") : null,
      nama_institusi: accountType === "institution" ? institutionName : null,
      jenis_institusi:
        accountType === "institution" ? textValue(metadata.jenis_institusi, "other") : null,
      nama_contact: accountType === "institution" ? contactName : null,
      lokasi: location || null,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  requireNoError(profileError, "PROFILE_BOOTSTRAP_FAILED");

  if (accountType === "umkm") {
    const existingBusiness = await admin
      .from("businesses")
      .select("id")
      .eq("legacy_profile_id", user.id)
      .maybeSingle();
    requireNoError(existingBusiness.error, "BUSINESS_LOOKUP_FAILED");

    let businessId = existingBusiness.data?.id;
    if (!businessId) {
      const createdBusiness = await admin
        .from("businesses")
        .insert({
          legacy_profile_id: user.id,
          name: businessName,
          legal_name: businessName,
          sector: textValue(metadata.sektor_usaha, "Lainnya"),
          location: location || null,
          status: "active",
        })
        .select("id")
        .single();
      requireNoError(createdBusiness.error, "BUSINESS_BOOTSTRAP_FAILED");
      businessId = createdBusiness.data?.id;
    }

    if (!businessId) throw new Error("BUSINESS_BOOTSTRAP_FAILED");
    const membership = await admin
      .from("business_members")
      .select("id")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .maybeSingle();
    requireNoError(membership.error, "BUSINESS_MEMBERSHIP_LOOKUP_FAILED");
    if (!membership.data) {
      const { error } = await admin.from("business_members").insert({
        business_id: businessId,
        profile_id: user.id,
        user_id: user.id,
        role: "owner",
        status: "active",
        joined_at: new Date().toISOString(),
      });
      requireNoError(error, "BUSINESS_MEMBERSHIP_BOOTSTRAP_FAILED");
    }
    return "umkm";
  }

  const existingInstitution = await admin
    .from("institutions")
    .select("id")
    .eq("legacy_profile_id", user.id)
    .maybeSingle();
  requireNoError(existingInstitution.error, "INSTITUTION_LOOKUP_FAILED");

  let institutionId = existingInstitution.data?.id;
  if (!institutionId) {
    const createdInstitution = await admin
      .from("institutions")
      .insert({
        legacy_profile_id: user.id,
        name: institutionName,
        type: textValue(metadata.jenis_institusi, "other"),
        contact_name: contactName,
        contact_email: email,
        location: location || null,
        active: true,
        status: "active",
      })
      .select("id")
      .single();
    requireNoError(createdInstitution.error, "INSTITUTION_BOOTSTRAP_FAILED");
    institutionId = createdInstitution.data?.id;
  }

  if (!institutionId) throw new Error("INSTITUTION_BOOTSTRAP_FAILED");
  const membership = await admin
    .from("institution_members")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("user_id", user.id)
    .maybeSingle();
  requireNoError(membership.error, "INSTITUTION_MEMBERSHIP_LOOKUP_FAILED");
  if (!membership.data) {
    const { error } = await admin.from("institution_members").insert({
      institution_id: institutionId,
      profile_id: user.id,
      user_id: user.id,
      role: "admin",
      status: "active",
      joined_at: new Date().toISOString(),
    });
    requireNoError(error, "INSTITUTION_MEMBERSHIP_BOOTSTRAP_FAILED");
  }
  return "institution";
}
