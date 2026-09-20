import { NextResponse } from "next/server";
import { gagal, kodeDariPesanDb } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { buktiInputSchema } from "@/modules/rekening/rekening-schema";

/**
 * Melampirkan bukti rekening, sekaligus menyatakannya benar.
 *
 * Satu ketukan, bukan dua. Berkasnya sudah diunggah lebih dulu lewat jalur
 * dokumen yang biasa -- rute ini hanya menautkannya dan mencatat pernyataan
 * pemilik, karena tanpa pernyataan itu yang kita punya hanya sebuah berkas di
 * rak, bukan jawaban atas pertanyaan "apakah rekening ini memang rekening
 * usahanya".
 */
export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);

  const body = await request.json().catch(() => null);
  const parsed = buktiInputSchema.safeParse(body);
  if (!parsed.success) return gagal("DOKUMEN_TIDAK_DIKENAL", 400);

  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("attach_business_bank_account_evidence", {
    p_document_id: parsed.data.documentId,
  });
  if (error) return gagal(kodeDariPesanDb(error.message));
  return NextResponse.json({ data });
}
