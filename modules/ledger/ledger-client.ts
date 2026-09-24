import type { CloseLedgerDayInput, LedgerRange, LedgerTransactionInput } from "@/modules/ledger/ledger-schema";
import type { LedgerReportView, TransactionChangeView } from "@/modules/ledger/ledger-repository";

export class LedgerClientError extends Error { constructor(readonly code: string, message: string, readonly retryable: boolean) { super(message); } }
async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init).catch(() => { throw new LedgerClientError("NETWORK_ERROR", "Koneksi terputus. Silakan coba lagi.", true); });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string; retryable?: boolean } } | null;
  if (!response.ok) throw new LedgerClientError(payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "Permintaan belum berhasil.", payload?.error?.retryable === true);
  if (!payload?.data) throw new LedgerClientError("INVALID_RESPONSE", "Respons buku kas tidak valid.", true);
  return payload.data;
}
export const getLedgerReportClient = (range: LedgerRange) => requestData<LedgerReportView>(`/api/v1/ledger?startDate=${range.startDate}&endDate=${range.endDate}`, { cache: "no-store" });
export const createLedgerTransactionClient = (data: LedgerTransactionInput) => requestData<{ transactionId: string }>("/api/v1/ledger", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `ledger:${crypto.randomUUID()}` }, body: JSON.stringify(data) });
export const updateLedgerTransactionClient = (id: string, data: LedgerTransactionInput, reason: string) => requestData<{ transactionId: string }>(`/api/v1/ledger/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, reason }) });
export const cancelLedgerTransactionClient = (id: string, reason: string) => requestData<{ transactionId: string }>(`/api/v1/ledger/transactions/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
export const closeLedgerDayClient = (data: CloseLedgerDayInput) => requestData<{ closingId: string }>("/api/v1/ledger/daily-closing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
export const getTransactionChangesClient = (id: string) => requestData<TransactionChangeView[]>(`/api/v1/ledger/transactions/${id}`, { cache: "no-store" });
export const getContactBalancesClient = () => requestData<import("@/modules/ledger/contact-balances").ContactBalance[]>("/api/v1/contacts", { cache: "no-store" });
export const getMonthlyTargetClient = () => requestData<import("@/modules/ledger/targets").MonthlyTarget>("/api/v1/targets", { cache: "no-store" });
export const setMonthlyTargetClient = (target: import("@/modules/ledger/targets").MonthlyTarget) => requestData<import("@/modules/ledger/targets").MonthlyTarget>("/api/v1/targets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
export const getContactDirectoryClient = () => requestData<import("@/modules/ledger/contact-balances").ContactDirectory>("/api/v1/contacts/directory", { cache: "no-store" });
export const mergeContactClient = (from: string, into: string) => requestData<{ from: string; into: string }>("/api/v1/contacts/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, into }) });
export const unmergeContactClient = (name: string) => requestData<{ name: string; removed: boolean }>(`/api/v1/contacts/merge?name=${encodeURIComponent(name)}`, { method: "DELETE" });
export const setContactPhoneClient = (name: string, phone: string | null, kind: "PIUTANG" | "UTANG") => requestData<{ name: string; phone: string | null }>("/api/v1/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, kind }) });
export const listRecurringClient = () => requestData<import("@/modules/ledger/recurring").RecurringView[]>("/api/v1/recurring", { cache: "no-store" });
export const saveRecurringClient = (input: import("@/modules/ledger/recurring").RecurringInput) => requestData<{ id: string }>("/api/v1/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
export const deleteRecurringClient = (id: string) => requestData<{ id: string }>(`/api/v1/recurring/${id}`, { method: "DELETE" });
export const advanceRecurringClient = (id: string, expectedDue: string) => requestData<{ id: string; nextDue: string }>(`/api/v1/recurring/${id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedDue }) });
