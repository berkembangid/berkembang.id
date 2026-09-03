"use client";

/**
 * Hitung stok akhir bulan.
 *
 * Kartu ini hidup di tab "Bulan Ini", bukan di tab berkas untuk bank, karena
 * angka yang ia ubah adalah untung bulan ini — bukan isi berkas. Menaruhnya di
 * tempat lain memaksa pemilik menebak apa hubungannya.
 *
 * Pertanyaannya menyebut "senilai berapa" dan kolomnya berawalan Rp, supaya
 * "78" tidak bisa terbaca sebagai 78 butir. Sebelum disimpan, akibatnya
 * ditunjukkan lebih dulu: untung bulan ini naik atau turun berapa.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Package, RotateCcw } from "lucide-react";
import {
  AccountingClientError,
  getInventoryCountClient,
  getRemindersClient,
  saveInventoryCountClient,
} from "@/modules/accounting/accounting-client";
import type { InventoryCountView } from "@/modules/accounting/period";
import { MoneyInput } from "@/components/warung/MoneyInput";
import { formatIdr, monthLabel } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

/** Kartu menonjol di tiga hari terakhir bulan berjalan. */
export function isNearMonthEnd(today = jakartaDate()) {
  const date = new Date(`${today}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return lastDay - date.getUTCDate() <= 2;
}

/**
 * Kalimat akibat, dihitung sebelum disimpan. Arahnya sengaja dijelaskan dari
 * sisi untung, bukan dari sisi persediaan, karena itu angka yang pemilik
 * pedulikan.
 */
export function stockEffectSentence(bookValueIdr: number, countedValueIdr: number): string {
  const difference = countedValueIdr - bookValueIdr;
  if (difference === 0) {
    return "Pas dengan catatan. Untung bulan ini tidak berubah.";
  }
  if (difference > 0) {
    return `Berarti masih ada bahan ${formatIdr(difference)} yang belum terpakai. Untung bulan ini naik ${formatIdr(difference)}.`;
  }
  return `Berarti bahan terpakai ${formatIdr(-difference)} lebih banyak dari catatan. Untung bulan ini turun ${formatIdr(-difference)}.`;
}

export function StockCountCard({
  month: runningMonth = jakartaDate().slice(0, 7),
  onSaved,
}: {
  month?: string;
  onSaved?: () => void;
}) {
  // Kartu ini dulu selalu menanyakan bulan berjalan. Dua akibatnya nyata.
  //
  // Pertama, pada tanggal 2 ia bertanya "sisa bahan akhir September senilai
  // berapa?" -- pertanyaan yang belum bisa dijawab siapa pun.
  //
  // Kedua, dan ini yang lebih merugikan: pengingat menagih bulan-bulan LAMPAU
  // yang punya belanja bahan tapi belum dihitung, sementara satu-satunya
  // tempat mengisinya terkunci ke bulan berjalan. Pemilik membaca "Hitung
  // sisa stok Agustus", lalu tidak menemukan cara mengerjakannya.
  //
  // Bulan yang perlu dihitung diambil dari sumber yang sama dengan
  // pengingatnya, `fn_pending_reminders`, supaya keduanya mustahil berselisih.
  const [pendingMonths, setPendingMonths] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen ?? pendingMonths[0] ?? runningMonth;
  const [state, setState] = useState<InventoryCountView | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getInventoryCountClient(month);
      setState(result.inventoryCount);
      setDraft(result.inventoryCount.count?.countedValueIdr ?? null);
    } catch {
      setState(null);
    }
  }, [month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { reminders } = await getRemindersClient(jakartaDate());
        if (cancelled) return;
        setPendingMonths(
          reminders
            .filter((item) => item.kind === "HITUNG_STOK")
            .map((item) => item.periodMonth)
            .sort(),
        );
      } catch {
        // Daftar bulan tertunggak hanya pelengkap; kartunya tetap berguna
        // untuk bulan berjalan tanpa itu.
        if (!cancelled) setPendingMonths([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  // Bulan berjalan selalu bisa dipilih walau belum ditagih: pemilik yang tutup
  // lebih awal berhak mengisinya sendiri.
  const selectable = [...new Set([...pendingMonths, runningMonth])].sort();
  const overdue = pendingMonths.filter((item) => item < runningMonth);

  const saved = state.count;
  const showForm = editing || !saved;

  const submit = async () => {
    if (draft === null) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await saveInventoryCountClient({
        periodMonth: month,
        countedValueIdr: draft,
        notes: null,
      });
      setMessage(stockEffectSentence(result.previousValueIdr, result.countedValueIdr));
      setEditing(false);
      await load();
      onSaved?.();
    } catch (cause) {
      setMessage(cause instanceof AccountingClientError ? cause.message : "Hitungan stok belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  // Bulan lampau yang belum dihitung selalu mendesak; bulan berjalan hanya
  // pada tiga hari terakhirnya.
  const highlighted = (overdue.length > 0 && month < runningMonth) || (isNearMonthEnd() && !saved);

  return (
    <section
      className={`rounded-2xl border p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)] ${
        highlighted ? "border-[#f0d49a] bg-[#fdf7ec]" : "border-[#e3e9f0] bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <Package size={18} className="mt-0.5 shrink-0 text-[#0b5f86]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#1b2a3a]">
            Sisa bahan akhir {monthLabel(month)} kira-kira senilai berapa?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">
            {month < runningMonth
              ? "Bulan itu sudah lewat tanpa dihitung, jadi untungnya masih memikul bahan yang sebenarnya belum terpakai."
              : "Bahan yang sudah dibeli tapi belum terpakai bukan biaya bulan ini. Perkiraan kasar sudah cukup, dan boleh dilewati."}
          </p>
          {selectable.length > 1 && (
            <label className="mt-2 block text-[11px] font-bold text-[#4a6280]">
              Bulan yang dihitung
              <select
                value={month}
                onChange={(event) => {
                  setChosen(event.target.value);
                  setEditing(false);
                }}
                className="mt-1 block min-h-10 w-full max-w-xs rounded-xl border border-[#d5dfe9] bg-white px-3 text-xs font-medium outline-none focus:border-[#0b5f86]"
              >
                {selectable.map((option) => (
                  <option key={option} value={option}>
                    {monthLabel(option)}
                    {option < runningMonth ? " - belum dihitung" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="mt-4 space-y-3">
          <MoneyInput
            label="Perkiraan nilai bahan yang masih ada"
            value={draft}
            onChange={setDraft}
            helper={`Menurut catatan sekarang tercatat ${formatIdr(state.bookValueIdr)}. Isi angka rupiah, bukan jumlah barang.`}
          />

          {draft !== null && (
            <p className="rounded-xl border border-[#addcf4] bg-[#eef8fd] p-3 text-xs font-semibold leading-relaxed text-[#1b2a3a]">
              {stockEffectSentence(state.bookValueIdr, draft)}
            </p>
          )}

          <div className="flex gap-2">
            {saved && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(saved.countedValueIdr);
                }}
                className="min-h-11 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
              >
                Batal
              </button>
            )}
            <button
              type="button"
              disabled={busy || draft === null}
              onClick={() => void submit()}
              className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : saved ? "Perbarui hitungan" : "Simpan hitungan"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6f9fb] p-3">
          <div>
            <p className="text-xs font-bold text-[#1b2a3a]">
              Sudah dihitung: {formatIdr(saved.countedValueIdr)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#6e859e]">
              {saved.adjustmentIdr === 0
                ? "Pas dengan catatan."
                : saved.adjustmentIdr > 0
                  ? `Untung bulan ini naik ${formatIdr(saved.adjustmentIdr)} karena bahan belum terpakai.`
                  : `Untung bulan ini turun ${formatIdr(-saved.adjustmentIdr)} karena bahan terpakai lebih banyak.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dfe9] bg-white px-3 text-xs font-bold text-[#1b2a3a]"
          >
            <RotateCcw size={13} /> Hitung ulang
          </button>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-[#1b2a3a]">
          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#0b7a55]" /> {message}
        </p>
      )}
    </section>
  );
}
