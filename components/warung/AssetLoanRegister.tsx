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
 *
 * SATU PENGECUALIAN: alat yang SUDAH dimiliki tetapi tidak masuk kondisi awal
 * (etalase dari rumah, motor yang mulai dipakai mengantar) bisa ditambah kapan
 * saja. Basis data mencatatnya sebagai setoran pemilik berupa barang (0111),
 * lengkap dengan jurnalnya -- bukan baris yang berdiri tanpa pembukuan.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Landmark, LoaderCircle, PackageOpen, Plus, Wrench } from "lucide-react";
import { EmptyState, FeedbackBanner, MetricCard, StatusBadge } from "@/components/dashboard";
import {
  AccountingClientError,
  contributeFixedAssetClient,
  disposeFixedAssetClient,
  getFixedAssetsClient,
  getLoansClient,
} from "@/modules/accounting/accounting-client";
import type { FixedAssetView, LoanView } from "@/modules/accounting/period";
import {
  assetCategories,
  assetCategoryLabels,
  defaultUsefulLifeMonths,
  lenderTypeLabels,
  type AssetCategory,
  type LenderType,
} from "@/modules/accounting/period-schema";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { notifyFailure, notifySuccess } from "@/lib/notify";
import { formatIdr } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm font-medium text-umkm-ink outline-none focus:border-umkm-brand";
const labelClass = "block text-xs font-bold text-umkm-ink";

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
  startAdding = false,
}: {
  onBack: () => void;
  onChanged: () => void;
  /** Dibuka dari tombol « Tambah alat usaha »: formulirnya langsung terbuka. */
  startAdding?: boolean;
}) {
  const [adding, setAdding] = useState(startAdding);
  const [assets, setAssets] = useState<FixedAssetView[]>([]);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Hanya kegagalan MEMUAT yang masih memakai panel di tempatnya.
   *
   * Bedanya bukan selera: kegagalan memuat adalah keadaan yang bertahan --
   * daftarnya memang kosong selama itu belum beres, dan toast yang menghilang
   * setelah beberapa detik akan meninggalkan layar kosong tanpa penjelasan.
   * Hasil sebuah tindakan justru sebaliknya: layarnya sudah berubah, dan yang
   * dibutuhkan hanya kabar sekilas.
   */
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetResult, loanResult] = await Promise.all([getFixedAssetsClient(), getLoansClient()]);
      setAssets(assetResult.fixedAssets);
      setLoans(loanResult.loans);
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof AccountingClientError ? cause.message : "Daftar belum dapat dimuat.");
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
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-umkm-brand"
      >
        <ArrowLeft size={14} /> Kembali ke kondisi usaha
      </button>

      {loadError && (
        <FeedbackBanner tone="error" live>
          {loadError}
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
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-umkm-subtle">
          <LoaderCircle className="animate-spin" size={18} /> Memuat daftar...
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-umkm-line bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-umkm-ink">Alat usaha</h3>
              {!adding && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-3 text-xs font-bold text-umkm-brand"
                >
                  <Plus size={14} aria-hidden /> Tambah alat usaha
                </button>
              )}
            </div>
            {adding && (
              <AddAssetForm
                onCancel={() => setAdding(false)}
                onSaved={(name, valueIdr) => {
                  setAdding(false);
                  notifySuccess(`${name} masuk daftar alat usaha`, {
                    description: `Dicatat sebagai modal yang Anda setor berupa barang, senilai ${formatIdr(valueIdr)}. Nilainya turun sedikit tiap bulan mulai bulan depan.`,
                    duration: 7000,
                  });
                  void refresh();
                }}
              />
            )}
            {assets.length === 0 && !adding ? (
              <div className="mt-4">
                <EmptyState
                  icon={PackageOpen}
                  title="Belum ada alat usaha tercatat"
                  description="Alat yang baru dibeli cukup dicatat sebagai belanja, nanti otomatis masuk daftar ini. Alat yang sudah Anda punya tapi belum tercatat bisa ditambah lewat « Tambah alat usaha »."
                />
              </div>
            ) : assets.length === 0 ? null : (
              <ul className="mt-3 divide-y divide-umkm-line-soft">
                {assets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    onSaved={(title, detail) => {
                      notifySuccess(title, { description: detail, duration: 7000 });
                      void refresh();
                    }}
                    onFailed={(text) => notifyFailure(text)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-umkm-line bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
            <h3 className="text-sm font-bold text-umkm-ink">Pinjaman</h3>
            {loans.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Landmark}
                  title="Tidak ada pinjaman tercatat"
                  description="Pinjaman yang sudah ada sejak awal diisi di kondisi awal usaha. Pinjaman yang cair setelahnya dicatat sebagai uang masuk, supaya uangnya kelihatan."
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-umkm-line-soft">
                {loans.map((loan) => (
                  <LoanRow key={loan.id} loan={loan} />
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
  onSaved,
  onFailed,
}: {
  asset: FixedAssetView;
  onSaved: (title: string, detail?: string) => void;
  onFailed: (text: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "dispose">("view");
  const [busy, setBusy] = useState(false);
  const [disposedOn, setDisposedOn] = useState(jakartaDate());
  const [proceeds, setProceeds] = useState<number | null>(null);

  const dispose = async () => {
    setBusy(true);
    try {
      const result = await disposeFixedAssetClient(asset.id, {
        disposedOn,
        proceedsIdr: proceeds ?? 0,
      });
      onSaved(
        `${asset.name} sudah tidak dipakai lagi`,
        result.resultIdr === 0
          ? "Nilainya berhenti turun sejak tanggal itu."
          : result.resultIdr > 0
            ? `Laku ${formatIdr(result.proceedsIdr)}, lebih tinggi ${formatIdr(result.resultIdr)} dari sisa nilainya. Selisihnya masuk sebagai pemasukan lain.`
            : `Laku ${formatIdr(result.proceedsIdr)}, kurang ${formatIdr(-result.resultIdr)} dari sisa nilainya. Selisihnya jadi biaya bulan ini.`,
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
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-umkm-ink">
            {asset.name}
            {asset.disposedOn ? (
              <StatusBadge tone="neutral">Sudah tidak dipakai</StatusBadge>
            ) : asset.fromOpeningBalance ? (
              <StatusBadge tone="info">Dari kondisi awal</StatusBadge>
            ) : asset.ownerContributed ? (
              <StatusBadge tone="info">Milik sendiri</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Dari catatan belanja</StatusBadge>
            )}
          </p>
          <p className="mt-1 text-xs text-umkm-subtle">
            {asset.ownerContributed
              ? `Mulai dipakai usaha ${asset.acquiredOn} · dinilai ${formatIdr(asset.originalCostIdr)}`
              : `Dibeli ${asset.acquiredOn} · harga dulu ${formatIdr(asset.originalCostIdr)}`}
          </p>
          {!asset.disposedOn && (
            <p className="mt-0.5 text-xs text-umkm-subtle">
              Nilainya sekarang {formatIdr(asset.bookValueIdr)}, turun {formatIdr(asset.monthlyDepreciationIdr)} tiap
              bulan sampai {depreciationEndsOn(asset)}.
            </p>
          )}
        </div>
        {!asset.disposedOn && mode === "view" && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setMode("dispose")}
              className="min-h-11 rounded-lg px-2 text-xs font-bold text-umkm-subtle"
            >
              Sudah tidak dipakai
            </button>
          </div>
        )}
      </div>

      {mode === "dispose" && (
        <div className="mt-3 space-y-3 rounded-xl border border-umkm-line p-3">
          <p className="text-xs leading-relaxed text-umkm-subtle">
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
            <span className="mt-1 block text-xs text-umkm-subtle">
              Kosongkan kalau dibuang atau rusak.
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="min-h-11 rounded-xl border border-umkm-line-strong px-4 text-xs font-bold text-umkm-ink"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void dispose()}
              className="min-h-11 flex-1 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Ya, sudah tidak dipakai"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Alat yang sudah dimiliki, ditambahkan kapan saja.
 *
 * Yang ditanyakan adalah nilai PAKAI sekarang dan sisa umurnya, bukan harga
 * beli dulu: alat yang sudah dipakai bertahun-tahun tidak boleh masuk buku
 * seharga barunya. Tanggalnya bawaan hari ini; boleh dimundurkan sampai hari
 * pertama mencatat (basis data yang menolak bila lebih awal).
 */
function AddAssetForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (name: string, valueIdr: number) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("peralatan");
  const [years, setYears] = useState(String(defaultUsefulLifeMonths.peralatan / 12));
  const [value, setValue] = useState<number | null>(null);
  const [since, setSince] = useState(jakartaDate());
  const [busy, setBusy] = useState(false);
  const yearsNumber = Number(years);
  const ready = name.trim().length > 0 && (value ?? 0) > 0 && yearsNumber >= 1 && yearsNumber <= 50;

  const save = async () => {
    if (!ready || value === null) return;
    setBusy(true);
    try {
      await contributeFixedAssetClient({
        name: name.trim(),
        costIdr: value,
        acquiredOn: since,
        category,
        usefulLifeMonths: yearsNumber * 12,
      });
      onSaved(name.trim(), value);
    } catch (cause) {
      notifyFailure(cause instanceof AccountingClientError ? cause.message : "Alat usaha belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-xs leading-relaxed text-umkm-subtle">
        Untuk alat yang sudah Anda punya tapi belum tercatat. Alat yang baru dibeli cukup dicatat sebagai belanja.
      </p>
      <label className={labelClass}>
        Nama alat
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Contoh: etalase kaca, motor antar"
          className={`${fieldClass} mt-1.5`}
        />
      </label>
      <label className={labelClass}>
        Jenis
        <select
          value={category}
          onChange={(event) => {
            const next = event.target.value as AssetCategory;
            // Umur bawaan ikut jenisnya selama pemilik belum menggantinya.
            if (years === String(defaultUsefulLifeMonths[category] / 12)) setYears(String(defaultUsefulLifeMonths[next] / 12));
            setCategory(next);
          }}
          className={`${fieldClass} mt-1.5`}
        >
          {assetCategories.map((item) => (
            <option key={item} value={item}>{assetCategoryLabels[item]}</option>
          ))}
        </select>
      </label>
      <div className={labelClass}>
        Kira-kira nilainya sekarang
        <div className="mt-1.5">
          <InlineMoneyInput ariaLabel="Nilai alat sekarang" value={value} onChange={setValue} />
        </div>
        <span className="mt-1 block text-xs font-normal text-umkm-subtle">
          Kalau dijual hari ini laku berapa — bukan harga belinya dulu.
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Masih bisa dipakai berapa lama
          <div className="mt-1.5 flex items-center gap-2">
            <input
              inputMode="numeric"
              value={years}
              onChange={(event) => setYears(event.target.value.replace(/\D/g, "").slice(0, 2))}
              aria-label="Sisa umur pakai dalam tahun"
              className={`${fieldClass} w-20`}
            />
            <span className="text-xs font-bold text-umkm-subtle">tahun</span>
          </div>
        </label>
        <label className={labelClass}>
          Mulai dipakai untuk usaha
          <input
            type="date"
            max={jakartaDate()}
            value={since}
            onChange={(event) => setSince(event.target.value)}
            className={`${fieldClass} mt-1.5`}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-umkm-line-strong bg-white px-4 text-xs font-bold text-umkm-ink"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={!ready || busy}
          className="min-h-11 flex-1 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Simpan alat usaha"}
        </button>
      </div>
    </form>
  );
}

/**
 * Pinjaman hanya dibaca, tidak pernah disunting di sini.
 *
 * Sisa pinjaman adalah hasil pembayaran, bukan angka yang diketik. Mengubahnya
 * langsung akan membuat sisa utang dan riwayat cicilan bercerita hal yang
 * berbeda. Perubahannya masuk lewat catat transaksi, seperti pembayaran mana
 * pun.
 */
function LoanRow({ loan }: { loan: LoanView }) {

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-umkm-ink">
            {loan.lenderName}
            <StatusBadge tone={loan.fromOpeningBalance ? "info" : "neutral"}>
              {loan.fromOpeningBalance ? "Dari kondisi awal" : "Dari catatan uang masuk"}
            </StatusBadge>
          </p>
          <p className="mt-1 text-xs text-umkm-subtle">
            {lenderTypeLabels[loan.lenderType as LenderType] ?? loan.lenderType} · sisa{" "}
            {formatIdr(loan.outstandingIdr)}
            {loan.paidIdr > 0 ? ` · sudah dibayar ${formatIdr(loan.paidIdr)}` : ""}
          </p>
          {loan.monthlyInstallmentIdr && (
            <p className="mt-0.5 text-xs text-umkm-subtle">
              Cicilan {formatIdr(loan.monthlyInstallmentIdr)} tiap bulan
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
