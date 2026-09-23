import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerOperationError } from "@/modules/ledger/ledger-errors";
import { categoryGroupLabels, categoryLabels, paymentMethodLabels, type CloseLedgerDayInput, type LedgerRange, type LedgerTransactionInput } from "@/modules/ledger/ledger-schema";
import { categoryLabel as emkmCategoryLabel } from "@/modules/accounting/templates";

const mutationResultSchema = z.object({ transactionId: z.uuid(), idempotent: z.boolean().optional(), status: z.string().optional(), journalEntryId: z.uuid().nullable().optional() });
const closingResultSchema = z.object({ closingId: z.uuid(), status: z.literal("closed"), idempotent: z.boolean() });

function rpcError(error: { message: string } | null) {
  return error ? ledgerOperationError(new Error(error.message), "SERVICE_UNAVAILABLE") : null;
}

export async function activeBusinessId(userId: string) {
  const client = await createServerSupabaseClient();
  // UMKM gratis satu pemilik: usaha aktif ditentukan dari kepemilikan profil,
  // tanpa konsep role ataupun keanggotaan.
  const { data, error } = await client.from("businesses").select("id")
    .eq("legacy_profile_id", userId).eq("status", "active")
    .order("created_at", { ascending: true }).limit(1);
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  if (data?.[0]?.id) return data[0].id;

  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    const { data: profile } = await admin.from("profiles").select("name,nama_usaha,sektor_usaha,lokasi,phone").eq("id", userId).maybeSingle();
    const businessName = profile?.nama_usaha || profile?.name || "Usaha Saya";
    const { data: created } = await admin.from("businesses").insert({
      legacy_profile_id: userId,
      name: businessName,
      legal_name: businessName,
      sector: profile?.sektor_usaha || "Lainnya",
      location: profile?.lokasi || null,
      phone: profile?.phone || null,
      status: "active",
    }).select("id").single();
    if (created?.id) return created.id;
  } catch {}

  throw new LedgerOperationError("BUSINESS_ACCESS_DENIED");
}

export type LedgerTransactionView = {
  id: string; transactionType: "income" | "expense"; amountIdr: number; transactionDate: string;
  categoryGroup: string; categoryCode: string; categoryLabel: string; description: string;
  quantity: number | null; unit: string | null; unitPriceIdr: number | null; paymentMethod: string | null;
  salesChannel: string | null; counterparty: string | null; status: "confirmed" | "cancelled";
  /** Kategori bahasa warung (1..10) -- yang dipilih di Catat. Null untuk catatan sangat lama. */
  emkmCategoryCode: number | null; emkmCategorySubtype: string | null;
  changeCount: number; createdAt: string; updatedAt: string;
  /** Berapa bukti yang menempel. Dihitung bersama daftarnya, bukan per baris. */
  attachmentCount: number;
};

export type DailyClosingView = {
  id: string; closingDate: string; systemCashInIdr: number; systemCashOutIdr: number;
  openingCashIdr: number | null; expectedCashIdr: number | null; physicalCashIdr: number | null;
  differenceIdr: number | null; transactionCount: number; note: string | null; closedAt: string;
};

export type LedgerReportView = {
  range: LedgerRange; transactions: LedgerTransactionView[]; closings: DailyClosingView[];
  summary: { incomeIdr: number; expenseIdr: number; netIdr: number; transactionCount: number; activityDays: number };
  categoryDistribution: Array<{ code: string; label: string; amountIdr: number }>;
  paymentDistribution: Array<{ code: string; label: string; amountIdr: number }>;
};

export async function getLedgerReport(userId: string, range: LedgerRange): Promise<LedgerReportView> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const [transactionResult, closingResult] = await Promise.all([
    client.from("transactions").select("id,direction,type,amount_idr,nominal,transaction_date,tanggal,category_group,category_code,category,kategori,item,quantity,unit,unit_price_idr,payment_method,sales_channel,counterparty,ledger_status,created_at,updated_at,emkm_category_code,emkm_category_subtype")
      .eq("business_id", businessId).gte("transaction_date", range.startDate).lte("transaction_date", range.endDate)
      .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
    client.from("daily_closings").select("id,closing_date,system_cash_in_idr,system_cash_out_idr,opening_cash_idr,expected_cash_idr,physical_cash_idr,difference_idr,transaction_count,note,closed_at")
      .eq("business_id", businessId).eq("status", "closed").gte("closing_date", range.startDate).lte("closing_date", range.endDate)
      .order("closing_date", { ascending: false }),
  ]);
  if (transactionResult.error || closingResult.error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", transactionResult.error ?? closingResult.error);
  const transactionIds = (transactionResult.data ?? []).map((row) => row.id);
  const changes = transactionIds.length > 0
    ? await client.from("transaction_changes").select("transaction_id").in("transaction_id", transactionIds)
    : { data: [], error: null };
  if (changes.error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", changes.error);
  const changeCounts = new Map<string, number>();
  for (const row of changes.data ?? []) changeCounts.set(row.transaction_id, (changeCounts.get(row.transaction_id) ?? 0) + 1);
  // Bukti ikut dalam satu permintaan yang sama, dengan pola yang sama seperti
  // riwayat perubahan. Menanyakannya per baris akan mengubah satu layar
  // riwayat menjadi puluhan permintaan.
  const attachments = transactionIds.length > 0
    ? await client.from("document_attachments").select("target_id")
        .eq("target_type", "transaction").in("target_id", transactionIds).is("removed_at", null)
    : { data: [], error: null };
  if (attachments.error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", attachments.error);
  const attachmentCounts = new Map<string, number>();
  for (const row of attachments.data ?? []) attachmentCounts.set(row.target_id, (attachmentCounts.get(row.target_id) ?? 0) + 1);
  const transactions: LedgerTransactionView[] = (transactionResult.data ?? []).map((row) => {
    const direction = row.direction === "expense" || row.type === "keluar" ? "expense" : "income";
    const code = row.category_code ?? "other";
    return {
      id: row.id, transactionType: direction, amountIdr: Number(row.amount_idr ?? row.nominal ?? 0),
      transactionDate: row.transaction_date ?? row.tanggal ?? range.startDate,
      categoryGroup: row.category_group ?? (direction === "income" ? "sales" : "other"), categoryCode: code,
      // Label bahasa warung lebih dulu: itu yang dipilih pemilik di Catat, dan
      // Buku Kas dulu menampilkan kata yang berbeda untuk transaksi yang sama.
      categoryLabel: row.emkm_category_code ? emkmCategoryLabel(row.emkm_category_code, row.emkm_category_subtype) : categoryLabels[code] ?? row.category ?? row.kategori ?? categoryGroupLabels[row.category_group ?? "other"],
      emkmCategoryCode: row.emkm_category_code ?? null, emkmCategorySubtype: row.emkm_category_subtype ?? null,
      description: row.item, quantity: row.quantity === null ? null : Number(row.quantity), unit: row.unit,
      unitPriceIdr: row.unit_price_idr === null ? null : Number(row.unit_price_idr), paymentMethod: row.payment_method,
      salesChannel: row.sales_channel, counterparty: row.counterparty,
      status: row.ledger_status === "cancelled" ? "cancelled" : "confirmed", changeCount: changeCounts.get(row.id) ?? 0,
      attachmentCount: attachmentCounts.get(row.id) ?? 0,
      createdAt: row.created_at ?? "", updatedAt: row.updated_at ?? "",
    };
  });
  const active = transactions.filter((item) => item.status === "confirmed");
  const incomeIdr = active.filter((item) => item.transactionType === "income").reduce((sum, item) => sum + item.amountIdr, 0);
  const expenseIdr = active.filter((item) => item.transactionType === "expense").reduce((sum, item) => sum + item.amountIdr, 0);
  // Kategori dikelompokkan menurut LABEL yang tampil, bukan kode lama: dua
  // catatan "Gaji / upah" -- satu dari suara, satu dari formulir -- dulu bisa
  // jatuh ke dua baris berbeda karena kode lamanya tidak sama.
  const aggregate = (key: "categoryCode" | "paymentMethod") => {
    const totals = new Map<string, { label: string; amountIdr: number }>();
    for (const item of active) {
      const code = key === "paymentMethod" ? item.paymentMethod ?? "unknown" : item.categoryLabel;
      const label = key === "paymentMethod" ? paymentMethodLabels[code] ?? code : item.categoryLabel;
      const entry = totals.get(code) ?? { label, amountIdr: 0 };
      entry.amountIdr += item.amountIdr;
      totals.set(code, entry);
    }
    return [...totals.entries()].map(([code, entry]) => ({ code, label: entry.label, amountIdr: entry.amountIdr })).sort((a, b) => b.amountIdr - a.amountIdr);
  };
  return {
    range, transactions,
    closings: (closingResult.data ?? []).map((row) => ({
      id: row.id, closingDate: row.closing_date, systemCashInIdr: Number(row.system_cash_in_idr), systemCashOutIdr: Number(row.system_cash_out_idr),
      openingCashIdr: row.opening_cash_idr === null ? null : Number(row.opening_cash_idr), expectedCashIdr: row.expected_cash_idr === null ? null : Number(row.expected_cash_idr),
      physicalCashIdr: row.physical_cash_idr === null ? null : Number(row.physical_cash_idr), differenceIdr: row.difference_idr === null ? null : Number(row.difference_idr),
      transactionCount: row.transaction_count, note: row.note, closedAt: row.closed_at,
    })),
    summary: { incomeIdr, expenseIdr, netIdr: incomeIdr - expenseIdr, transactionCount: active.length, activityDays: new Set(active.map((item) => item.transactionDate)).size },
    categoryDistribution: aggregate("categoryCode"), paymentDistribution: aggregate("paymentMethod"),
  };
}

function rpcArgs(input: LedgerTransactionInput) {
  return { p_transaction_type: input.transactionType, p_amount_idr: input.amountIdr, p_transaction_date: input.transactionDate,
    p_category_group: input.categoryGroup, p_category_code: input.categoryCode, p_description: input.description,
    p_quantity: input.quantity ?? undefined, p_unit: input.unit ?? undefined, p_unit_price_idr: input.unitPriceIdr ?? undefined,
    p_payment_method: input.paymentMethod ?? undefined, p_sales_channel: input.salesChannel ?? undefined, p_counterparty: input.counterparty ?? undefined,
    p_emkm_category_code: input.emkmCategoryCode ?? undefined, p_emkm_category_subtype: input.emkmCategorySubtype ?? undefined,
    p_counterparty_id: input.counterpartyId ?? undefined, p_interest_amount_idr: input.interestAmountIdr ?? undefined,
    p_asset_category: input.assetCategory ?? undefined, p_asset_useful_life_months: input.assetUsefulLifeMonths ?? undefined };
}
export async function createLedgerTransaction(input: LedgerTransactionInput, idempotencyKey: string) {
  const client = await createServerSupabaseClient(); const { data, error } = await client.rpc("create_ledger_transaction", { p_idempotency_key: idempotencyKey, ...rpcArgs(input) });
  const operationError = rpcError(error); if (operationError) throw operationError; return mutationResultSchema.parse(data);
}
export async function updateLedgerTransaction(id: string, input: LedgerTransactionInput, reason: string) {
  const client = await createServerSupabaseClient(); const { data, error } = await client.rpc("update_ledger_transaction", { p_transaction_id: id, p_reason: reason, ...rpcArgs(input) });
  const operationError = rpcError(error); if (operationError) throw operationError; return mutationResultSchema.parse(data);
}
export async function cancelLedgerTransaction(id: string, reason: string) {
  const client = await createServerSupabaseClient(); const { data, error } = await client.rpc("cancel_ledger_transaction", { p_transaction_id: id, p_reason: reason });
  const operationError = rpcError(error); if (operationError) throw operationError; return mutationResultSchema.parse(data);
}
export async function closeLedgerDay(input: CloseLedgerDayInput) {
  const client = await createServerSupabaseClient(); const { data, error } = await client.rpc("close_ledger_day", { p_closing_date: input.closingDate, p_opening_cash_idr: input.openingCashIdr ?? undefined, p_physical_cash_idr: input.physicalCashIdr ?? undefined, p_note: input.note ?? undefined });
  const operationError = rpcError(error); if (operationError) throw operationError; return closingResultSchema.parse(data);
}

/**
 * Satu sel CSV. Awalan `=`, `+`, `-`, dan `@` diberi kutip tunggal lebih dulu
 * supaya berkasnya tidak menjalankan rumus saat dibuka di Excel atau Sheets --
 * berkas ini dikirim ke bank dan koperasi, bukan hanya dibaca pemiliknya.
 */
export function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function ledgerReportCsv(report: LedgerReportView) {
  // Pihak lawan ikut: bank dan koperasi yang menerima berkas ini menanyakan
  // "dibayar siapa" dan "dijual ke siapa" untuk piutang dan utang.
  const rows = [["Tanggal","Keterangan","Jenis","Nominal (Rp)","Kategori","Pembayaran","Pelanggan / pemasok","Status"],
    ...report.transactions.map((item) => [item.transactionDate,item.description,item.transactionType === "income" ? "Pemasukan" : "Pengeluaran",item.amountIdr,item.categoryLabel,paymentMethodLabels[item.paymentMethod ?? "unknown"] ?? "Belum dicatat",item.counterparty ?? "",item.status === "cancelled" ? "Dibatalkan" : "Aktif"]),
    [],["TOTAL PEMASUKAN","","",report.summary.incomeIdr],["TOTAL PENGELUARAN","","",report.summary.expenseIdr],["SELISIH BERSIH","","",report.summary.netIdr]];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export type TransactionChangeView = {
  id: string;
  action: "created" | "updated" | "cancelled" | "adjusted" | string;
  reason: string | null;
  createdAt: string;
  before: { amountIdr?: number; type?: string; date?: string; emkmCategoryCode?: number | null } | null;
  after: { amountIdr?: number; type?: string; date?: string; emkmCategoryCode?: number | null } | null;
};

/**
 * Riwayat perubahan satu transaksi, terbaru dulu.
 *
 * Lencana « Pernah diubah » sudah lama tampil di Buku Kas, tetapi isinya tidak
 * bisa dibuka -- padahal alasan perubahan wajib ditulis justru supaya bisa
 * dibaca kembali. RLS `transaction_changes_select` membatasi ke usaha sendiri.
 */
export async function listTransactionChanges(transactionId: string): Promise<TransactionChangeView[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("transaction_changes")
    .select("id,action,reason,created_at,previous_values,new_values")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    reason: row.reason,
    createdAt: row.created_at,
    before: (row.previous_values ?? null) as TransactionChangeView["before"],
    after: (row.new_values ?? null) as TransactionChangeView["after"],
  }));
}
