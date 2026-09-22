import "server-only";

/**
 * Identitas usaha yang dibaca lembaga, diambil dari tempat pemilik benar-benar
 * menyuntingnya.
 *
 * Ini menutup cacat yang membuat dossier tampak tidak pernah menyegar: layar
 * profil UMKM (`app/(umkm)/umkm/profil/page.tsx`) hanya menulis ke `profiles`.
 * Baris `businesses` ditulis sekali saat akun disediakan
 * (`private.get_or_create_user_business`) dan tidak pernah disentuh lagi. Jadi
 * usaha yang berganti nama tetap terbaca dengan nama lamanya oleh siapa pun
 * yang membaca `businesses.name` -- termasuk dossier.
 *
 * Selama izinnya masih berlaku, lembaga berhak atas identitas yang berlaku
 * hari ini, bukan yang berlaku pada hari izin disetujui. Yang dibekukan oleh
 * persetujuan adalah JENIS data yang dibagikan, bukan nilainya.
 *
 * Potret `dossier_items` tetap dipakai sebagai cadangan terakhir, untuk dossier
 * lama yang profilnya sudah telanjur hilang.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

export type DossierIdentity = {
  businessName: string;
  ownerName: string | null;
  businessForm: string | null;
  sector: string | null;
  city: string | null;
  yearStarted: number | null;
  employeeBand: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Kapan identitas ini terakhir disunting. Dipakai menilai kesegaran arsip PDF. */
  updatedAt: string | null;
};

/** Nilai yang disimpan layar profil, bukan yang pantas dicetak. */
const businessFormLabels: Record<string, string> = {
  perorangan: "Usaha perorangan",
  badan_usaha: "Badan usaha (PT/CV)",
};

const employeeBandLabels: Record<string, string> = {
  sendiri: "Saya sendiri",
  "1-4": "1–4 orang",
  "5-19": "5–19 orang",
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labelled(value: string | null, labels: Record<string, string>): string | null {
  if (!value) return null;
  return labels[value] ?? value;
}

type BusinessRow = {
  name: string;
  legal_name: string | null;
  sector: string | null;
  location: string | null;
  phone: string | null;
  legacy_profile_id: string | null;
  updated_at: string;
};

type ProfileRow = {
  nama_usaha: string | null;
  nama_pemilik: string | null;
  nama_contact: string | null;
  name: string | null;
  sektor_usaha: string | null;
  lokasi: string | null;
  phone: string | null;
  email: string | null;
  bentuk_usaha: string | null;
  tahun_mulai_usaha: number | null;
  jumlah_karyawan: string | null;
  updated_at: string;
};

/** Potret beku dari `dossier_items.business_identity`, dipakai bila yang hidup kosong. */
export type IdentitySnapshot = {
  businessName?: unknown;
  legalName?: unknown;
  sector?: unknown;
  generalLocation?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
};

function newer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

/**
 * Dibaca dengan service role karena pembacanya lembaga, bukan pemilik. Barisnya
 * dikunci pada `businessId` dossier yang izinnya sudah disetujui, sama seperti
 * angka keuangan dan pindaian dokumen.
 */
export async function loadDossierIdentity(
  businessId: string,
  snapshot: IdentitySnapshot = {},
): Promise<DossierIdentity> {
  const admin = createServiceRoleClient();

  const businessResult = await admin
    .from("businesses")
    .select("name,legal_name,sector,location,phone,legacy_profile_id,updated_at")
    .eq("id", businessId)
    .maybeSingle();
  const business = (businessResult.data ?? null) as BusinessRow | null;

  let profile: ProfileRow | null = null;
  if (business?.legacy_profile_id) {
    const profileResult = await admin
      .from("profiles")
      .select(
        "nama_usaha,nama_pemilik,nama_contact,name,sektor_usaha,lokasi,phone,email,bentuk_usaha,tahun_mulai_usaha,jumlah_karyawan,updated_at",
      )
      .eq("id", business.legacy_profile_id)
      .maybeSingle();
    profile = (profileResult.data ?? null) as ProfileRow | null;
  }

  // Urutannya disengaja: yang disunting pemilik hari ini menang atas baris
  // `businesses` yang membeku sejak akun dibuat, dan keduanya menang atas
  // potret persetujuan.
  const businessName =
    clean(profile?.nama_usaha) ??
    clean(business?.name) ??
    clean(snapshot.businessName) ??
    "Usaha";

  return {
    businessName,
    ownerName:
      clean(profile?.nama_pemilik) ??
      clean(profile?.nama_contact) ??
      clean(profile?.name) ??
      clean(snapshot.contactName),
    businessForm: labelled(clean(profile?.bentuk_usaha), businessFormLabels),
    sector: clean(profile?.sektor_usaha) ?? clean(business?.sector) ?? clean(snapshot.sector),
    city: clean(profile?.lokasi) ?? clean(business?.location) ?? clean(snapshot.generalLocation),
    yearStarted: typeof profile?.tahun_mulai_usaha === "number" ? profile.tahun_mulai_usaha : null,
    employeeBand: labelled(clean(profile?.jumlah_karyawan), employeeBandLabels),
    contactEmail: clean(profile?.email) ?? clean(snapshot.email),
    contactPhone:
      clean(profile?.phone) ?? clean(business?.phone) ?? clean(snapshot.phone),
    updatedAt: newer(profile?.updated_at ?? null, business?.updated_at ?? null),
  };
}
