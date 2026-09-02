"use client";

/**
 * Wizard kondisi awal usaha: enam pertanyaan, satu pertanyaan per layar.
 *
 * Tanpa ini "Kondisi Usaha" tidak bisa dijawab jujur, karena saldo kas dan
 * nilai alat tidak dimulai dari nol. Setiap pertanyaan boleh dilewati dengan
 * nilai kosong; yang penting pemilik sampai ke layar terakhir.
 *
 * Layar yang sama dipakai untuk memperbaikinya. Pertanyaannya identik, jadi
 * membuat layar koreksi tersendiri berarti dua tempat menyimpan kalimat yang
 * sama persis. Bedanya hanya: jawabannya sudah terisi, kata "sekarang" diganti
 * tanggal saat pemilik mulai mencatat, dan sebelum menyimpan ia diberi tahu
 * apa akibatnya lalu diminta menuliskan alasannya.
 */

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import {
  AccountingClientError,
  correctOpeningBalancesClient,
  saveOpeningBalancesClient,
} from "@/modules/accounting/accounting-client";
import type { OpeningBalanceAnswers } from "@/modules/accounting/period";
import {
  assetCategories,
  assetCategoryLabels,
  lenderTypeLabels,
  lenderTypes,
  type AssetCategory,
  type LenderType,
} from "@/modules/accounting/period-schema";
import { InlineMoneyInput, MoneyInput } from "@/components/warung/MoneyInput";
import { formatIdr } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

type ReceivableRow = { name: string; amount: number | null };
type PayableRow = { name: string; amount: number | null; lenderType: LenderType; installment: number | null };
type AssetRow = { name: string; cost: number | null; acquiredOn: string; category: AssetCategory };

const inputClass =
  "min-h-11 w-full rounded-xl border border-[#d5dfe9] bg-white px-3 text-sm font-medium text-[#1b2a3a] outline-none focus:border-[#0b5f86]";
const labelClass = "block text-xs font-bold text-[#1b2a3a]";
const helperClass = "mt-1 text-[11px] leading-relaxed text-[#6e859e]";

function amount(value: number | null) {
  return value ?? 0;
}

export function OpeningBalanceWizard({
  onDone,
  onSkip,
  answers,
  monthsRecorded = 0,
}: {
  onDone: () => void;
  onSkip?: () => void;
  /** Jawaban lama; kehadirannya yang menentukan wizard jadi layar koreksi. */
  answers?: OpeningBalanceAnswers | null;
  monthsRecorded?: number;
}) {
  const editing = Boolean(answers);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  const [startDate, setStartDate] = useState(answers?.startDate ?? jakartaDate());
  const [cash, setCash] = useState<number | null>(answers?.cashIdr ?? null);
  const [bank, setBank] = useState<number | null>(answers?.bankIdr ?? null);
  const [inventory, setInventory] = useState<number | null>(answers?.inventoryIdr ?? null);
  const [receivables, setReceivables] = useState<ReceivableRow[]>(
    answers?.receivables.map((row) => ({ name: row.name, amount: row.amountIdr })) ?? [],
  );
  const [payables, setPayables] = useState<PayableRow[]>(
    answers?.payables.map((row) => ({
      name: row.name,
      amount: row.amountIdr,
      lenderType: row.lenderType,
      installment: row.monthlyInstallmentIdr,
    })) ?? [],
  );
  const [assets, setAssets] = useState<AssetRow[]>(
    answers?.assets.map((row) => ({
      name: row.name,
      cost: row.costIdr,
      acquiredOn: row.acquiredOn,
      category: row.category,
    })) ?? [],
  );

  // Di mode koreksi, "sekarang" adalah hari pemilik mulai mencatat, bukan hari
  // ini. Menyebutnya "sekarang" akan membuat jawabannya salah.
  const whenLabel = editing ? `waktu itu (${answers?.startDate})` : "sekarang";

  const receivableTotal = receivables.reduce((sum, row) => sum + amount(row.amount), 0);
  const payableTotal = payables.reduce((sum, row) => sum + amount(row.amount), 0);
  const assetTotal = assets.reduce((sum, row) => sum + amount(row.cost), 0);
  const ownedTotal = amount(cash) + amount(bank) + receivableTotal + amount(inventory) + assetTotal;
  const netWorth = ownedTotal - payableTotal;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        startDate,
        cashIdr: amount(cash),
        bankIdr: amount(bank),
        inventoryIdr: amount(inventory),
        receivables: receivables
          .filter((row) => row.name.trim() && amount(row.amount) > 0)
          .map((row) => ({ name: row.name.trim(), amountIdr: amount(row.amount) })),
        payables: payables
          .filter((row) => row.name.trim() && amount(row.amount) > 0)
          .map((row) => ({
            name: row.name.trim(),
            amountIdr: amount(row.amount),
            lenderType: row.lenderType,
            monthlyInstallmentIdr: amount(row.installment) > 0 ? amount(row.installment) : null,
          })),
        assets: assets
          .filter((row) => row.name.trim() && amount(row.cost) > 0)
          .map((row) => ({
            name: row.name.trim(),
            costIdr: amount(row.cost),
            acquiredOn: row.acquiredOn || startDate,
            category: row.category,
          })),
        notes: null,
      };
      if (editing) {
        await correctOpeningBalancesClient({ ...payload, reason: reason.trim() });
      } else {
        await saveOpeningBalancesClient(payload);
      }
      onDone();
    } catch (cause) {
      setError(
        cause instanceof AccountingClientError ? cause.message : "Kondisi awal usaha belum tersimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: `Uang di laci ${whenLabel} berapa?`,
      helper: editing
        ? "Uang tunai yang ada di tempat usaha pada hari Anda mulai mencatat."
        : "Hitung uang tunai yang benar-benar ada di tempat usaha hari ini.",
      body: (
        <MoneyInput
          label="Uang tunai"
          value={cash}
          onChange={setCash}
          autoFocus
          helper="Boleh dikosongkan kalau belum sempat menghitung."
        />
      ),
    },
    {
      title: `Saldo rekening atau QRIS ${whenLabel} berapa?`,
      helper: "Uang usaha yang ada di bank, e-wallet, atau saldo QRIS.",
      body: (
        <MoneyInput
          label="Saldo rekening"
          value={bank}
          onChange={setBank}
          helper="Gabungkan saldo bank, e-wallet, dan QRIS yang dipakai untuk usaha."
        />
      ),
    },
    {
      title: "Ada yang masih berutang ke Anda?",
      helper: "Pelanggan yang sudah menerima barang tapi belum membayar.",
      body: (
        <div className="space-y-3">
          {receivables.map((row, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={row.name}
                onChange={(event) =>
                  setReceivables((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                }
                placeholder="Nama pelanggan"
                className={inputClass}
              />
              <div className="w-40 shrink-0">
                <InlineMoneyInput
                  ariaLabel="Sisa utang pelanggan"
                  value={row.amount}
                  onChange={(value) =>
                    setReceivables((rows) => rows.map((item, i) => (i === index ? { ...item, amount: value } : item)))
                  }
                />
              </div>
              <button
                type="button"
                aria-label="Hapus baris"
                onClick={() => setReceivables((rows) => rows.filter((_, i) => i !== index))}
                className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setReceivables((rows) => [...rows, { name: "", amount: null }])}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah pelanggan
          </button>
          <p className={helperClass}>Total: {formatIdr(receivableTotal)}</p>
        </div>
      ),
    },
    {
      title: "Anda masih berutang ke siapa?",
      helper: "Pinjaman koperasi, bank, keluarga, atau belanja yang belum dibayar ke pemasok.",
      body: (
        <div className="space-y-3">
          {payables.map((row, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-[#e3e9f0] p-3">
              <div className="flex gap-2">
                <input
                  value={row.name}
                  onChange={(event) =>
                    setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                  }
                  placeholder="Nama pemberi pinjaman"
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Hapus baris"
                  onClick={() => setPayables((rows) => rows.filter((_, i) => i !== index))}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Sisa utang
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Sisa utang"
                      value={row.amount}
                      onChange={(value) =>
                        setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, amount: value } : item)))
                      }
                    />
                  </div>
                </label>
                <label className={labelClass}>
                  Cicilan per bulan
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Cicilan per bulan"
                      value={row.installment}
                      onChange={(value) =>
                        setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, installment: value } : item)))
                      }
                    />
                  </div>
                </label>
              </div>
              <select
                value={row.lenderType}
                onChange={(event) =>
                  setPayables((rows) =>
                    rows.map((item, i) => (i === index ? { ...item, lenderType: event.target.value as LenderType } : item)),
                  )
                }
                className={inputClass}
              >
                {lenderTypes.map((type) => (
                  <option key={type} value={type}>
                    {lenderTypeLabels[type]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setPayables((rows) => [...rows, { name: "", amount: null, lenderType: "KOPERASI", installment: null }])
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah utang
          </button>
          <p className={helperClass}>Total: {formatIdr(payableTotal)}</p>
        </div>
      ),
    },
    {
      title: `Stok bahan ${whenLabel} kira-kira senilai berapa?`,
      helper: "Perkiraan kasar sudah cukup. Nanti bisa diperbarui setiap akhir bulan.",
      body: (
        <MoneyInput
          label="Perkiraan nilai bahan yang ada"
          value={inventory}
          onChange={setInventory}
          helper="Isi nilai rupiahnya, bukan jumlah barang. Perkiraan kasar sudah cukup."
        />
      ),
    },
    {
      title: "Alat usaha apa yang Anda punya?",
      helper: "Kulkas, etalase, gerobak, motor — yang dipakai bertahun-tahun.",
      body: (
        <div className="space-y-3">
          {assets.map((row, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-[#e3e9f0] p-3">
              <div className="flex gap-2">
                <input
                  value={row.name}
                  onChange={(event) =>
                    setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                  }
                  placeholder="Nama alat"
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Hapus baris"
                  onClick={() => setAssets((rows) => rows.filter((_, i) => i !== index))}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Harga beli dulu
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Harga beli alat"
                      value={row.cost}
                      onChange={(value) =>
                        setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, cost: value } : item)))
                      }
                    />
                  </div>
                </label>
                <label className={labelClass}>
                  Dibeli kapan
                  <input
                    type="date"
                    max={startDate}
                    value={row.acquiredOn}
                    onChange={(event) =>
                      setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, acquiredOn: event.target.value } : item)))
                    }
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
              </div>
              <select
                value={row.category}
                onChange={(event) =>
                  setAssets((rows) =>
                    rows.map((item, i) => (i === index ? { ...item, category: event.target.value as AssetCategory } : item)),
                  )
                }
                className={inputClass}
              >
                {assetCategories.map((category) => (
                  <option key={category} value={category}>
                    {assetCategoryLabels[category]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setAssets((rows) => [...rows, { name: "", cost: null, acquiredOn: startDate, category: "peralatan" }])
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah alat
          </button>
          <p className={helperClass}>Total: {formatIdr(assetTotal)}</p>
        </div>
      ),
    },
  ];

  const isSummary = step === steps.length;

  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_30px_rgba(27,42,58,.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5f86]">
          {editing ? "Perbaiki kondisi awal usaha" : "Kondisi awal usaha"} ·{" "}
          {Math.min(step + 1, steps.length)} dari {steps.length}
        </p>
        {onSkip && !isSummary && (
          <button type="button" onClick={onSkip} className="min-h-10 text-[11px] font-bold text-[#6e859e]">
            Nanti saja
          </button>
        )}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f6]">
        <div
          className="h-full rounded-full bg-[#0b5f86] transition-[width]"
          style={{ width: `${((isSummary ? steps.length : step) / steps.length) * 100}%` }}
        />
      </div>

      {isSummary ? (
        <div className="mt-5 space-y-4">
          <h2 className="text-base font-bold text-[#1b2a3a]">
            {editing
              ? `Milik saya bersih jadi ${formatIdr(netWorth)}`
              : `Modal usaha Anda saat ini ${formatIdr(netWorth)}`}
          </h2>
          <p className="text-xs leading-relaxed text-[#6e859e]">
            Angka ini adalah semua yang usaha punya ({formatIdr(ownedTotal)}) dikurangi yang masih harus dibayar (
            {formatIdr(payableTotal)}).
            {netWorth < 0
              ? " Utangnya lebih besar dari yang dipunya, dan itu tidak apa-apa — sekarang jadi terlihat dan bisa dikejar."
              : ""}
          </p>

          {editing && answers && netWorth !== answers.netWorthIdr && (
            <p className="text-xs font-semibold leading-relaxed text-[#1b2a3a]">
              Sebelumnya {formatIdr(answers.netWorthIdr)}, sekarang {formatIdr(netWorth)}.
            </p>
          )}

          {editing && (
            <div className="rounded-xl border border-[#f0d49a] bg-[#fdf7ec] p-3 text-[11px] leading-relaxed text-[#8a6320]">
              Angka ini dipakai sejak {answers?.startDate}.
              {monthsRecorded > 0
                ? ` Kalau diubah, untung ${monthsRecorded} bulan yang sudah lewat ikut dihitung ulang — termasuk berkas yang sudah Anda unduh untuk bank.`
                : " Kalau diubah, untung bulan-bulan yang sudah lewat ikut dihitung ulang."}{" "}
              Catatan harian Anda tidak ada yang hilang.
            </div>
          )}
          <label className={labelClass}>
            Mulai mencatat sejak
            <input
              type="date"
              max={jakartaDate()}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <span className={helperClass}>
              {editing
                ? "Boleh dimundurkan kalau ternyata Anda mulai lebih awal. Tidak bisa dimajukan, karena catatan harian Anda sesudah tanggal ini sudah ada."
                : "Catatan sebelum tanggal ini tidak bisa dimasukkan lagi, karena sudah terhitung di angka di atas."}
            </span>
          </label>

          {editing && (
            <label className={labelClass}>
              Kenapa diperbarui?
              <textarea
                required
                minLength={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Contoh: uang di laci waktu itu salah hitung"
                className={`${inputClass} mt-1.5 min-h-20 py-2`}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-[#f3c6cf] bg-[#fdf1f3] p-3 text-xs font-semibold text-[#b4304a]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(steps.length - 1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
            >
              <ArrowLeft size={14} /> Kembali
            </button>
            <button
              type="button"
              disabled={busy || (editing && reason.trim().length < 3)}
              onClick={() => void submit()}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
              {busy ? "Menyimpan..." : editing ? "Ya, perbarui" : "Mulai"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#1b2a3a]">{steps[step].title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">{steps[step].helper}</p>
          </div>
          {steps[step].body}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
              >
                <ArrowLeft size={14} /> Kembali
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white"
            >
              Lanjut <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
