"use client";

/**
 * Pilihan kategori bahasa warung untuk layar konfirmasi.
 *
 * Tidak ada istilah akuntansi di sini. Pemilik hanya menjawab "uang ini untuk
 * apa"; akun jurnalnya ditentukan tabel template di basis data.
 */

import { MoneyInput } from "@/components/warung/MoneyInput";
import {
  expenseChoicesFor,
  fixedAssetMinimumNotice,
  normalizeSubtype,
  primaryChoicesFor,
  requiresCounterparty,
  supportsInterest,
} from "@/modules/accounting/templates";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";

export type CategorySelection = {
  emkmCategoryCode: number;
  emkmCategorySubtype: string | null;
  counterpartyName: string | null;
  interestAmountIdr: number;
  /**
   * Jenis alat dan umur ekonomisnya, hanya untuk pembelian alat usaha.
   *
   * Keduanya dulu ditebak basis data -- jenisnya dari teks keterangan, umurnya
   * dari nilai bawaan jenis itu. Umur ekonomis satu-satunya angka yang
   * menentukan beban penyusutan tiap bulan, dan kondisi awal usaha SUDAH
   * menanyakannya. Alat yang sama tidak boleh diperlakukan berbeda hanya
   * karena tanggal belinya.
   */
  assetCategory: string | null;
  assetUsefulLifeYears: number | null;
};

/** Pembelian alat usaha. Satu tempat, supaya layar dan aturannya sepakat. */
export function isAssetPurchase(categoryCode: number) {
  return categoryCode === 8;
}

const ASSET_KINDS = [
  { value: "peralatan", label: "Peralatan", years: 4 },
  { value: "mesin", label: "Mesin", years: 8 },
  { value: "kendaraan", label: "Kendaraan", years: 8 },
  { value: "bangunan", label: "Bangunan", years: 20 },
  { value: "lainnya", label: "Lainnya", years: 4 },
] as const;

export function emptySelection(direction: "income" | "expense"): CategorySelection {
  return {
    emkmCategoryCode: direction === "income" ? 1 : 6,
    emkmCategorySubtype: direction === "income" ? null : "5290",
    counterpartyName: null,
    interestAmountIdr: 0,
    assetCategory: null,
    assetUsefulLifeYears: null,
  };
}

function chipClass(active: boolean) {
  return `min-h-11 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
    active
      ? "border-umkm-brand bg-umkm-brand text-white"
      : "border-umkm-line-strong bg-white text-umkm-ink-soft hover:bg-umkm-brand-soft"
  }`;
}

export function CategoryChips({
  selection,
  onChange,
  amountIdr = null,
  sector = pilotSector,
  hasRegisteredLoan = false,
  idPrefix = "kategori",
}: {
  selection: CategorySelection;
  onChange: (next: CategorySelection) => void;
  /** Menentukan kata-katanya saja; akun jurnalnya sama untuk semua sektor. */
  sector?: AccountingSector;
  /** Nominal baris ini, dipakai untuk menjelaskan belanja alat yang terlalu kecil. */
  amountIdr?: number | null;
  /** Kolom bunga hanya muncul bila pemilik sudah punya pinjaman terdaftar. */
  hasRegisteredLoan?: boolean;
  idPrefix?: string;
}) {
  const minimumNotice = fixedAssetMinimumNotice(selection.emkmCategoryCode, amountIdr);
  const primaryChoices = primaryChoicesFor(sector);
  const expenseChoices = expenseChoicesFor(sector);
  const choose = (categoryCode: number, subtype: string | null) => {
    onChange({
      ...selection,
      emkmCategoryCode: categoryCode,
      emkmCategorySubtype: normalizeSubtype(categoryCode, subtype),
      counterpartyName: requiresCounterparty(categoryCode) ? selection.counterpartyName : null,
      interestAmountIdr: supportsInterest(categoryCode) ? selection.interestAmountIdr : 0,
      // Jawaban alat dibuang begitu kategorinya bukan pembelian alat lagi.
      // Bidang yang tertinggal dari pilihan sebelumnya tidak akan lolos skema --
      // dan pemiliknya tidak akan pernah tahu kenapa.
      assetCategory: isAssetPurchase(categoryCode) ? (selection.assetCategory ?? "peralatan") : null,
      assetUsefulLifeYears: isAssetPurchase(categoryCode)
        ? (selection.assetUsefulLifeYears
            ?? ASSET_KINDS.find((kind) => kind.value === (selection.assetCategory ?? "peralatan"))?.years
            ?? 4)
        : null,
    });
  };

  const isActive = (categoryCode: number, subtype: string | null) => {
    if (selection.emkmCategoryCode !== categoryCode) return false;
    if (categoryCode !== 4) return true;
    return selection.emkmCategorySubtype === subtype;
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-xs font-bold text-umkm-muted">Uang ini untuk apa?</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {primaryChoices.map((choice) => (
            <button
              key={`${idPrefix}-${choice.categoryCode}-${choice.subtype ?? "x"}`}
              type="button"
              aria-pressed={isActive(choice.categoryCode, choice.subtype)}
              onClick={() => choose(choice.categoryCode, choice.subtype)}
              className={chipClass(isActive(choice.categoryCode, choice.subtype))}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      {selection.emkmCategoryCode === 6 && (
        <fieldset>
          <legend className="text-xs font-bold text-umkm-muted">Biaya apa?</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {expenseChoices
              .filter((choice) => choice.subtype !== "5280")
              .map((choice) => (
                <button
                  key={`${idPrefix}-sub-${choice.subtype}`}
                  type="button"
                  aria-pressed={selection.emkmCategorySubtype === choice.subtype}
                  onClick={() => choose(6, choice.subtype)}
                  className={chipClass(selection.emkmCategorySubtype === choice.subtype)}
                >
                  {choice.label}
                </button>
              ))}
          </div>
        </fieldset>
      )}

      {minimumNotice && (
        <p
          role="status"
          className="rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-3 py-2.5 text-xs leading-relaxed text-umkm-ink"
        >
          {minimumNotice}
        </p>
      )}

      {requiresCounterparty(selection.emkmCategoryCode) && (
        <label className="block text-xs font-bold text-umkm-muted">
          Siapa pelanggannya?
          <input
            value={selection.counterpartyName ?? ""}
            onChange={(event) =>
              onChange({ ...selection, counterpartyName: event.target.value || null })
            }
            placeholder="Contoh: Bu Ani"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line-strong px-3 text-sm font-medium outline-none focus:border-umkm-brand"
          />
        </label>
      )}

      {supportsInterest(selection.emkmCategoryCode) && hasRegisteredLoan && (
        <MoneyInput
          label="Berapa bunganya?"
          value={selection.interestAmountIdr || null}
          onChange={(value) => onChange({ ...selection, interestAmountIdr: value ?? 0 })}
          helper="Bagian bunga dipisah dari pokok cicilan. Kosongkan kalau tidak ada bunga."
        />
      )}

      {/*
        Pertanyaan yang sama dengan kondisi awal usaha, dan memang harus sama:
        alat yang dibeli hari ini disusutkan dengan aturan yang sama dengan
        alat yang sudah dimiliki sejak awal. Umurnya ditanya dalam TAHUN --
        bulan adalah satuan pembukuan, bukan satuan orang.
      */}
      {isAssetPurchase(selection.emkmCategoryCode) && !minimumNotice && (
        <div className="grid gap-3 rounded-xl border border-umkm-line-strong bg-umkm-brand-soft p-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-umkm-muted">
            Alat jenis apa?
            <select
              value={selection.assetCategory ?? "peralatan"}
              onChange={(event) => {
                const kind = ASSET_KINDS.find((item) => item.value === event.target.value);
                onChange({
                  ...selection,
                  assetCategory: event.target.value,
                  // Umurnya ikut berubah mengikuti jenisnya, karena angka
                  // bawaan yang tertinggal dari jenis lain lebih menyesatkan
                  // daripada kolom kosong.
                  assetUsefulLifeYears: kind?.years ?? 4,
                });
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm font-medium outline-none focus:border-umkm-brand"
            >
              {ASSET_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-umkm-muted">
            Masih bisa dipakai berapa lama?
            <span className="mt-1.5 flex items-center gap-2">
              <input
                inputMode="numeric"
                value={selection.assetUsefulLifeYears ?? ""}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
                  onChange({ ...selection, assetUsefulLifeYears: digits ? Number(digits) : null });
                }}
                className="min-h-11 w-20 rounded-xl border border-umkm-line-strong bg-white px-3 text-sm font-medium outline-none focus:border-umkm-brand"
                aria-label="Umur ekonomis alat dalam tahun"
              />
              <span className="text-xs font-bold text-umkm-subtle">tahun</span>
            </span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-umkm-subtle">
              Perkiraan saja. Angka inilah yang menentukan berapa nilai alat ini turun tiap bulan.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
