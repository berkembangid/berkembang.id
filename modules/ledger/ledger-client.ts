import type { CloseLedgerDayInput, LedgerRange, LedgerTransactionInput } from "@/modules/ledger/ledger-schema";
import type { LedgerReportView } from "@/modules/ledger/ledger-repository";

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
