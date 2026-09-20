import { NextResponse } from "next/server";
import { gagal, kodeDariPesanDb } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { rekeningInputSchema } from "@/modules/rekening/rekening-schema";

/**
 * Rekening usaha: satu catatan per usaha.
 *
 * Seluruh tulisannya lewat fungsi basis data, bukan lewat tabel. Bukan karena
 * RLS-nya kurang, melainkan karena setiap perubahan di sini harus meninggalkan
 * jejak audit, dan jejak yang ditulis di sisi rute akan hilang pada jalur mana
 * pun yang kelak menulis langsung.
 *
 * Kode galat dari basis data DIKENALI, bukan diteruskan mentah: pesan
 * PostgreSQL bisa memuat nama kolom dan nilai baris, dan yang membaca
 * notifikasi ini pemilik warung.
 */

export async function GET() {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_business_bank_account");
  if (error) return gagal("REKENING_UNAVAILABLE", 503);
  // `null` bukan galat: usaha yang belum punya catatan rekening menjawab
  // keadaan kosong, dan layarnya menampilkan ajakan, bukan pesan gagal.
  return NextResponse.json({ data: data ?? null });
}

export async function PUT(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);

  const body = await request.json().catch(() => null);
  const parsed = rekeningInputSchema.safeParse(body);
  if (!parsed.success) return gagal("REKENING_ISIAN_KURANG", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("save_business_bank_account", {
    p_bank_name: parsed.data.bankName,
    p_account_holder_name: parsed.data.accountHolderName,
    p_account_last4: parsed.data.accountLast4,
  });
  if (error) return gagal(kodeDariPesanDb(error.message));
  return NextResponse.json({ data });
}

export async function DELETE() {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("forget_business_bank_account");
  if (error) return gagal(kodeDariPesanDb(error.message));
  return NextResponse.json({ data });
}
