"use client";

/**
 * Daftar alat usaha dan pinjaman.
 *
 * Ia hidup di dalam tab Kondisi Usaha, bukan sebagai tab kelima, karena isinya
 * adalah rincian di balik dua baris yang barusan dibaca pemilik: "Alat usaha"
 * dan "Sisa pinjaman".
 *
 * Yang bisa diubah di sini hanya keterangan. Harga alat ikut sumbernya, dan
 * sisa pinjaman ikut cicilan yang dicatat -- keduanya tidak pernah diketik di
 * layar ini, supaya angka di laporan tidak bisa berbeda dari catatannya.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Landmark, LoaderCircle, PackageOpen, Wrench } from "lucide-react";
import { EmptyState, FeedbackBanner, MetricCard, StatusBadge } from "@/components/dashboard";
import {
  AccountingClientError,
  disposeFixedAssetClient,
  getFixedAssetsClient,
  getLoansClient,
  updateFixedAssetClient,
  updateLoanClient,
} from "@/modules/accounting/accounting-client";
import type { FixedAssetView, LoanView } from "@/modules/accounting/period";
import {
  assetCategories,
  assetCategoryLabels,
  lenderTypeLabels,
  type AssetCategory,
  type LenderType,
} from "@/modules/accounting/period-schema";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { formatIdr } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-[#d5dfe9] bg-white px-3 text-sm font-medium text-[#1b2a3a] outline-none focus:border-[#0b5f86]";
const labelClass = "block text-[11px] font-bold text-[#1b2a3a]";

/** Bulan terakhir alat ini masih punya nilai, dalam bahasa sehari-hari. */
export function depreciationEndsOn(asset: FixedAssetView): string {
  const remaining =
    asset.monthlyDepreciationIdr > 0 ? Math.ceil(asset.bookValueIdr / asset.monthlyDepreciationIdr) : 0;
  const start = new Date(`${jakartaDate()}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + remaining, 1));
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${names[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

export function AssetLoanRegister({
  onBack,
  onChanged,
  onEditOpening,
}: {
  onBack: () => void;
  onChanged: () => void;
  onEditOpening: () => void;
}) {
  const [assets, setAssets] = useState<FixedAssetView[]>([]);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetResult, loanResult] = await Promise.all([getFixedAssetsClient(), getLoansClient()]);
      setAssets(assetResult.fixedAssets);
      setLoans(loanResult.loans);
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof AccountingClientError ? cause.message : "Daftar belum dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const active = assets.filter((asset) => !asset.disposedOn);
  const toolValue = active.reduce((sum, asset) => sum + asset.bookValueIdr, 0);
  const debtValue = loans.reduce((sum, loan) => sum + loan.outstandingIdr, 0);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-[#0b5f86]"
      >
        <ArrowLeft size={14} /> Kembali ke kondisi usaha
      </button>

      {message && (
        <FeedbackBanner tone={message.tone === "error" ? "error" : "success"} live>
          {message.text}
        </FeedbackBanner>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Nilai alat usaha sekarang"
          value={formatIdr(toolValue)}
          helper={`${active.length} alat masih dipakai`}
          icon={Wrench}
        />
        <MetricCard
          label="Sisa semua pinjaman"
          value={formatIdr(debtValue)}
          helper={`${loans.length} pinjaman tercatat`}
          icon={Landmark}
          tone="attention"
        />
      </div>

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-[#6e859e]">
          <LoaderCircle className="animate-spin" size={18} /> Memuat daftar...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
            <h3 className="text-sm font-bold text-[#1b2a3a]">Alat usaha</h3>
            {assets.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={PackageOpen}
                  title="Belum ada alat usaha tercatat"
                  description="Alat yang sudah Anda punya sejak awal diisi di kondisi awal usaha. Alat yang dibeli setelahnya cukup dicatat sebagai belanja, nanti otomatis masuk daftar ini."
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[#eef2f6]">
                {assets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    onEditOpening={onEditOpening}
                    onSaved={(text) => {
                      setMessage({ tone: "success", text });
                      void refresh();
                    }}
                    onFailed={(text) => setMessage({ tone: "error", text })}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
            <h3 className="text-sm font-bold text-[#1b2a3a]">Pinjaman</h3>
            {loans.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Landmark}
                  title="Tidak ada pinjaman tercatat"
                  description="Pinjaman yang sudah ada sejak awal diisi di kondisi awal usaha. Pinjaman yang cair setelahnya dicatat sebagai uang masuk, supaya uangnya kelihatan."
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[#eef2f6]">
                {loans.map((loan) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan}
                    onSaved={(text) => {
                      setMessage({ tone: "success", text });
                      void refresh();
                    }}
                    onFailed={(text) => setMessage({ tone: "error", text })}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AssetRow({
  asset,
  onEditOpening,
  onSaved,
  onFailed,
}: {
  asset: FixedAssetView;
  onEditOpening: () => void;
  onSaved: (text: string) => void;
  onFailed: (text: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "dispose">("view");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState<AssetCategory>(asset.category as AssetCategory);
  const [life, setLife] = useState(String(asset.usefulLifeMonths));
  const [disposedOn, setDisposedOn] = useState(jakartaDate());
  const [proceeds, setProceeds] = useState<number | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await updateFixedAssetClient(asset.id, {
        name: name.trim(),
        category,
        usefulLifeMonths: Number(life) || asset.usefulLifeMonths,
      });
      onSaved(`${name.trim()} diperbarui.`);
      setMode("view");
    } catch (cause) {
      onFailed(cause instanceof AccountingClientError ? cause.message : "Perubahan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  const dispose = async () => {
    setBusy(true);
    try {
      const result = await disposeFixedAssetClient(asset.id, {
        disposedOn,
        proceedsIdr: proceeds ?? 0,
      });
      onSaved(
        result.resultIdr === 0
          ? `${asset.name} sudah tidak dihitung lagi sebagai milik usaha.`
          : result.resultIdr > 0
            ? `${asset.name} laku ${formatIdr(result.proceedsIdr)}, lebih tinggi ${formatIdr(result.resultIdr)} dari sisa nilainya. Selisihnya masuk sebagai pemasukan lain.`
            : `${asset.name} laku ${formatIdr(result.proceedsIdr)}, kurang ${formatIdr(-result.resultIdr)} dari sisa nilainya. Selisihnya jadi biaya bulan ini.`,
      );
      setMode("view");
    } catch (cause) {
      onFailed(cause instanceof AccountingClientError ? cause.message : "Belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#1b2a3a]">
            {asset.name}
            {asset.disposedOn ? (
              <StatusBadge tone="neutral">Sudah tidak dipakai</StatusBadge>
            ) : asset.fromOpeningBalance ? (
              <StatusBadge tone="info">Dari kondisi awal</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Dari catatan belanja</StatusBadge>
            )}
          </p>
          <p className="mt-1 text-[11px] text-[#6e859e]">
            Dibeli {asset.acquiredOn} · harga dulu {formatIdr(asset.originalCostIdr)}
          </p>
          {!asset.disposedOn && (
            <p className="mt-0.5 text-[11px] text-[#6e859e]">
              Nilainya sekarang {formatIdr(asset.bookValueIdr)}, turun {formatIdr(asset.monthlyDepreciationIdr)} tiap
              bulan sampai {depreciationEndsOn(asset)}.
            </p>
          )}
        </div>
        {!asset.disposedOn && mode === "view" && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="min-h-10 rounded-lg px-2 text-[11px] font-bold text-[#0b5f86]"
            >
              Ubah
            </button>
            <button
              type="button"
              onClick={() => setMode("dispose")}
              className="min-h-10 rounded-lg px-2 text-[11px] font-bold text-[#6e859e]"
            >
              Sudah tidak dipakai
            </button>
          </div>
        )}
      </div>

      {mode === "edit" && (
        <div className="mt-3 space-y-3 rounded-xl border border-[#e3e9f0] p-3">
          {asset.fromOpeningBalance && (
            <FeedbackBanner tone="info">
              Harga alat ini bagian dari kondisi awal usaha, jadi diubahnya dari sana supaya angkanya ikut betul
              semua.{" "}
              <button type="button" onClick={onEditOpening} className="font-bold underline">
                Buka kondisi awal usaha
              </button>
            </FeedbackBanner>
          )}
          <label className={labelClass}>
            Nama alat
            <input value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} mt-1.5`} />
          </label>
          <label className={labelClass}>
            Kelompok
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as AssetCategory)}
              className={`${fieldClass} mt-1.5`}
            >
              {assetCategories.map((item) => (
                <option key={item} value={item}>
                  {assetCategoryLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Dipakai berapa bulan lagi
            <input
              inputMode="numeric"
              value={life}
              onChange={(event) => setLife(event.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-[#6e859e]">
              Kalau diubah, nilai yang turun tiap bulan ikut dihitung ulang, termasuk untuk bulan-bulan yang sudah
              lewat.
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="min-h-11 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      )}

      {mode === "dispose" && (
        <div className="mt-3 space-y-3 rounded-xl border border-[#e3e9f0] p-3">
          <p className="text-[11px] leading-relaxed text-[#6e859e]">
            Setelah ini {asset.name} tidak dihitung lagi sebagai milik usaha, dan nilainya berhenti turun tiap bulan.
          </p>
          <label className={labelClass}>
            Kapan berhentinya dipakai
            <input
              type="date"
              max={jakartaDate()}
              min={asset.acquiredOn}
              value={disposedOn}
              onChange={(event) => setDisposedOn(event.target.value)}
              className={`${fieldClass} mt-1.5`}
            />
          </label>
          <label className={labelClass}>
            Kalau dijual, laku berapa
            <div className="mt-1.5">
              <InlineMoneyInput ariaLabel="Hasil penjualan alat" value={proceeds} onChange={setProceeds} />
            </div>
            <span className="mt-1 block text-[11px] text-[#6e859e]">
              Kosongkan kalau dibuang atau rusak.
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="min-h-11 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dispose()}
              className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Ya, sudah tidak dipakai"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function LoanRow({
  loan,
  onSaved,
  onFailed,
}: {
  loan: LoanView;
  onSaved: (text: string) => void;
  onFailed: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(loan.lenderName);
  const [installment, setInstallment] = useState<number | null>(loan.monthlyInstallmentIdr);

  const save = async () => {
    setBusy(true);
    try {
      await updateLoanClient(loan.id, {
        lenderName: name.trim(),
        monthlyInstallmentIdr: installment,
      });
      onSaved(`Pinjaman ${name.trim()} diperbarui.`);
      setEditing(false);
    } catch (cause) {
      onFailed(cause instanceof AccountingClientError ? cause.message : "Perubahan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#1b2a3a]">
            {loan.lenderName}
            <StatusBadge tone={loan.fromOpeningBalance ? "info" : "neutral"}>
              {loan.fromOpeningBalance ? "Dari kondisi awal" : "Dari catatan uang masuk"}
            </StatusBadge>
          </p>
          <p className="mt-1 text-[11px] text-[#6e859e]">
            {lenderTypeLabels[loan.lenderType as LenderType] ?? loan.lenderType} · sisa{" "}
            {formatIdr(loan.outstandingIdr)}
            {loan.paidIdr > 0 ? ` · sudah dibayar ${formatIdr(loan.paidIdr)}` : ""}
          </p>
          {loan.monthlyInstallmentIdr && (
            <p className="mt-0.5 text-[11px] text-[#6e859e]">
              Cicilan {formatIdr(loan.monthlyInstallmentIdr)} tiap bulan
            </p>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-10 shrink-0 rounded-lg px-2 text-[11px] font-bold text-[#0b5f86]"
          >
            Ubah
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-[#e3e9f0] p-3">
          <label className={labelClass}>
            Nama pemberi pinjaman
            <input value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} mt-1.5`} />
          </label>
          <label className={labelClass}>
            Cicilan per bulan
            <div className="mt-1.5">
              <InlineMoneyInput ariaLabel="Cicilan per bulan" value={installment} onChange={setInstallment} />
            </div>
          </label>
          <p className="text-[11px] leading-relaxed text-[#6e859e]">
            Sisa pinjaman tidak diisi di sini — ia berkurang sendiri setiap Anda mencatat pembayaran cicilan.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
