import "server-only";

import type { User } from "@supabase/supabase-js";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/modules/auth/role-resolution";

function textValue(value: unknown, fallback = "", maxLength = 200) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function enumValue(value: unknown, allowed: readonly string[]) {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function yearValue(value: unknown) {
  const year = typeof value === "number" ? value : Number(value);
  const thisYear = new Date().getFullYear();
  return Number.isInteger(year) && year >= 1900 && year <= thisYear ? year : null;
}

/** Kanal penjualan; nilai asing dibuang, bukan menggagalkan pendaftaran. */
function channelValues(value: unknown) {
  const allowed = ["warung", "whatsapp", "marketplace", "media_sosial"];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.includes(item)))];
}

function requireNoError(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}

export async function bootstrapAccountFromSignupMetadata(
  user: User,
): Promise<AppRole> {
  // The session has already been verified by auth.getUser() in the route.
  // Use the server-only client for this recovery lookup so a half-created
  // legacy profile is not blocked by membership RLS before it can be repaired.
  const admin = createServiceRoleClient();
  const existingRole = await getEffectivePortalRole(admin, user.id);
  if (existingRole) return existingRole;

  // Kunci metadata ini pernah bernama `role` sebelum berganti menjadi
  // `signup_account_type`, dan tidak ada yang membaca nama lamanya. Akibatnya
  // enam belas akun -- setiap orang yang mendaftar sebelum penggantian nama --
  // tidak pernah bisa dibuatkan profilnya lagi. Mereka memasukkan kata sandi
  // yang benar, dipantulkan kembali ke halaman masuk, dan tidak diberi tahu
  // apa pun.
  //
  // Nama lama tetap dibaca. Sebuah kunci yang berganti nama tidak membatalkan
  // pendaftaran yang sudah terjadi.
  const metadataRecord = user.user_metadata ?? {};
  const accountType = metadataRecord.signup_account_type ?? metadataRecord.role;

  // Akun admin tidak punya usaha dan tidak seharusnya punya. Sebelumnya ia
  // jatuh ke galat yang sama dengan pendaftar yang metadatanya rusak, dan
  // layarnya menyuruh pengelola platform "hubungi pengelola" -- kalimat yang
  // tidak menunjuk ke mana pun ketika yang membacanya adalah pengelola itu
  // sendiri.
  //
  // Yang dibedakan hanya PESANNYA, bukan aksesnya. Metadata pendaftaran
  // dikendalikan pendaftar sendiri, jadi ia tidak pernah boleh memberikan
  // status admin; itu hanya ditulis ke `platform_admins` oleh admin lain.
  // Siapa pun boleh menulis "admin" pada metadatanya dan yang ia dapat tetap
  // penolakan -- penolakan yang menjelaskan dirinya.
  if (accountType === "admin") {
    throw new Error("ADMIN_ACCESS_NOT_GRANTED");
  }

  if (accountType === "institution") {
    // Akun lembaga resmi tidak boleh mendaftar sendiri secara publik, harus dibuat oleh Admin.
    // Jika ada akun lama yang sudah punya institusi/membership, itu sudah ditangani di check existingRole di atas.
    throw new Error("INSTITUTION_SELF_SIGNUP_NOT_ALLOWED");
  }

  if (accountType !== "umkm" && accountType !== "investor") {
    throw new Error("ONBOARDING_METADATA_MISSING");
  }

  const isInvestor = accountType === "investor";
  const metadata = metadataRecord;
  const email = textValue(user.email, "", 320) || null;
  const ownerName = textValue(metadata.nama_pemilik ?? metadata.name, "Pemilik Usaha");
  const businessName = textValue(metadata.nama_usaha, ownerName || "Usaha Baru");
  const investorCompanyName = textValue(
    metadata.nama_perusahaan ?? metadata.nama_institusi ?? metadata.name,
    "Investor / Offtaker"
  );
  const institutionName = isInvestor ? investorCompanyName : textValue(metadata.nama_institusi ?? metadata.name, "Lembaga Baru");
  const contactName = textValue(metadata.nama_contact ?? metadata.name, institutionName);
  const location = textValue(metadata.lokasi);
  // Jawaban langkah tiga pendaftaran. Tanpa ini, pertanyaan yang sudah dijawab
  // pemilik hilang begitu saja dan ia harus mengisinya lagi di halaman Profil.
  const address = textValue(metadata.alamat, "", 240);
  const phone = textValue(metadata.phone, "", 40);
  const businessForm = enumValue(metadata.bentuk_usaha, ["perorangan", "badan_usaha"]) ?? "perorangan";
  const startYear = yearValue(metadata.tahun_mulai_usaha);
  const headcount = enumValue(metadata.jumlah_karyawan, ["sendiri", "1-4", "5-19"]);
  const channels = channelValues(metadata.kanal_penjualan);

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
      alamat: accountType === "umkm" ? address || null : null,
      phone: accountType === "umkm" ? phone || null : null,
      bentuk_usaha: accountType === "umkm" ? businessForm : "perorangan",
      tahun_mulai_usaha: accountType === "umkm" ? startYear : null,
      jumlah_karyawan: accountType === "umkm" ? headcount : null,
      kanal_penjualan: accountType === "umkm" ? channels : [],
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
          address: address || null,
          phone: phone || null,
          status: "active",
        })
        .select("id")
        .single();
      requireNoError(createdBusiness.error, "BUSINESS_BOOTSTRAP_FAILED");
      businessId = createdBusiness.data?.id;
    }

    if (!businessId) throw new Error("BUSINESS_BOOTSTRAP_FAILED");
    // Kepemilikan usaha cukup lewat businesses.legacy_profile_id; baris
    // keanggotaan 'owner' disinkronkan otomatis oleh trigger database.
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
        type: isInvestor ? textValue(metadata.jenis_investor, "Investor / Offtaker") : textValue(metadata.jenis_institusi, "other"),
        contact_name: contactName,
        contact_email: email,
        location: location || null,
        active: isInvestor ? true : false,
        status: isInvestor ? "active" : "pending",
        verification_status: isInvestor ? "verified" : "pending",
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
  return isInvestor ? "investor" : "institution";
}

