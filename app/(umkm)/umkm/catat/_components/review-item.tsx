"use client";

import { useState } from "react";
import { Check, Edit2, Trash2, X } from "lucide-react";
import { CategoryChips, type CategorySelection } from "@/components/warung/CategoryChips";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { formatTanggal } from "@/lib/format";
import type { AccountingSector } from "@/modules/accounting/coa";
import { categoryLabel } from "@/modules/accounting/templates";
import { jakartaDate, paymentMethodLabels } from "@/modules/ledger/ledger-schema";
import { parseQuantity, withCategory, type ExtractedItem } from "../_lib/capture-items";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-umkm-line-strong bg-white px-3 text-sm font-normal text-umkm-ink outline-none focus:border-umkm-brand";

/**
 * Satu baris draf di layar periksa.
 *
 * Tanggal dan cara bayar dulu tidak bisa dilihat, apalagi diubah: tanggalnya
 * datang dari AI (« kemarin » bisa terbaca hari ini) dan cara bayarnya hanya
 * berubah lewat kategori. Keduanya kini tampil di baris dan bisa diperbaiki
 * sebelum disimpan.
 */
export function ReviewItem({ item, sector, startEditing = false, onChange, onDelete }: {
  item: ExtractedItem;
  sector: AccountingSector;
  startEditing?: boolean;
  onChange: (next: ExtractedItem) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<{ item: string; qty: string; nominal: number; date: string; payment: string }>({ item: item.item, qty: item.qty, nominal: item.nominal, date: item.transactionDate, payment: item.paymentMethod ?? "cash" });
  const [problem, setProblem] = useState("");
  const label = item.item.trim() || "baris baru";

  const open = () => {
    setDraft({ item: item.item, qty: item.qty, nominal: item.nominal, date: item.transactionDate, payment: item.paymentMethod ?? "cash" });
    setProblem("");
    setEditing(true);
  };

  const apply = () => {
    // Nominal nol dulu diterima diam-diam dan baru gagal di server saat
    // menyimpan seluruh draf. Sekarang dihentikan di sini, di baris yang salah.
    if (!draft.item.trim()) { setProblem("Isi keterangannya dulu."); return; }
    if (!(draft.nominal > 0)) { setProblem("Nominal belum diisi."); return; }
    const quantity = parseQuantity(draft.qty);
    const changedTotal = draft.nominal !== item.nominal;
    onChange(withCategory({
      ...item,
      item: draft.item.trim(),
      qty: draft.qty,
      nominal: draft.nominal,
      transactionDate: draft.date,
      paymentMethod: draft.payment as ExtractedItem["paymentMethod"],
      quantity: quantity.quantity,
      unit: quantity.unit,
      // Harga satuan hanya dibuang bila totalnya berubah -- dulu ia selalu
      // terhapus tanpa kabar, bahkan ketika yang diubah hanya namanya.
      unitPriceIdr: changedTotal ? null : item.unitPriceIdr,
    }, item.category));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-umkm-brand-line bg-white p-3.5">
        <label className="block text-xs font-bold text-umkm-muted">
          Keterangan
          <input autoFocus value={draft.item} onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value }))} placeholder="Contoh: bayar parkir" className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold text-umkm-muted">
            Jumlah (boleh kosong)
            <input value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))} placeholder="2 kg" className={inputClass} />
          </label>
          <div className="text-xs font-bold text-umkm-muted">
            <span className="block">Nominal</span>
            <div className="mt-1">
              <InlineMoneyInput value={draft.nominal || null} onChange={(value) => setDraft((d) => ({ ...d, nominal: value ?? 0 }))} ariaLabel="Nominal baris ini" />
            </div>
          </div>
          <label className="block text-xs font-bold text-umkm-muted">
            Tanggal
            <input type="date" max={jakartaDate()} value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className={inputClass} />
          </label>
          <label className="block text-xs font-bold text-umkm-muted">
            Pembayaran
            <select value={draft.payment} onChange={(e) => setDraft((d) => ({ ...d, payment: e.target.value }))} className={inputClass}>
              {Object.entries(paymentMethodLabels).filter(([key]) => key !== "unknown").map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
          </label>
        </div>
        {problem && <p role="alert" className="text-xs font-semibold text-umkm-warning">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { if (!item.item.trim() && !(item.nominal > 0)) onDelete(); else setEditing(false); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-umkm-line px-3 text-xs font-bold text-umkm-muted hover:bg-umkm-surface"><X size={16} aria-hidden /> Batal</button>
          <button type="button" onClick={apply} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-umkm-brand px-3 text-xs font-bold text-white hover:bg-umkm-brand-deep"><Check size={16} aria-hidden /> Pakai</button>
        </div>
      </div>
    );
  }

  const incomplete = !(item.nominal > 0) || !item.item.trim();
  return (
    <div className={`space-y-3 rounded-xl border bg-white p-3.5 ${incomplete ? "border-umkm-warning-line" : "border-umkm-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-umkm-ink">{item.item || "Keterangan belum diisi"}</p>
          <p className="text-xs text-umkm-muted">
            {[item.qty, categoryLabel(item.category.emkmCategoryCode, item.category.emkmCategorySubtype), formatTanggal(item.transactionDate), paymentMethodLabels[item.paymentMethod ?? "unknown"]].filter(Boolean).join(" · ")}
          </p>
          <p className={`mt-1 text-sm font-bold tabular-nums ${item.type === "masuk" ? "text-umkm-success" : "text-umkm-ink"}`}>
            {item.nominal > 0 ? `${item.type === "masuk" ? "+" : "−"}Rp${item.nominal.toLocaleString("id-ID")}` : "Nominal belum diisi"}
          </p>
        </div>
        {/* Dua sasaran 44px dengan jarak: hapus dan ubah tidak berimpitan. */}
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={open} aria-label={`Ubah ${label}`} className="grid size-11 place-items-center rounded-lg text-umkm-muted hover:bg-umkm-surface-muted hover:text-umkm-ink"><Edit2 size={16} aria-hidden /></button>
          <button type="button" onClick={onDelete} aria-label={`Hapus ${label}`} className="grid size-11 place-items-center rounded-lg text-umkm-danger hover:bg-umkm-danger-soft"><Trash2 size={16} aria-hidden /></button>
        </div>
      </div>
      <CategoryChips
        idPrefix={`item-${item.id}`}
        selection={item.category}
        amountIdr={item.nominal}
        sector={sector}
        onChange={(category: CategorySelection) => onChange(withCategory(item, category))}
      />
    </div>
  );
}
