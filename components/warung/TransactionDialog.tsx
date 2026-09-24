"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { FormDialog } from "@/components/ui/dialog";
import { CategoryChips, emptySelection, type CategorySelection } from "@/components/warung/CategoryChips";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { ContactNameInput } from "@/components/warung/ContactNameInput";
import type { AccountingPaymentMethod, AccountingSector } from "@/modules/accounting/coa";
import { normalizeCategory } from "@/modules/accounting/templates";
import {
  jakartaDate,
  legacyCategoryForEmkm,
  paymentMethodLabels,
  type LedgerTransactionInput,
} from "@/modules/ledger/ledger-schema";
import type { LedgerTransactionView } from "@/modules/ledger/ledger-repository";

export type TransactionFormState = {
  amount: string;
  date: string;
  category: CategorySelection;
  description: string;
  paymentMethod: string;
  counterparty: string;
  reason: string;
};

export function emptyTransactionForm(): TransactionFormState {
  return { amount: "", date: jakartaDate(), category: emptySelection("income"), description: "", paymentMethod: "cash", counterparty: "", reason: "" };
}

/**
 * Formulir untuk transaksi yang sudah ada.
 *
 * Catatan lama (sebelum kategori bahasa warung) belum punya kode 1..10; arah
 * uangnya dipakai untuk menebak titik mulai yang paling dekat, dan pemilik
 * tetap bisa menggantinya.
 */
export function transactionFormFrom(transaction: LedgerTransactionView): TransactionFormState {
  const fallback = emptySelection(transaction.transactionType);
  return {
    amount: String(transaction.amountIdr),
    date: transaction.transactionDate,
    category: transaction.emkmCategoryCode
      ? { ...fallback, emkmCategoryCode: transaction.emkmCategoryCode, emkmCategorySubtype: transaction.emkmCategorySubtype, counterpartyName: transaction.counterparty }
      : fallback,
    description: transaction.description,
    paymentMethod: transaction.paymentMethod ?? "cash",
    counterparty: transaction.counterparty ?? "",
    reason: "",
  };
}

/** Masukan API dari isian formulir. Kategori lama diturunkan, bukan dipilih. */
export function transactionInputFrom(form: TransactionFormState): LedgerTransactionInput {
  const normalized = normalizeCategory(
    form.category.emkmCategoryCode,
    form.category.emkmCategorySubtype,
    form.paymentMethod as AccountingPaymentMethod,
  );
  const legacy = legacyCategoryForEmkm(normalized.categoryCode, normalized.subtype);
  const counterparty = form.counterparty.trim() || form.category.counterpartyName?.trim() || null;
  return {
    transactionType: normalized.direction,
    amountIdr: Number(form.amount),
    transactionDate: form.date,
    ...legacy,
    description: form.description,
    paymentMethod: (normalized.paymentMethod ?? form.paymentMethod) as LedgerTransactionInput["paymentMethod"],
    counterparty,
    emkmCategoryCode: normalized.categoryCode,
    emkmCategorySubtype: normalized.subtype as LedgerTransactionInput["emkmCategorySubtype"],
    interestAmountIdr: form.category.interestAmountIdr || undefined,
    assetCategory: normalized.categoryCode === 8
      ? (form.category.assetCategory as LedgerTransactionInput["assetCategory"]) ?? "peralatan"
      : null,
    assetUsefulLifeMonths: normalized.categoryCode === 8 ? (form.category.assetUsefulLifeYears ?? 4) * 12 : null,
  };
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor ? <label htmlFor={htmlFor} className="block text-xs font-bold text-umkm-ink">{label}</label> : <p className="text-xs font-bold text-umkm-ink">{label}</p>}
      {children}
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand";

export function TransactionDialog({ open, form, setForm, editing, busy, sector, onClose, onSubmit }: {
  open: boolean;
  form: TransactionFormState;
  setForm: React.Dispatch<React.SetStateAction<TransactionFormState>>;
  editing: LedgerTransactionView | null;
  busy: boolean;
  sector: AccountingSector;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const direction = normalizeCategory(form.category.emkmCategoryCode, form.category.emkmCategorySubtype, null).direction;
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      eyebrow={editing ? "Ubah transaksi" : "Catat transaksi"}
      title={editing ? "Perbaiki catatan" : "Uang masuk atau keluar"}
      className="md:max-w-xl"
    >
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        {/*
          Kategori yang sama dengan layar Catat. Arah uangnya mengikuti
          kategori -- « Ngutangin pelanggan » tetap uang masuk yang belum
          dibayar -- jadi tidak ada lagi tombol Pemasukan/Pengeluaran
          terpisah yang bisa bertentangan dengan kategorinya.
        */}
        <div className="space-y-1.5">
          <CategoryChips
            idPrefix="manual"
            selection={form.category}
            amountIdr={form.amount === "" ? null : Number(form.amount)}
            sector={sector}
            onChange={(category) => setForm((current) => ({ ...current, category }))}
          />
          <p className="text-xs text-umkm-subtle" aria-live="polite">
            Tercatat sebagai <strong className={direction === "income" ? "text-umkm-success" : "text-umkm-ink"}>{direction === "income" ? "uang masuk" : "uang keluar"}</strong>.
          </p>
        </div>
        <Field label="Keterangan" htmlFor="manual-keterangan">
          <input id="manual-keterangan" required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Contoh: Penjualan 10 porsi" className={inputClass} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nominal">
            <InlineMoneyInput value={form.amount === "" ? null : Number(form.amount)} onChange={(value) => setForm((f) => ({ ...f, amount: value === null ? "" : String(value) }))} ariaLabel="Nominal transaksi" />
          </Field>
          <Field label="Tanggal" htmlFor="manual-tanggal">
            <input id="manual-tanggal" required type="date" max={jakartaDate()} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pembayaran" htmlFor="manual-bayar">
            <select id="manual-bayar" value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} className={inputClass}>
              {Object.entries(paymentMethodLabels).filter(([key]) => key !== "unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field label="Pelanggan / pemasok" htmlFor="manual-pihak">
            <ContactNameInput id="manual-pihak" value={form.counterparty} onChange={(value) => setForm((f) => ({ ...f, counterparty: value }))} placeholder="Boleh dikosongkan" className={inputClass} />
          </Field>
        </div>
        {editing && (
          <Field label="Alasan perubahan" htmlFor="manual-alasan">
            <textarea id="manual-alasan" required minLength={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Contoh: nominal salah ketik" className={`${inputClass} min-h-20 py-2`} />
          </Field>
        )}
        <button disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-umkm-brand p-3 text-xs font-bold text-white disabled:opacity-50">
          {busy ? <LoaderCircle className="animate-spin" size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
          {busy ? "Menyimpan..." : "Simpan transaksi"}
        </button>
      </form>
    </FormDialog>
  );
}
