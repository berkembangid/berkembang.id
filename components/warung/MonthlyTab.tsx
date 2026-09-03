"use client";

/**
 * Tab "Bulan Ini" untuk pemilik usaha.
 *
 * Empat kotak, satu kalimat, grafik enam bulan, dan daftar pelanggan yang
 * belum bayar. Semua angkanya berasal dari satu sumber yang sama dengan
 * laporan SAK EMKM; yang berbeda hanya bahasanya.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, LoaderCircle, Minus, RefreshCcw } from "lucide-react";
import { AccountingClientError, getWarungReportClient } from "@/modules/accounting/accounting-client";
import type { WarungReportView } from "@/modules/accounting/reports";
import { comparisonBadgeText, formatIdr, monthLabel, warungBoxLabels } from "@/modules/accounting/warung";
import { StockCountCard } from "@/components/warung/StockCountCard";

const boxTone = {
  salesIdr: { border: "border-[#a9ebd0]", bg: "bg-[#edfbf5]", text: "text-[#0b7a55]" },
  spendingIdr: { border: "border-[#f3c6cf]", bg: "bg-[#fdf1f3]", text: "text-[#b4304a]" },
  netIncomeIdr: { border: "border-[#addcf4]", bg: "bg-[#eef8fd]", text: "text-[#0b5f86]" },
  householdIdr: { border: "border-[#f0d9a8]", bg: "bg-[#fdf8ee]", text: "text-[#8a6412]" },
} as const;

export function MonthlyTab({ month }: { month: string }) {
  const [report, setReport] = useState<WarungReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await getWarungReportClient(month));
    } catch (cause) {
      setError(
        cause instanceof AccountingClientError ? cause.message : "Ringkasan bulan ini belum dapat dimuat.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    // Pola yang sama dengan halaman laporan: tunda satu tick supaya
    // pengambilan data tidak memicu render berantai.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-[#6e859e]">
        <LoaderCircle className="animate-spin" size={18} /> Menghitung bulan ini...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl border border-[#f3c6cf] bg-[#fdf1f3] p-4 text-xs font-semibold text-[#b4304a]">
        <AlertCircle size={16} /> {error || "Ringkasan bulan ini belum dapat dimuat."}
        <button onClick={() => void load()} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold">
          <RefreshCcw size={13} /> Coba lagi
        </button>
      </div>
    );
  }

  const chartMax = Math.max(...report.series.map((row) => Math.abs(row.netIncomeIdr)), 1);
  const changeIcon = report.comparison.partial ? (
    <Minus size={14} />
  ) : report.comparison.direction === "naik" ? (
      <ArrowUpRight size={14} />
    ) : report.comparison.direction === "turun" ? (
      <ArrowDownRight size={14} />
    ) : (
      <Minus size={14} />
    );

  return (
    <div className="space-y-4">
      <section aria-label="Ringkasan bulan ini" className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {(Object.keys(warungBoxLabels) as Array<keyof typeof warungBoxLabels>).map((key) => {
          const tone = boxTone[key];
          const value = report.boxes[key];
          return (
            <article key={key} className={`rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6e859e]">{warungBoxLabels[key]}</p>
              <p className={`mt-2 text-lg font-black md:text-xl ${tone.text}`}>
                {value < 0 ? "-" : ""}
                {formatIdr(value)}
              </p>
            </article>
          );
        })}
      </section>

      <p className="rounded-2xl border border-[#bac3ff] bg-[#f7f8ff] p-4 text-sm font-semibold leading-relaxed text-[#1b2a3a]">
        {report.sentence}
      </p>

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1b2a3a]">Untung 6 bulan terakhir</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
              report.comparison.partial
                ? "bg-[#f3f6f9] text-[#6e859e]"
                : report.comparison.direction === "naik"
                  ? "bg-[#edfbf5] text-[#0b7a55]"
                  : report.comparison.direction === "turun"
                    ? "bg-[#fdf1f3] text-[#b4304a]"
                    : "bg-[#f3f6f9] text-[#6e859e]"
            }`}
          >
            {changeIcon}
            {comparisonBadgeText(report.comparison)}
          </span>
        </div>
        <div className="mt-5 flex h-44 items-stretch gap-2">
          {report.series.map((row) => {
            const empty = row.netIncomeIdr === 0;
            const height = empty ? 0 : Math.max(4, Math.round((Math.abs(row.netIncomeIdr) / chartMax) * 100));
            const negative = row.netIncomeIdr < 0;
            return (
              <div key={row.periodMonth} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] font-bold tabular-nums text-[#6e859e]">
                  {empty ? "—" : `${negative ? "−" : ""}${formatIdr(row.netIncomeIdr)}`}
                </span>
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className={`w-full max-w-10 rounded-t-lg ${negative ? "bg-[#e08a92]" : "bg-[#0b5f86]"}`}
                    style={{ height: `${height}%` }}
                    role="img"
                    aria-label={`${monthLabel(row.periodMonth)}: ${empty ? "belum ada catatan" : `${negative ? "rugi" : "untung"} ${formatIdr(row.netIncomeIdr)}`}`}
                  />
                </div>
                <span className="text-[10px] font-bold text-[#6e859e]">{monthLabel(row.periodMonth)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <StockCountCard month={month} onSaved={() => void load()} />

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1b2a3a]">Pelanggan yang belum bayar</h3>
          <span className="text-xs font-bold text-[#8a6412]">{formatIdr(report.receivableTotalIdr)}</span>
        </div>
        {report.receivables.length === 0 ? (
          <p className="mt-3 text-xs text-[#6e859e]">Semua pelanggan sudah membayar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eef2f6]">
            {report.receivables.map((row) => (
              <li key={row.transactionId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-[#1b2a3a]">
                    {row.counterpartyName ?? row.description}
                  </strong>
                  <small className="text-[10px] text-[#6e859e]">{row.transactionDate}</small>
                </span>
                <span className="shrink-0 text-xs font-black text-[#8a6412]">{formatIdr(row.amountIdr)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
