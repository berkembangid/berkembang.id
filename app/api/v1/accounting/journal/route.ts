import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { journalQuerySchema } from "@/modules/accounting/accounting-schema";
import { ensurePeriodPosted } from "@/modules/accounting/period";
import { jakartaDate } from "@/modules/ledger/capture-schema";
import { getJournal } from "@/modules/accounting/reports";

function optionalNumber(value: string | null) {
  return value === null || value.trim() === "" ? undefined : Number(value);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const query = journalQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      limit: optionalNumber(url.searchParams.get("limit")),
      offset: optionalNumber(url.searchParams.get("offset")),
    });
    if (!query.success) return accountingValidationErrorResponse(query.error);

    // Penyusutan dan pajak diposting lebih dulu, sebelum angkanya dibaca.
    //
    // Tanpa ini, pemilik yang membuka layar ini SEBELUM pernah membuka Laporan
    // Posisi Keuangan melihatnya tanpa satu baris penyusutan pun -- padahal
    // alatnya sudah tercatat. Dan ia SEMBUH SENDIRI begitu Posisi Keuangan
    // dibuka sekali, jadi yang dilihat pemilik bukan angka yang salah,
    // melainkan angka yang berubah tanpa ia mengubah apa pun.
    // Rentang jurnal boleh terbuka di ujungnya; kalau `to` tidak diisi, yang
    // dipastikan adalah hari ini -- bulan yang tertinggal tetap terposting.
    await ensurePeriodPosted(query.data.to ?? jakartaDate());

    return Response.json(
      { data: await getJournal(user.id, query.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
