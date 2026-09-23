"use client";

/**
 * Kartu beranda untuk catatan lama yang belum punya kategori.
 *
 * Catatan yang dibuat sebelum kategori bahasa warung ada ditandai
 * `needs_reclass`. Satu ketuk pada chip sudah cukup untuk membereskannya.
 */

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Tags } from "lucide-react";
import {
  getNeedsReclassClient,
  reclassTransactionClient,
} from "@/modules/accounting/accounting-client";
import type { NeedsReclassView } from "@/modules/accounting/reports";
import {
  expenseSubCategoryChoices,
  primaryCategoryChoices,
  type EmkmCategoryCode,
} from "@/modules/accounting/templates";
import { formatIdr } from "@/modules/accounting/warung";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { formatTanggal } from "@/lib/format";

export function ReclassCard() {
  const [transactions, setTransactions] = useState<NeedsReclassView[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await getNeedsReclassClient();
      setTransactions(result.transactions);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const apply = async (transactionId: string, categoryCode: EmkmCategoryCode, subtype: string | null) => {
    setBusyId(transactionId);
    try {
      await reclassTransactionClient(transactionId, {
        emkmCategoryCode: categoryCode,
        emkmCategorySubtype: subtype,
      });
      setTransactions((current) => current.filter((item) => item.transactionId !== transactionId));
      setOpenId(null);
      // Barisnya langsung hilang dari daftar begitu tersimpan, jadi kabarnya
      // memang cukup sekilas -- tidak ada apa pun di layar yang menunggu
      // dibaca ulang.
      notifySuccess("Kategori tersimpan");
    } catch (cause) {
      notifyFromError(cause, "Kategori belum tersimpan. Coba lagi.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading || transactions.length === 0) return null;

  return (
    <section
      aria-labelledby="reclass-title"
      className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-umkm-warning">
          <Tags size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="reclass-title" className="text-sm font-bold text-umkm-warning-strong">
            {transactions.length} catatan lama perlu dicek kategorinya
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-umkm-warning-strong">
            Catatan ini dibuat sebelum ada pilihan kategori. Pilih satu kategori supaya untung bulan ini
            terhitung benar.
          </p>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 min-h-11 rounded-xl bg-umkm-warning px-4 text-xs font-bold text-white"
          >
            {expanded ? "Tutup daftar" : "Cek sekarang"}
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="mt-4 space-y-2">
          {transactions.map((item) => (
            <li key={item.transactionId} className="rounded-xl border border-umkm-warning-line bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-umkm-ink">{item.description}</strong>
                  <small className="text-xs text-umkm-subtle">
                    {formatTanggal(item.transactionDate)} · {item.direction === "income" ? "uang masuk" : "uang keluar"}
                  </small>
                </span>
                <span
                  className={`shrink-0 text-xs font-black ${item.direction === "income" ? "text-umkm-success" : "text-umkm-danger"}`}
                >
                  {item.direction === "income" ? "+" : "-"}
                  {formatIdr(item.amountIdr)}
                </span>
              </div>

              {openId === item.transactionId ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {primaryCategoryChoices
                    .filter((choice) =>
                      item.direction === "income"
                        ? [1, 2, 3, 4, 10].includes(choice.categoryCode)
                        : [5, 6, 7, 8, 9].includes(choice.categoryCode),
                    )
                    .map((choice) => (
                      <button
                        key={`${item.transactionId}-${choice.categoryCode}-${choice.subtype ?? "x"}`}
                        type="button"
                        disabled={busyId === item.transactionId}
                        onClick={() =>
                          void apply(
                            item.transactionId,
                            choice.categoryCode,
                            choice.categoryCode === 6 ? "5290" : choice.subtype,
                          )
                        }
                        className="min-h-11 rounded-full border border-umkm-line-strong bg-white px-3 py-2 text-xs font-bold text-umkm-ink-soft disabled:opacity-50"
                      >
                        {choice.label}
                      </button>
                    ))}
                  {item.direction === "expense" && (
                    <details className="w-full">
                      <summary className="cursor-pointer py-2 text-xs font-bold text-umkm-brand">
                        Biaya usaha yang lebih rinci
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {expenseSubCategoryChoices
                          .filter((choice) => choice.subtype !== "5280")
                          .map((choice) => (
                            <button
                              key={`${item.transactionId}-sub-${choice.subtype}`}
                              type="button"
                              disabled={busyId === item.transactionId}
                              onClick={() => void apply(item.transactionId, 6, choice.subtype)}
                              className="min-h-11 rounded-full border border-umkm-line-strong bg-white px-3 py-2 text-xs font-bold text-umkm-ink-soft disabled:opacity-50"
                            >
                              {choice.label}
                            </button>
                          ))}
                      </div>
                    </details>
                  )}
                  {busyId === item.transactionId && (
                    <span className="flex items-center gap-1 text-xs font-bold text-umkm-subtle">
                      <LoaderCircle className="animate-spin" size={12} /> Menyimpan...
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(item.transactionId)}
                  className="mt-2 min-h-11 text-xs font-bold text-umkm-brand"
                >
                  Pilih kategori
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
