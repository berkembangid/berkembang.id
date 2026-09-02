"use client";

/**
 * Tab "Kondisi Usaha": versi bahasa warung dari Laporan Posisi Keuangan.
 *
 * Tiga blok saja — yang saya punya, yang harus saya bayar, dan milik saya
 * bersih. Layar ini sengaja tidak memakai istilah akuntansi. forbidden-terms-allow
 * Selama kondisi awal usaha belum diisi, angkanya tidak bisa jujur, jadi yang
 * tampil adalah ajakan mengisinya.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, Receipt, RefreshCcw, Wallet } from "lucide-react";
import {
  AccountingClientError,
  getBalanceSheetClient,
  getOpeningBalanceAnswersClient,
  getOpeningBalanceClient,
  getTaxEstimateClient,
  getWarungReportClient,
} from "@/modules/accounting/accounting-client";
import type { OpeningBalanceAnswers, TaxEstimateView } from "@/modules/accounting/period";
import { AssetLoanRegister } from "@/components/warung/AssetLoanRegister";
import { FeedbackBanner } from "@/components/dashboard";
import { buildBusinessCondition, type BusinessConditionView } from "@/modules/accounting/balance-sheet";
import { formatIdr, taxEstimateDisclaimer, taxEstimateSentence } from "@/modules/accounting/warung";
import { OpeningBalanceWizard } from "@/components/warung/OpeningBalanceWizard";
import { jakartaDate } from "@/modules/ledger/capture-schema";

type View = "summary" | "edit" | "register";

export function ConditionTab({ asOf = jakartaDate() }: { asOf?: string }) {
  const [condition, setCondition] = useState<BusinessConditionView | null>(null);
  const [needsOpening, setNeedsOpening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [answers, setAnswers] = useState<OpeningBalanceAnswers | null>(null);
  const [monthsRecorded, setMonthsRecorded] = useState(0);
  const [notice, setNotice] = useState("");
  const [tax, setTax] = useState<TaxEstimateView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { openingBalance } = await getOpeningBalanceClient();
      if (!openingBalance) {
        setNeedsOpening(true);
        setCondition(null);
        return;
      }
      setNeedsOpening(false);
      const [{ current }, report] = await Promise.all([
        getBalanceSheetClient(asOf),
        getWarungReportClient(jakartaDate().slice(0, 7)),
      ]);
      setCondition(buildBusinessCondition(current));
      setMonthsRecorded(report.series.filter((row) => row.daysRecorded > 0).length);

      // Perkiraan pajak adalah keterangan tambahan, bukan isi utama layar ini.
      // Kalau ia gagal dimuat, kondisi usaha tetap harus terbaca -- satu kartu
      // pelengkap tidak boleh mengosongkan seluruh halaman.
      try {
        setTax(await getTaxEstimateClient(asOf));
      } catch {
        setTax(null);
      }
    } catch (cause) {
      setError(cause instanceof AccountingClientError ? cause.message : "Kondisi usaha belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Layar koreksi memakai jawaban yang dulu diketik pemilik, bukan angka hasil
  // hitungan sistem, supaya ia mengenali kembali isiannya.
  const openCorrection = useCallback(async () => {
    setNotice("");
    try {
      const { answers: saved } = await getOpeningBalanceAnswersClient();
      if (!saved) return;
      setAnswers(saved);
      setView("edit");
    } catch (cause) {
      setError(cause instanceof AccountingClientError ? cause.message : "Jawaban lama belum dapat dibuka.");
    }
  }, []);

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-[#6e859e]">
        <LoaderCircle className="animate-spin" size={18} /> Menghitung kondisi usaha...
      </div>
    );
  }

  if (needsOpening) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-[#addcf4] bg-[#eef8fd] p-4">
          <Wallet size={18} className="mt-0.5 shrink-0 text-[#0b5f86]" />
          <p className="text-xs leading-relaxed text-[#1b2a3a]">
            Untuk tahu kondisi usaha, sistem perlu tahu titik mulainya: uang, stok, alat, dan utang yang sudah ada
            sebelum Anda mencatat di sini. Enam pertanyaan, sekali saja.
          </p>
        </div>
        <OpeningBalanceWizard onDone={() => void load()} />
      </div>
    );
  }

  if (error || !condition) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl border border-[#f3c6cf] bg-[#fdf1f3] p-4 text-xs font-semibold text-[#b4304a]">
        <AlertCircle size={16} /> {error || "Kondisi usaha belum dapat dimuat."}
        <button onClick={() => void load()} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-bold">
          <RefreshCcw size={13} /> Coba lagi
        </button>
      </div>
    );
  }

  if (view === "register") {
    return (
      <AssetLoanRegister
        onBack={() => setView("summary")}
        onChanged={() => void load()}
        onEditOpening={() => void openCorrection()}
      />
    );
  }

  if (view === "edit" && answers) {
    return (
      <OpeningBalanceWizard
        answers={answers}
        monthsRecorded={monthsRecorded}
        onSkip={() => setView("summary")}
        onDone={() => {
          setView("summary");
          setNotice("Kondisi awal usaha diperbarui. Untung bulan-bulan sebelumnya sudah ikut dihitung ulang.");
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <FeedbackBanner tone="success" live>
          {notice}
        </FeedbackBanner>
      )}

      <section className="rounded-2xl border border-[#addcf4] bg-[#eef8fd] p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5f86]">Milik saya bersih</p>
        <p className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[#0b5f86] tabular-nums">
          {condition.netWorthIdr < 0 ? "−" : ""}
          {formatIdr(condition.netWorthIdr)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#1b2a3a]">{condition.sentence}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ConditionList
          title="Yang saya punya"
          total={condition.ownedTotalIdr}
          items={condition.owned}
          tone="positive"
          emptyText="Belum ada yang tercatat."
        />
        <ConditionList
          title="Yang harus saya bayar"
          total={condition.owedTotalIdr}
          items={condition.owed}
          tone="negative"
          emptyText="Tidak ada utang yang tercatat."
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => void openCorrection()}
          className="min-h-10 text-xs font-bold text-[#0b5f86]"
        >
          Perbaiki kondisi awal usaha
        </button>
        <button
          type="button"
          onClick={() => setView("register")}
          className="min-h-10 text-xs font-bold text-[#0b5f86]"
        >
          Alat usaha &amp; pinjaman
        </button>
      </div>

      {tax && (
        <section
          className={`rounded-2xl border p-4 ${
            tax.isTaxable ? "border-[#f0d9a8] bg-[#fdf8ee]" : "border-[#e3e9f0] bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <Receipt size={16} className={`mt-0.5 shrink-0 ${tax.isTaxable ? "text-[#8a6412]" : "text-[#6e859e]"}`} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#1b2a3a]">Pajak tahun {tax.taxYear}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#1b2a3a]">{taxEstimateSentence(tax)}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#6e859e]">{taxEstimateDisclaimer}</p>
            </div>
          </div>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-[#6e859e]">
        Angka per {condition.asOf}, dihitung barusan. Nilai alat usaha sudah dikurangi penyusutannya, jadi yang
        terlihat adalah nilai pakainya sekarang, bukan harga belinya dulu.
      </p>
    </div>
  );
}

function ConditionList({
  title,
  total,
  items,
  tone,
  emptyText,
}: {
  title: string;
  total: number;
  items: Array<{ label: string; amountIdr: number }>;
  tone: "positive" | "negative";
  emptyText: string;
}) {
  const accent = tone === "positive" ? "text-[#0b7a55]" : "text-[#b4304a]";
  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-[#1b2a3a]">{title}</h3>
        <span className={`text-sm font-bold tabular-nums ${accent}`}>{formatIdr(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-[#6e859e]">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#eef2f6]">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-[#1b2a3a]">{item.label}</span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-[#1b2a3a]">
                {item.amountIdr < 0 ? "−" : ""}
                {formatIdr(item.amountIdr)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
