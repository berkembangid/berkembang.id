import type { EmkmCategoryInput } from "@/modules/accounting/accounting-schema";
import type {
  FixedAssetDisposalInput,
  FixedAssetInput,
  FixedAssetUpdateInput,
  InventoryCountInput,
  LoanInput,
  LoanUpdateInput,
  OpeningBalanceCorrectionInput,
  OpeningBalancesInput,
} from "@/modules/accounting/period-schema";
import type { BalanceSheetView, CashFlowView } from "@/modules/accounting/balance-sheet";
import type {
  FixedAssetView,
  InventoryCountView,
  LoanView,
  NotesPayload,
  OpeningBalanceAnswers,
  OpeningBalanceView,
  ReminderView,
  TaxEstimateView,
} from "@/modules/accounting/period";
import type {
  GeneralLedgerView,
  IncomeStatementView,
  JournalEntryView,
  NeedsReclassView,
  TrialBalanceRow,
  WarungReportView,
} from "@/modules/accounting/reports";

export class AccountingClientError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "AccountingClientError";
  }
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init).catch(() => {
    throw new AccountingClientError("NETWORK_ERROR", "Koneksi terputus. Silakan coba lagi.", true);
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string; retryable?: boolean } }
    | null;
  if (!response.ok) {
    throw new AccountingClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "Permintaan belum berhasil.",
      payload?.error?.retryable === true,
    );
  }
  if (!payload?.data) {
    throw new AccountingClientError("INVALID_RESPONSE", "Respons catatan usaha tidak valid.", true);
  }
  return payload.data;
}

export const getWarungReportClient = (month: string) =>
  requestData<WarungReportView>(`/api/v1/reports/warung?month=${month}`, { cache: "no-store" });

export const getIncomeStatementClient = (from: string, to: string, compare = false) =>
  requestData<{ current: IncomeStatementView; previous: IncomeStatementView | null }>(
    `/api/v1/reports/income-statement?from=${from}&to=${to}&compare=${compare ? "true" : "false"}`,
    { cache: "no-store" },
  );

export const getJournalClient = (params: { from?: string; to?: string; source?: string; limit?: number }) => {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.source) search.set("source", params.source);
  if (params.limit) search.set("limit", String(params.limit));
  return requestData<{ entries: JournalEntryView[]; hasMore: boolean }>(
    `/api/v1/accounting/journal?${search.toString()}`,
    { cache: "no-store" },
  );
};

export const getTrialBalanceClient = (asOf: string) =>
  requestData<{ asOf: string; rows: TrialBalanceRow[]; totalDebitIdr: number; totalCreditIdr: number; balanced: boolean }>(
    `/api/v1/accounting/trial-balance?asOf=${asOf}`,
    { cache: "no-store" },
  );

export const getGeneralLedgerClient = (accountCode: string, from: string, to: string) =>
  requestData<GeneralLedgerView>(
    `/api/v1/accounting/ledger/${accountCode}?from=${from}&to=${to}`,
    { cache: "no-store" },
  );

/** Ekspor jurnal bukan JSON: tautannya diserahkan apa adanya ke peramban. */
export const journalExportUrl = (from: string, to: string) =>
  `/api/v1/accounting/export.csv?from=${from}&to=${to}`;

export const getTaxEstimateClient = (asOf: string) =>
  requestData<TaxEstimateView>(`/api/v1/reports/tax-estimate?asOf=${asOf}`, { cache: "no-store" });

export const getRemindersClient = (asOf: string) =>
  requestData<{ reminders: ReminderView[] }>(`/api/v1/reports/reminders?asOf=${asOf}`, {
    cache: "no-store",
  });

export const getNeedsReclassClient = () =>
  requestData<{ transactions: NeedsReclassView[] }>("/api/v1/ledger/transactions/needs-reclass", {
    cache: "no-store",
  });

export const reclassTransactionClient = (transactionId: string, input: EmkmCategoryInput) =>
  requestData<{ transactionId: string; emkmCategoryCode: number }>(
    `/api/v1/ledger/transactions/${transactionId}/reclass`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

export const getOpeningBalanceClient = () =>
  requestData<{ openingBalance: OpeningBalanceView | null }>("/api/v1/opening-balances", { cache: "no-store" });

export const saveOpeningBalancesClient = (input: OpeningBalancesInput) =>
  requestData<{ openingBalanceId: string; startDate: string; equityIdr?: number; negativeEquity?: boolean; idempotent: boolean }>(
    "/api/v1/opening-balances",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );

export const getBalanceSheetClient = (asOf: string, compare = false) =>
  requestData<{ current: BalanceSheetView; previous: BalanceSheetView | null }>(
    `/api/v1/reports/balance-sheet?asOf=${asOf}&compare=${compare ? "true" : "false"}`,
    { cache: "no-store" },
  );

export const getCashFlowClient = (from: string, to: string) =>
  requestData<CashFlowView>(`/api/v1/reports/cash-flow?from=${from}&to=${to}`, { cache: "no-store" });

export const getNotesClient = (from: string, to: string) =>
  requestData<{ policies: ReadonlyArray<{ title: string; body: string }>; notes: NotesPayload }>(
    `/api/v1/reports/notes?from=${from}&to=${to}`,
    { cache: "no-store" },
  );

export const getFixedAssetsClient = () =>
  requestData<{ fixedAssets: FixedAssetView[] }>("/api/v1/fixed-assets", { cache: "no-store" });

export const registerFixedAssetClient = (input: FixedAssetInput) =>
  requestData<{ fixedAssetId: string }>("/api/v1/fixed-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

export const getLoansClient = () =>
  requestData<{ loans: LoanView[] }>("/api/v1/loans", { cache: "no-store" });

export const registerLoanClient = (input: LoanInput) =>
  requestData<{ loanId: string }>("/api/v1/loans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

export const getInventoryCountClient = (month: string) =>
  requestData<{ inventoryCount: InventoryCountView }>(`/api/v1/inventory-counts?month=${month}`, {
    cache: "no-store",
  });

export const saveInventoryCountClient = (input: InventoryCountInput) =>
  requestData<{ countedValueIdr: number; previousValueIdr: number; adjustmentIdr: number }>(
    "/api/v1/inventory-counts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );

export const getOpeningBalanceAnswersClient = () =>
  requestData<{ answers: OpeningBalanceAnswers | null }>("/api/v1/opening-balances/answers", {
    cache: "no-store",
  });

export const correctOpeningBalancesClient = (input: OpeningBalanceCorrectionInput) =>
  requestData<{ startDate: string; equityIdr: number; depreciationMonthsRecomputed: number }>(
    "/api/v1/opening-balances",
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );

export const updateFixedAssetClient = (assetId: string, input: FixedAssetUpdateInput) =>
  requestData<{ fixedAssetId: string; usefulLifeMonths: number }>(`/api/v1/fixed-assets/${assetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

export const disposeFixedAssetClient = (assetId: string, input: FixedAssetDisposalInput) =>
  requestData<{ fixedAssetId: string; bookValueIdr: number; proceedsIdr: number; resultIdr: number }>(
    `/api/v1/fixed-assets/${assetId}/dispose`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );

export const updateLoanClient = (loanId: string, input: LoanUpdateInput) =>
  requestData<{ loanId: string; lenderName: string }>(`/api/v1/loans/${loanId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
