"use client";

import { FormDialog } from "@/components/ui/dialog";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";

export function ClosingDialog({ open, dayLabel, openingCash, physicalCash, note, busy, setOpeningCash, setPhysicalCash, setNote, onClose, onSubmit }: {
  open: boolean;
  dayLabel: string;
  openingCash: string;
  physicalCash: string;
  note: string;
  busy: boolean;
  setOpeningCash: (value: string) => void;
  setPhysicalCash: (value: string) => void;
  setNote: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      eyebrow="Tutup kas"
      title={`Selesaikan catatan ${dayLabel}`}
      description={`Boleh dilewati jika Anda belum menghitung uang fisik. Setelah ditutup, transaksi ${dayLabel} tidak dapat diedit tetapi masih dapat dibatalkan dengan alasan.`}
    >
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-umkm-ink">Uang kas awal (opsional)</p>
          <InlineMoneyInput value={openingCash === "" ? null : Number(openingCash)} onChange={(value) => setOpeningCash(value === null ? "" : String(value))} ariaLabel="Uang kas awal" />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-umkm-ink">Uang fisik saat ini (opsional)</p>
          <InlineMoneyInput value={physicalCash === "" ? null : Number(physicalCash)} onChange={(value) => setPhysicalCash(value === null ? "" : String(value))} ariaLabel="Uang fisik saat ini" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="tutup-kas-catatan" className="block text-xs font-bold text-umkm-ink">Catatan (opsional)</label>
          <textarea id="tutup-kas-catatan" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20 w-full rounded-xl border border-umkm-line-strong px-3 py-2 text-sm text-umkm-ink outline-none focus:border-umkm-brand" />
        </div>
        <button disabled={busy} className="min-h-11 w-full rounded-xl bg-umkm-brand p-3 text-xs font-bold text-white disabled:opacity-50">
          {busy ? "Menyimpan..." : `Tutup kas ${dayLabel}`}
        </button>
      </form>
    </FormDialog>
  );
}
