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
import { AlertCircle, LoaderCircle, Plus, Receipt, RefreshCcw, Wallet } from "lucide-react";
import {
  AccountingClientError,
  getBalanceSheetClient,
  getOpeningBalanceClient,
  getTaxEstimateClient,
} from "@/modules/accounting/accounting-client";
import type { TaxEstimateView } from "@/modules/accounting/period";
import { AssetLoanRegister } from "@/components/warung/AssetLoanRegister";
import { buildBusinessCondition, type BusinessConditionView } from "@/modules/accounting/balance-sheet";
import { formatIdr, taxEstimateDisclaimer, taxEstimateSentence } from "@/modules/accounting/warung";
import { OpeningBalanceWizard } from "@/components/warung/OpeningBalanceWizard";
import { jakartaDate } from "@/modules/ledger/capture-schema";

/**
 * Kondisi awal diisi SEKALI, dan tidak punya layar koreksi.
 *
 * Ia titik mulai usaha, bukan angka yang dipelihara. Salah ketik uang tunai di
 * laci tidak diperbaiki dengan menulis ulang sejarah -- ia diperbaiki dengan
 * mencatat transaksi pemasukan atau pengeluaran, persis seperti selisih kas
 * mana pun yang ditemukan kemudian. Cara itu meninggalkan jejak: kapan
 * selisihnya ketahuan dan berapa besarnya, bukan seolah-olah angka awalnya
 * memang selalu begitu.
 *
 * Yang tersisa hanyalah daftar alat usaha dan pinjaman, dan itu pun hanya
 * untuk dibaca serta menandai alat yang sudah dijual.
 */
type View = "summary" | "register" | "add-asset";

export function ConditionTab({
  asOf = jakartaDate(),
  onSkip,
  onOpeningSaved,
}: {
  asOf?: string;
  /** Langkah pertama pemilik baru: « Lewati, isi nanti » di samping formulirnya. */
  onSkip?: () => void;
  /** Dipanggil setelah kondisi awal tersimpan; tanpa ini layarnya memuat ringkasan. */
  onOpeningSaved?: () => void;
}) {
  const [condition, setCondition] = useState<BusinessConditionView | null>(null);
  const [needsOpening, setNeedsOpening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
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
      const { current } = await getBalanceSheetClient(asOf);
      setCondition(buildBusinessCondition(current));

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


  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-umkm-subtle">
        <LoaderCircle className="animate-spin" size={18} /> Menghitung kondisi usaha...
      </div>
    );
  }

  if (needsOpening) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-4">
          <Wallet size={18} className="mt-0.5 shrink-0 text-umkm-brand" />
          <p className="text-xs leading-relaxed text-umkm-ink">
            Untuk tahu kondisi usaha, sistem perlu tahu titik mulainya: uang, stok, alat, dan utang yang sudah ada
            sebelum Anda mencatat di sini. Enam pertanyaan, sekali saja.
          </p>
        </div>
        {onSkip && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-umkm-line bg-white p-4">
            <p className="text-xs leading-relaxed text-umkm-subtle">
              Belum sempat menghitung? Anda tetap bisa mencatat transaksi. Kondisi awal bisa diisi kapan saja dari
              Profil, dan Beranda akan mengingatkannya.
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-ink-soft hover:bg-umkm-surface"
            >
              Lewati, isi nanti
            </button>
          </div>
        )}
        <OpeningBalanceWizard onDone={() => (onOpeningSaved ? onOpeningSaved() : void load())} />
      </div>
    );
  }

  if (error || !condition) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl border border-umkm-danger-line bg-umkm-danger-soft p-4 text-xs font-semibold text-umkm-danger">
        <AlertCircle size={16} /> {error || "Kondisi usaha belum dapat dimuat."}
        <button onClick={() => void load()} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold">
          <RefreshCcw size={13} /> Coba lagi
        </button>
      </div>
    );
  }

  if (view === "register" || view === "add-asset") {
    return (
      <AssetLoanRegister
        startAdding={view === "add-asset"}
        onBack={() => setView("summary")}
        onChanged={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4">

      <section className="rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-umkm-brand">Milik saya bersih</p>
        <p className="mt-2 text-2xl font-bold tracking-[-0.035em] text-umkm-brand tabular-nums">
          {condition.netWorthIdr < 0 ? "−" : ""}
          {formatIdr(condition.netWorthIdr)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-umkm-ink">{condition.sentence}</p>
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

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("add-asset")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-umkm-brand px-3 text-xs font-bold text-white"
          >
            <Plus size={14} aria-hidden /> Tambah alat usaha
          </button>
          <button
            type="button"
            onClick={() => setView("register")}
            className="inline-flex min-h-11 items-center rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-brand"
          >
            Alat usaha &amp; pinjaman
          </button>
        </div>
        <p className="rounded-xl border border-umkm-line bg-umkm-surface p-3 text-xs leading-relaxed text-umkm-subtle">
          Alat yang sudah Anda punya tapi terlewat bisa ditambah kapan saja lewat{" "}
          <strong className="font-bold text-umkm-muted">Tambah alat usaha</strong>. Angka lain di kondisi awal
          hanya diisi sekali, karena ia titik mulai usaha Anda. Bila
          ada selisih &mdash; misalnya uang tunai di laci ternyata berbeda dari
          yang diketik &mdash; perbaiki lewat <strong className="font-bold text-umkm-muted">catat transaksi</strong>{" "}
          pemasukan atau pengeluaran. Cara itu menyimpan jejak kapan selisihnya
          ketahuan dan berapa besarnya.
        </p>
      </div>

      {tax && (
        <section
          className={`rounded-2xl border p-4 ${
            tax.isTaxable ? "border-umkm-warning-line bg-umkm-warning-soft" : "border-umkm-line bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <Receipt size={16} className={`mt-0.5 shrink-0 ${tax.isTaxable ? "text-umkm-warning" : "text-umkm-subtle"}`} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-umkm-ink">Pajak tahun {tax.taxYear}</p>
              <p className="mt-1 text-xs leading-relaxed text-umkm-ink">{taxEstimateSentence(tax)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-umkm-subtle">{taxEstimateDisclaimer}</p>
            </div>
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-umkm-subtle">
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
  const accent = tone === "positive" ? "text-umkm-success" : "text-umkm-danger";
  return (
    <section className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-umkm-ink">{title}</h3>
        <span className={`text-sm font-bold tabular-nums ${accent}`}>{formatIdr(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-umkm-subtle">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-umkm-line-soft">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-umkm-ink">{item.label}</span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-umkm-ink">
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
