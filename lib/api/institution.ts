import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

/**
 * Nama kuki tempat layar menyimpan organisasi terpilih. Ditulis oleh
 * `InstitutionProvider` bersamaan dengan localStorage, supaya halaman server
 * (Ringkasan wilayah, Analitik) -- yang tidak bisa membaca localStorage --
 * juga tahu organisasi mana yang sedang dibuka.
 */
export const INSTITUTION_COOKIE = "berkembang_institution_id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && UUID.test(trimmed) ? trimmed : null;
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Organisasi yang dipilih di layar: header `x-institution-id`, atau kuki bila
 * header tidak dikirim.
 *
 * Dulu fungsi tiga baris ini tersalin di delapan rute. Salinan yang berangkat
 * identik tidak bertahan identik, jadi ia tinggal di satu tempat.
 */
export function institutionHeader(request: Request): string | null {
  return clean(request.headers.get("x-institution-id")) ?? clean(cookieValue(request, INSTITUTION_COOKIE));
}

/** Organisasi terpilih untuk komponen server, dari kuki. */
export async function selectedInstitutionFromCookies(): Promise<string | null> {
  const store = await cookies();
  return clean(store.get(INSTITUTION_COOKIE)?.value);
}

export type AuditArtifact =
  | "CANDIDATE_LIST" | "SHORTLIST" | "ORGANIZATION" | "PROGRAM_DASH" | "PDF" | "DOSSIER"
  | "REQUEST" | "PROGRAM" | "MEMBER" | "API_KEY";
export type AuditAction = "view" | "download" | "create" | "update" | "delete";

/**
 * Mencatat satu tindakan ke log audit organisasi (`0105`).
 *
 * Kegagalan mencatat tidak membatalkan tindakannya -- tindakannya sudah
 * terjadi -- tetapi ia TIDAK LAGI ditelan diam-diam: dulu rute anggota
 * mencatat dengan tindakan `manage`, yang ditolak basis data sejak hari
 * pertama, dan tak seorang pun tahu log itu kosong.
 */
export async function logInstitutionAction(
  client: SupabaseClient<Database>,
  institutionId: string | null,
  artifact: AuditArtifact,
  action: AuditAction,
  detail: { businessId?: string | null; artifactId?: string | null } = {},
): Promise<void> {
  if (!institutionId) return;
  const { error } = await (client as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  }).rpc("log_institution_view", {
    p_institution_id: institutionId,
    p_artifact: artifact,
    p_action: action,
    ...(detail.businessId ? { p_business_id: detail.businessId } : {}),
    ...(detail.artifactId ? { p_artifact_id: detail.artifactId } : {}),
  });
  if (error) console.error(`[audit] ${artifact}/${action} tidak tercatat:`, error.message);
}

/**
 * Organisasi yang BERLAKU untuk permintaan ini, diperiksa basis data.
 *
 * `resolve_my_institution_id` memastikan pemanggil anggota aktif organisasi
 * yang disebut; tanpa pilihan ia memilih keanggotaan tertua, secara tetap.
 * Rute daftar memakai ini supaya SELALU menyaring satu organisasi. Dulu
 * rute-rute itu hanya menyaring bila header ada -- tanpa header, RLS
 * mengembalikan data semua organisasi tempat orang itu bernaung, bercampur
 * dalam satu daftar.
 *
 * `null` berarti pemanggil bukan anggota aktif organisasi mana pun (atau
 * bukan anggota organisasi yang ia sebut) -- rute menjawab 403.
 */
export async function resolveSelectedInstitution(
  client: SupabaseClient<Database>,
  request: Request,
): Promise<string | null> {
  const selected = institutionHeader(request);
  const { data, error } = await client.rpc(
    "resolve_my_institution_id",
    selected ? { p_institution_id: selected } : {},
  );
  if (error || typeof data !== "string") return null;
  return data;
}
