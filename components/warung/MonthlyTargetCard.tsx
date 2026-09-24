"use client";

import { useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { getWarungReportClient } from "@/modules/accounting/accounting-client";
import { jakartaDate } from "@/modules/ledger/capture-schema";
import { getMonthlyTargetClient, setMonthlyTargetClient } from "@/modules/ledger/ledger-client";
import { targetProgress, type MonthlyTarget } from "@/modules/ledger/targets";

function formatIdr(value: number) { return `Rp${Math.round(value).toLocaleString("id-ID")}`; }

/**
 * Target bulan ini di Beranda (0114).
 *
 * Capaiannya memakai angka yang sama dengan laporan « Bulan ini » -- uang
 * masuk dari JUALAN (bukan modal atau pinjaman) serta belanja & biaya --
 * supaya dua layar tidak pernah menyebut angka berbeda untuk bulan yang sama.
 *
 * Yang dibandingkan dengan target omzet bukan hanya persentasenya, tetapi
 * juga hari yang sudah lewat: 40% di tanggal 10 itu bagus, 40% di tanggal 25
 * tertinggal. Kalimatnya menyebut berapa per hari yang masih dibutuhkan.
 */
export function MonthlyTargetCard() {
  const [target, setTarget] = useState<MonthlyTarget | null>(null);
  const [sales, setSales] = useState(0);
  const [spending, setSpending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftRevenue, setDraftRevenue] = useState<number | null>(null);
  const [draftExpense, setDraftExpense] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const asOf = jakartaDate();

  const load = useCallback(async () => {
    try {
      const [saved, report] = await Promise.all([getMonthlyTargetClient(), getWarungReportClient(asOf.slice(0, 7))]);
      setTarget(saved);
      setSales(report.boxes.salesIdr);
      setSpending(report.boxes.spendingIdr);
      setFailed(false);
    } catch {
      // Kartu pelengkap: gagal dimuat, ia tidak tampil -- Beranda tetap berguna.
      setFailed(true);
    }
  }, [asOf]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const startEdit = () => {
    setDraftRevenue(target?.revenueTargetIdr ?? null);
    setDraftExpense(target?.expenseLimitIdr ?? null);
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await setMonthlyTargetClient({ revenueTargetIdr: draftRevenue || null, expenseLimitIdr: draftExpense || null });
      setTarget(next);
      setEditing(false);
      notifySuccess(next.revenueTargetIdr || next.expenseLimitIdr ? "Target tersimpan" : "Target dihapus", {
        description: next.revenueTargetIdr || next.expenseLimitIdr ? "Berlaku setiap bulan sampai Anda mengubahnya." : undefined,
      });
    } catch (error) {
      notifyFromError(error, "Target belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  if (failed || target === null) return null;

  const hasTarget = Boolean(target.revenueTargetIdr || target.expenseLimitIdr);
  const progress = targetProgress(target, sales, spending, asOf);

  return (
    <section aria-labelledby="target-bulan-ini" className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-start justify-between gap-3">
        <h2 id="target-bulan-ini" className="flex items-center gap-2 text-sm font-bold text-umkm-ink">
          <Target size={16} aria-hidden className="text-umkm-brand" /> Target bulan ini
        </h2>
        {hasTarget && !editing && (
          <button type="button" onClick={startEdit} className="min-h-11 rounded-lg px-2 text-xs font-bold text-umkm-brand">Ubah</button>
        )}
      </div>

      {editing ? (
        <form onSubmit={(event) => void save(event)} className="mt-3 space-y-3">
          <div className="text-xs font-bold text-umkm-ink">
            Omzet yang ingin dicapai tiap bulan
            <div className="mt-1.5"><InlineMoneyInput ariaLabel="Target omzet bulanan" value={draftRevenue} onChange={setDraftRevenue} /></div>
          </div>
          <div className="text-xs font-bold text-umkm-ink">
            Batas belanja & biaya tiap bulan
            <div className="mt-1.5"><InlineMoneyInput ariaLabel="Batas biaya bulanan" value={draftExpense} onChange={setDraftExpense} /></div>
            <span className="mt-1 block text-xs font-normal text-umkm-subtle">Boleh diisi salah satu saja. Kosongkan keduanya untuk menghapus target.</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-ink">Batal</button>
            <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan target"}</button>
          </div>
        </form>
      ) : !hasTarget ? (
        <div className="mt-2">
          <p className="text-xs leading-relaxed text-umkm-subtle">Pasang target omzet atau batas biaya, lalu lihat setiap hari apakah bulan ini sesuai jalur.</p>
          <button type="button" onClick={startEdit} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-4 text-xs font-bold text-umkm-brand">Pasang target</button>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {target.revenueTargetIdr && progress.revenueRatio !== null && (
            <Meter
              label="Omzet"
              value={`${formatIdr(sales)} dari ${formatIdr(target.revenueTargetIdr)}`}
              ratio={progress.revenueRatio}
              marker={progress.monthRatio}
              tone={progress.revenueStatus === "behind" ? "warning" : "success"}
              note={
                progress.revenueStatus === "reached"
                  ? "Target bulan ini sudah tercapai."
                  : progress.revenueStatus === "on_track"
                    ? `Sesuai jalur. Perlu sekitar ${formatIdr(progress.neededPerDayIdr ?? 0)} per hari sampai akhir bulan.`
                    : `Tertinggal dari jalur. Perlu sekitar ${formatIdr(progress.neededPerDayIdr ?? 0)} per hari untuk mengejar.`
              }
            />
          )}
          {target.expenseLimitIdr && progress.expenseRatio !== null && (
            <Meter
              label="Belanja & biaya"
              value={`${formatIdr(spending)} dari batas ${formatIdr(target.expenseLimitIdr)}`}
              ratio={progress.expenseRatio}
              tone={progress.expenseStatus === "ok" ? "brand" : "warning"}
              note={
                progress.expenseStatus === "over"
                  ? `Sudah lewat batas ${formatIdr(spending - target.expenseLimitIdr)}.`
                  : progress.expenseStatus === "near"
                    ? `Hampir sampai batas. Sisa ${formatIdr(target.expenseLimitIdr - spending)}.`
                    : `Masih ada ruang ${formatIdr(target.expenseLimitIdr - spending)}.`
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

const METER_TONE = {
  success: "bg-umkm-success",
  brand: "bg-umkm-brand",
  warning: "bg-umkm-warning",
} as const;

function Meter({ label, value, ratio, marker, tone, note }: {
  label: string;
  value: string;
  ratio: number;
  /** Posisi « hari ini » di bulan berjalan, 0..1. */
  marker?: number;
  tone: keyof typeof METER_TONE;
  note: string;
}) {
  const percent = Math.min(Math.round(ratio * 100), 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-umkm-ink">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-umkm-muted">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-umkm-line-soft"
      >
        <div className={`h-full rounded-full ${METER_TONE[tone]}`} style={{ width: `${percent}%` }} />
        {marker !== undefined && (
          <span aria-hidden className="absolute top-0 h-full w-0.5 bg-umkm-ink/40" style={{ left: `${Math.min(marker * 100, 100)}%` }} />
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">{note}</p>
    </div>
  );
}
