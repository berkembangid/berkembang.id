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
import { formatTanggal } from "@/lib/format";

const boxTone = {
  salesIdr: { border: "border-umkm-success-line", bg: "bg-umkm-success-soft", text: "text-umkm-success" },
  spendingIdr: { border: "border-umkm-danger-line", bg: "bg-umkm-danger-soft", text: "text-umkm-danger" },
  netIncomeIdr: { border: "border-umkm-brand-line", bg: "bg-umkm-brand-soft", text: "text-umkm-brand" },
  householdIdr: { border: "border-umkm-warning-line", bg: "bg-umkm-warning-soft", text: "text-umkm-warning" },
} as const;

export function MonthlyTab({ month, onManageContacts }: { month: string; onManageContacts?: () => void }) {
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
      <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-umkm-subtle">
        <LoaderCircle className="animate-spin" size={18} /> Menghitung bulan ini...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl border border-umkm-danger-line bg-umkm-danger-soft p-4 text-xs font-semibold text-umkm-danger">
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
      {/*
        Empat kolom mulai dari `xl`, bukan `md`.

        `md` adalah breakpoint yang sama dengan munculnya menu samping 272px.
        Pada 768px keduanya menyala bersamaan: tiap kartu tinggal 99px,
        sementara "Rp4.538.166" pada `text-lg font-black` butuh 128px. Angkanya
        meluber keluar kartunya sendiri dan menyeret seluruh halaman menggulir
        ke samping -- di halaman yang justru dibuka untuk MEMBACA angka itu.
      */}
      <section aria-label="Ringkasan bulan ini" className="grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-3">
        {(Object.keys(warungBoxLabels) as Array<keyof typeof warungBoxLabels>).map((key) => {
          const tone = boxTone[key];
          const value = report.boxes[key];
          return (
            <article key={key} className={`rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-umkm-subtle">{warungBoxLabels[key]}</p>
              <p className={`mt-2 text-lg font-black md:text-xl ${tone.text}`}>
                {value < 0 ? "-" : ""}
                {formatIdr(value)}
              </p>
            </article>
          );
        })}
      </section>

      <p className="rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-4 text-sm font-semibold leading-relaxed text-umkm-ink">
        {report.sentence}
      </p>

      <section className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-umkm-ink">Untung 6 bulan terakhir</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
              report.comparison.partial
                ? "bg-umkm-surface-muted text-umkm-subtle"
                : report.comparison.direction === "naik"
                  ? "bg-umkm-success-soft text-umkm-success"
                  : report.comparison.direction === "turun"
                    ? "bg-umkm-danger-soft text-umkm-danger"
                    : "bg-umkm-surface-muted text-umkm-subtle"
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
                <span className="text-xs font-bold tabular-nums text-umkm-subtle">
                  {empty ? "—" : `${negative ? "−" : ""}${formatIdr(row.netIncomeIdr)}`}
                </span>
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className={`w-full max-w-10 rounded-t-lg ${negative ? "bg-[#e08a92]" : "bg-umkm-brand"}`}
                    style={{ height: `${height}%` }}
                    role="img"
                    aria-label={`${monthLabel(row.periodMonth)}: ${empty ? "belum ada catatan" : `${negative ? "rugi" : "untung"} ${formatIdr(row.netIncomeIdr)}`}`}
                  />
                </div>
                <span className="text-xs font-bold text-umkm-subtle">{monthLabel(row.periodMonth)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <StockCountCard month={month} onSaved={() => void load()} />

      <section className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-umkm-ink">Pelanggan yang belum bayar</h3>
          <span className="text-xs font-bold text-umkm-warning">{formatIdr(report.receivableTotalIdr)}</span>
        </div>
        {onManageContacts && report.receivables.length > 0 && (
          <button type="button" onClick={onManageContacts} className="mt-1 inline-flex min-h-11 items-center text-xs font-bold text-umkm-brand">
            Tagih atau tandai lunas →
          </button>
        )}
        {report.receivables.length === 0 ? (
          <p className="mt-3 text-xs text-umkm-subtle">Semua pelanggan sudah membayar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-umkm-line-soft">
            {report.receivables.map((row) => (
              <li key={row.transactionId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-umkm-ink">
                    {row.counterpartyName ?? row.description}
                  </strong>
                  {row.transactionDate && <small className="text-xs text-umkm-subtle">sejak {formatTanggal(row.transactionDate)}</small>}
                </span>
                <span className="shrink-0 text-xs font-black text-umkm-warning">{formatIdr(row.amountIdr)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
