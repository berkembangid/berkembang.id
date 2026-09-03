"use client";

/**
 * Kartu beranda untuk catatan lama yang belum punya kategori.
 *
 * Catatan yang dibuat sebelum kategori bahasa warung ada ditandai
 * `needs_reclass`. Satu ketuk pada chip sudah cukup untuk membereskannya.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Tags } from "lucide-react";
import {
  AccountingClientError,
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

export function ReclassCard() {
  const [transactions, setTransactions] = useState<NeedsReclassView[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
    setMessage("");
    try {
      await reclassTransactionClient(transactionId, {
        emkmCategoryCode: categoryCode,
        emkmCategorySubtype: subtype,
      });
      setTransactions((current) => current.filter((item) => item.transactionId !== transactionId));
      setOpenId(null);
      setMessage("Kategori tersimpan.");
    } catch (cause) {
      setMessage(
        cause instanceof AccountingClientError ? cause.message : "Kategori belum tersimpan. Coba lagi.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading || transactions.length === 0) return null;

  return (
    <section
      aria-labelledby="reclass-title"
      className="rounded-2xl border border-[#f0d9a8] bg-[#fdf8ee] p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8a6412]">
          <Tags size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="reclass-title" className="text-sm font-bold text-[#5c3700]">
            {transactions.length} catatan lama perlu dicek kategorinya
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#7a4f0a]">
            Catatan ini dibuat sebelum ada pilihan kategori. Pilih satu kategori supaya untung bulan ini
            terhitung benar.
          </p>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 min-h-11 rounded-xl bg-[#8a6412] px-4 text-xs font-bold text-white"
          >
            {expanded ? "Tutup daftar" : "Cek sekarang"}
          </button>
        </div>
      </div>

      {message && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#5c3700]">
          <CheckCircle2 size={13} /> {message}
        </p>
      )}

      {expanded && (
        <ul className="mt-4 space-y-2">
          {transactions.map((item) => (
            <li key={item.transactionId} className="rounded-xl border border-[#f0d9a8] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <strong className="block truncate text-xs text-[#1b2a3a]">{item.description}</strong>
                  <small className="text-[10px] text-[#6e859e]">
                    {item.transactionDate} · {item.direction === "income" ? "uang masuk" : "uang keluar"}
                  </small>
                </span>
                <span
                  className={`shrink-0 text-xs font-black ${item.direction === "income" ? "text-[#0b7a55]" : "text-[#b4304a]"}`}
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
                        className="min-h-11 rounded-full border border-[#d8dcff] bg-white px-3 py-2 text-xs font-bold text-[#3a3f63] disabled:opacity-50"
                      >
                        {choice.label}
                      </button>
                    ))}
                  {item.direction === "expense" && (
                    <details className="w-full">
                      <summary className="cursor-pointer py-2 text-[11px] font-bold text-[#0b5f86]">
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
                              className="min-h-11 rounded-full border border-[#d8dcff] bg-white px-3 py-2 text-xs font-bold text-[#3a3f63] disabled:opacity-50"
                            >
                              {choice.label}
                            </button>
                          ))}
                      </div>
                    </details>
                  )}
                  {busyId === item.transactionId && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#6e859e]">
                      <LoaderCircle className="animate-spin" size={12} /> Menyimpan...
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(item.transactionId)}
                  className="mt-2 min-h-11 text-xs font-bold text-[#0b5f86]"
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
