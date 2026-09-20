import { NextResponse } from "next/server";
import { z } from "zod";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Anggota organisasi lembaga.
 *
 * GALATNYA BERBENTUK `{ code, message }`, BUKAN KODE TELANJANG.
 *
 * Rute ini dulu mengembalikan `{ error: "MEMBER_INVITE_FAILED" }`, dan layarnya
 * melemparkannya apa adanya ke notifikasi. Yang membaca notifikasi itu kepala
 * seksi di kantor dinas. `app/api/v1/institution/broadcasts` di repo yang sama
 * sudah memakai bentuk berpesan; rute ini yang tertinggal.
 *
 * SETIAP KODE DIPETAKAN KE SATU KALIMAT YANG MENGATAKAN APA YANG HARUS
 * DILAKUKAN. "Belum terdaftar" tanpa lanjutan membuat orang menekan tombol yang
 * sama lagi; "minta ia mendaftar dulu" tidak.
 */

const PESAN: Record<string, string> = {
  FORBIDDEN: "Hanya admin organisasi ini yang dapat mengelola anggota.",
  EMAIL_INVALID: "Alamat surelnya belum lengkap. Contoh: nama@dinas.go.id",
  EMAIL_NOT_REGISTERED:
    "Belum ada akun BERKEMBANG.ID dengan surel itu. Minta orangnya mendaftar dulu, lalu tambahkan lagi.",
  ALREADY_MEMBER: "Orang ini sudah menjadi anggota organisasi.",
  SEATS_FULL:
    "Kursi lisensi sudah terpakai semua. Nonaktifkan satu anggota lebih dulu, atau hubungi admin platform untuk menambah kursi.",
  INSTITUTION_REQUIRED: "Pilih organisasinya lebih dulu.",
  UNAUTHENTICATED: "Sesi Anda sudah berakhir. Masuk lagi untuk melanjutkan.",
  MEMBER_NOT_CHANGED:
    "Perubahan itu ditolak sistem. Peran anggota dan data admin organisasi hanya dapat diubah admin platform.",
  UNKNOWN: "Belum berhasil. Coba lagi sebentar lagi.",
};

function gagal(code: string, status: number) {
  return NextResponse.json(
    { error: { code, message: PESAN[code] ?? PESAN.UNKNOWN } },
    { status },
  );
}

/** Mengenali kode yang dilempar `raise exception` di migrasi 0097. */
function kodeDariPostgres(message: string | undefined): string {
  const teks = (message ?? "").toUpperCase();
  for (const kode of Object.keys(PESAN)) {
    if (teks.includes(kode)) return kode;
  }
  return "UNKNOWN";
}

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

const roleBack: Record<string, string> = {
  admin: "ADMIN",
  analyst: "ANALYST",
  reviewer: "ANALYST",
  viewer: "VIEWER",
};

type BarisDirektori = {
  id: string;
  user_id: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  display_name: string | null;
  email: string | null;
  is_self: boolean;
};

/**
 * Daftar anggota + entitlement.
 *
 * Diambil lewat `institution_member_directory`, bukan `select` biasa, karena
 * `profiles_select` hanya mengizinkan orang membaca profilnya sendiri. Tanpa
 * fungsi itu, satu-satunya yang bisa ditampilkan adalah UUID -- dan layar yang
 * menampilkan UUID meminta orang mencabut akses seseorang yang tidak ia kenali.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = selectedInstitution(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const client = await createServerSupabaseClient();
  const [directory, entitlement, institution] = await Promise.all([
    withPortalRpc(client).rpc("institution_member_directory", { p_institution_id: selected }),
    client
      .from("institution_entitlements")
      .select("seats,dossier_credits,credits_used,license_from,license_to,plan_note")
      .eq("institution_id", selected)
      .maybeSingle(),
    client
      .from("institutions")
      .select("id,name,type,status,verification_status")
      .eq("id", selected)
      .maybeSingle(),
  ]);

  if (directory.error || entitlement.error || institution.error) {
    return NextResponse.json(
      { error: { code: "ORGANIZATION_UNAVAILABLE", message: "Data organisasi belum dapat dimuat." } },
      { status: 503 },
    );
  }

  const rows = (Array.isArray(directory.data) ? directory.data : []) as unknown as BarisDirektori[];
  const members = rows.map((row) => ({
    ...row,
    role: roleBack[row.role] ?? row.role.toUpperCase(),
  }));

  return NextResponse.json(
    { data: { institution: institution.data, members, entitlement: entitlement.data } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const tambahSchema = z.object({ email: z.string().trim().min(3).max(320) });

/**
 * Menambah anggota lewat surel.
 *
 * PERANNYA TIDAK DITERIMA SEBAGAI PARAMETER, DAN ITU DISENGAJA. Trigger
 * `protect_institution_membership_authority` hanya mengizinkan admin lembaga
 * menyisipkan `viewer`. Skema lama rute ini menerima `role` -- lalu dua dari
 * tiga nilainya ditolak basis data dengan kode mentah yang tidak bisa dibaca
 * siapa pun. Menerima parameter yang akan ditolak bukan keluwesan.
 *
 * Ia juga dulu menerima `email` di skemanya TANPA memakainya sama sekali:
 * parameter mati yang diam-diam tidak berbuat apa-apa.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = selectedInstitution(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const parsed = tambahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gagal("EMAIL_INVALID", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await withPortalRpc(client).rpc("institution_add_member_by_email", {
    p_institution_id: selected,
    p_email: parsed.data.email,
  });

  if (error) {
    const kode = kodeDariPostgres(error.message);
    const status = kode === "FORBIDDEN" ? 403 : kode === "ALREADY_MEMBER" ? 409 : 400;
    return gagal(kode, status);
  }

  // Dicatat sebagai `manage`, bukan `view`.
  //
  // Rute ini dulu mencatat penambahan anggota dengan `p_action: "view"`, jadi
  // jejak auditnya mengatakan orang itu MELIHAT halaman pada saat ia justru
  // memberi orang lain akses ke profil UMKM berizin. Jejak audit yang salah
  // lebih buruk daripada tidak ada jejak: ia dipercaya.
  await withPortalRpc(await createServerSupabaseClient())
    .rpc("log_institution_view", {
      p_institution_id: selected,
      p_artifact: "ORGANIZATION",
      p_action: "manage",
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ data }, { status: 201 });
}

/**
 * Menangguhkan atau mengaktifkan kembali seorang anggota.
 *
 * HANYA `status`. Peran sengaja tidak di sini: trigger 0013 memaksa
 * `new.role := old.role` pada setiap UPDATE, jadi permintaan perubahan peran
 * BERHASIL secara HTTP dan tidak mengubah apa pun. Layar lama menawarkannya,
 * memperbarui tampilannya sendiri secara optimistis, dan berbohong sampai
 * halaman dimuat ulang.
 *
 * HASILNYA DIPERIKSA, BUKAN DIANGGAP BERHASIL. Kalau RLS menolak (misalnya
 * baris admin, atau lembaga lain), PostgREST mengembalikan 200 dengan NOL
 * baris. Tanpa memeriksa jumlah barisnya, penolakan diam-diam itu sampai ke
 * layar sebagai keberhasilan.
 */
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = selectedInstitution(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const body = (await request.json().catch(() => null)) as
    | { memberId?: unknown; status?: unknown }
    | null;
  if (typeof body?.memberId !== "string") return gagal("UNKNOWN", 400);
  if (body.status !== "active" && body.status !== "suspended") return gagal("UNKNOWN", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("institution_members")
    .update({ status: body.status })
    .eq("id", body.memberId)
    .eq("institution_id", selected)
    .select("id,status");

  if (error) return gagal(kodeDariPostgres(error.message), 400);
  if (!data || data.length === 0) return gagal("MEMBER_NOT_CHANGED", 403);
  if (data[0].status !== body.status) return gagal("MEMBER_NOT_CHANGED", 403);

  return NextResponse.json({ data: data[0] });
}

/**
 * Mengeluarkan anggota dari organisasi.
 *
 * Sebelumnya tidak ada sama sekali: satu UUID salah ketik hanya bisa
 * ditangguhkan, dan barisnya tinggal selamanya di daftar. Basis data sudah
 * mengizinkan penghapusan anggota non-admin sejak 0013; yang tidak ada hanyalah
 * jalannya.
 *
 * Nol baris diperlakukan sebagai penolakan, dengan alasan yang sama seperti
 * PATCH di atas.
 */
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const selected = selectedInstitution(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);

  const memberId = new URL(request.url).searchParams.get("memberId")?.trim();
  if (!memberId) return gagal("UNKNOWN", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("institution_members")
    .delete()
    .eq("id", memberId)
    .eq("institution_id", selected)
    .select("id");

  if (error) return gagal(kodeDariPostgres(error.message), 400);
  if (!data || data.length === 0) return gagal("MEMBER_NOT_CHANGED", 403);

  await withPortalRpc(await createServerSupabaseClient())
    .rpc("log_institution_view", {
      p_institution_id: selected,
      p_artifact: "ORGANIZATION",
      p_action: "manage",
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ ok: true });
}
