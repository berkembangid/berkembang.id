"use client";

/**
 * Tab "Untuk Bank".
 *
 * Yang dihasilkan tab ini adalah bukti catatan usaha, bukan penilaian atas
 * usaha. BERKEMBANG.ID menyiapkan pemilik usaha untuk dinilai; yang menilai
 * tetap bank, koperasi, atau program yang menerima berkasnya. Kalimat itu
 * muncul di layar, bukan hanya di dokumen.
 *
 * Sebelum tombol unduh, tab ini menjawab tiga pertanyaan yang sebelumnya
 * dibiarkan menggantung:
 *   1. Apakah berkas saya sudah layak dikirim?  -> daftar kesiapan
 *   2. Periode mana yang masuk akal saya pilih? -> dibatasi jumlah bulan nyata
 *   3. Apa yang akan orang lain lihat?          -> pratinjau angka utama
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  Download,
  FileText,
  LoaderCircle,
  Scale,
  Share2,
} from "lucide-react";
import {
  AccountingClientError,
  getBalanceSheetClient,
  getInventoryCountClient,
  getOpeningBalanceClient,
  getWarungReportClient,
} from "@/modules/accounting/accounting-client";
import type { BalanceSheetView } from "@/modules/accounting/balance-sheet";
import type { WarungReportView } from "@/modules/accounting/reports";
import { formatIdr, monthLabel, previousMonth } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

type ReportPeriod = 3 | 6 | 12;
const periods: Array<{ months: ReportPeriod; label: string }> = [
  { months: 3, label: "3 bulan" },
  { months: 6, label: "6 bulan" },
  { months: 12, label: "12 bulan" },
];

type Readiness = {
  hasOpeningBalance: boolean;
  monthsRecorded: number;
  needsReclassCount: number;
  stockCounted: boolean;
  balanced: boolean;
};

export function BankReportCard({ onOpenCondition }: { onOpenCondition?: () => void }) {
  const [months, setMonths] = useState<ReportPeriod>(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ fileName: string; file: File } | null>(null);

  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [warung, setWarung] = useState<WarungReportView | null>(null);
  const [sheet, setSheet] = useState<BalanceSheetView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const month = jakartaDate().slice(0, 7);
      const [opening, report, balance, stock] = await Promise.all([
        getOpeningBalanceClient(),
        getWarungReportClient(month),
        getBalanceSheetClient(jakartaDate()),
        getInventoryCountClient(previousMonth(month)),
      ]);
      setWarung(report);
      setSheet(balance.current);
      setReadiness({
        hasOpeningBalance: Boolean(opening.openingBalance),
        monthsRecorded: report.series.filter((row) => row.daysRecorded > 0).length,
        needsReclassCount: report.needsReclassCount,
        stockCounted: Boolean(stock.inventoryCount.count),
        balanced: balance.current.balanced,
      });
    } catch (cause) {
      setError(cause instanceof AccountingClientError ? cause.message : "Kesiapan berkas belum dapat dibaca.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const buildReport = async () => {
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const response = await fetch("/api/v1/reports/financial-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, includeIndicators: true }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new AccountingClientError(
          "REPORT_FAILED",
          payload?.error?.message ?? "Laporan belum bisa dibuat.",
          false,
        );
      }

      const blob = await response.blob();
      const fileName =
        response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "laporan-keuangan.pdf";
      const file = new File([blob], fileName, { type: "application/pdf" });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);

      setDone({ fileName, file });
    } catch (cause) {
      setError(cause instanceof AccountingClientError ? cause.message : "Laporan belum bisa dibuat.");
    } finally {
      setBusy(false);
    }
  };

  const shareReport = async () => {
    if (!done) return;
    // Berbagi berkas langsung hanya tersedia di sebagian peramban ponsel.
    if (navigator.canShare?.({ files: [done.file] })) {
      try {
        await navigator.share({ files: [done.file], title: done.fileName });
        return;
      } catch {
        // Pemilik membatalkan; berkasnya tetap ada di perangkat.
        return;
      }
    }
    setError(
      "Peramban ini belum bisa mengirim berkas langsung. Lampirkan berkas yang sudah terunduh dari folder Unduhan.",
    );
  };

  const monthsAvailable = readiness?.monthsRecorded ?? 0;
  const periodTooLong = monthsAvailable > 0 && months > monthsAvailable;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_30px_rgba(27,42,58,.04)]">
        <h3 className="text-sm font-bold text-[#1b2a3a]">Berkas catatan usaha</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">
          Satu berkas PDF berisi kondisi usaha, untung rugi, aliran uang, dan catatan penjelasnya, disusun
          mengikuti format SAK EMKM. Bisa Anda serahkan ke bank, koperasi, atau program pemerintah yang meminta
          bukti pembukuan.
        </p>
        <p className="mt-2 rounded-xl bg-[#f6f9fb] p-3 text-[11px] leading-relaxed text-[#4a627a]">
          Berkas ini memuat catatan Anda apa adanya. Kami tidak menilai usaha Anda dan tidak memutuskan apa pun
          soal pinjaman — yang menilai tetap lembaga yang menerima berkas ini.
        </p>
      </section>

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-[#6e859e]">
          <LoaderCircle className="animate-spin" size={18} /> Memeriksa kesiapan berkas...
        </div>
      ) : (
        readiness && (
          <ReadinessChecklist readiness={readiness} onOpenCondition={onOpenCondition} />
        )
      )}

      {warung && sheet && !loading && (
        <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
          <h3 className="text-sm font-bold text-[#1b2a3a]">Yang akan terbaca di berkas</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
            Angka bulan ini, supaya tidak ada kejutan setelah berkasnya terkirim.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <PreviewFigure label="Uang masuk dari jualan" value={warung.boxes.salesIdr} />
            <PreviewFigure label="Untung bersih" value={warung.boxes.netIncomeIdr} />
            <PreviewFigure label="Yang usaha punya" value={sheet.totalAssetsIdr} />
            <PreviewFigure label="Yang harus dibayar" value={sheet.totalLiabilitiesIdr} />
          </dl>
        </section>
      )}

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_30px_rgba(27,42,58,.04)]">
        <h3 className="text-sm font-bold text-[#1b2a3a]">Pilih rentang waktu</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
          {monthsAvailable > 0
            ? `Catatan Anda saat ini mencakup ${monthsAvailable} bulan.`
            : "Belum ada bulan yang tercatat."}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {periods.map((period) => (
            <button
              key={period.months}
              type="button"
              aria-pressed={months === period.months}
              onClick={() => setMonths(period.months)}
              className={`min-h-11 rounded-full border px-4 text-xs font-bold transition-colors ${
                months === period.months
                  ? "border-[#0b5f86] bg-[#0b5f86] text-white"
                  : "border-[#d5dfe9] bg-white text-[#1b2a3a]"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>

        {periodTooLong && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[#f0d49a] bg-[#fdf7ec] p-3 text-[11px] font-semibold leading-relaxed text-[#8a6320]">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            Catatan Anda baru {monthsAvailable} bulan, jadi {months - monthsAvailable} bulan pertama akan kosong.
            Pilih rentang yang lebih pendek supaya berkasnya terbaca padat.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-xl border border-[#f3c6cf] bg-[#fdf1f3] p-3 text-xs font-semibold text-[#b4304a]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void buildReport()}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-60 md:w-auto"
        >
          {busy ? <LoaderCircle className="animate-spin" size={15} /> : <FileText size={15} />}
          {busy ? "Menyusun berkas..." : "Buat berkas PDF"}
        </button>

        {done && (
          <div className="mt-4 rounded-xl border border-[#a9ebd0] bg-[#edfbf5] p-3">
            <p role="status" className="flex items-start gap-1.5 text-xs font-bold text-[#0b7a55]">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> Tersimpan di perangkat Anda
            </p>
            <p className="mt-1 break-all text-[11px] text-[#3f6b58]">{done.fileName}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#3f6b58]">
              Cari di folder Unduhan kalau perlu mengirimnya lagi nanti.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void shareReport()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0b7a55] px-4 text-xs font-bold text-white"
              >
                <Share2 size={14} /> Kirim berkas
              </button>
              <button
                type="button"
                onClick={() => void buildReport()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#a9ebd0] bg-white px-4 text-xs font-bold text-[#0b7a55]"
              >
                <Download size={14} /> Unduh ulang
              </button>
            </div>
          </div>
        )}
      </section>

      {/*
        Pintu masuk Mode Akuntan.
        
        Sebelumnya ini satu kalimat kecil di dasar tab, dan praktis tidak
        pernah ditemukan siapa pun. Sekarang ia kartu yang jelas bisa diketuk,
        tetapi tetap di sini -- bukan di menu samping -- karena pembacanya
        memang bukan pemilik warung. Menaruh layar berbahasa akuntansi di
        navigasi harian pemilik akan mengajarinya bahwa ada bagian aplikasi
        yang tidak ia mengerti, padahal seluruh produk ini dibangun supaya
        tidak begitu.
      */}
      <Link
        href="/umkm/akuntan"
        className="flex items-start gap-3 rounded-2xl border border-[#e3e9f0] bg-white p-4 text-left shadow-[0_8px_28px_rgba(27,42,58,.04)] transition-colors hover:border-[#addcf4] hover:bg-[#f8fcfe]"
      >
        <BookOpenCheck size={18} className="mt-0.5 shrink-0 text-[#0b5f86]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1b2a3a]">Perincian pembukuan</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
            Untuk pendamping, koperasi, atau petugas bank yang ingin menelusuri satu angka sampai ke catatan
            hariannya: jurnal, buku besar, dan neraca saldo. Hanya bisa dibaca — tidak ada yang dapat diubah
            dari sana.
          </p>
        </div>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-[#9fb0c2]" />
      </Link>
    </div>
  );
}

function PreviewFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#f6f9fb] p-3">
      <dt className="text-[10px] font-medium text-[#6e859e]">{label}</dt>
      <dd className="mt-1 text-sm font-bold tabular-nums text-[#1b2a3a]">
        {value < 0 ? "−" : ""}
        {formatIdr(value)}
      </dd>
    </div>
  );
}

/**
 * Daftar kesiapan. Setiap baris menjelaskan akibatnya kalau dilewati, bukan
 * sekadar menandai kurang lengkap, supaya pemilik bisa memutuskan sendiri
 * apakah berkasnya sudah cukup untuk keperluannya.
 */
function ReadinessChecklist({
  readiness,
  onOpenCondition,
}: {
  readiness: Readiness;
  onOpenCondition?: () => void;
}) {
  const lastMonth = previousMonth(jakartaDate().slice(0, 7));
  const items = [
    {
      key: "opening",
      done: readiness.hasOpeningBalance,
      title: "Kondisi awal usaha",
      whenMissing:
        "Belum diisi. Tanpa ini halaman kondisi usaha di berkas akan kosong, dan pembacanya tidak tahu titik mulai Anda.",
      whenDone: "Sudah diisi, jadi kondisi usaha bisa disusun.",
      action: onOpenCondition ? { label: "Isi sekarang", run: onOpenCondition } : undefined,
    },
    {
      key: "months",
      done: readiness.monthsRecorded >= 3,
      title: "Lama pencatatan",
      whenMissing: `Baru ${readiness.monthsRecorded} bulan tercatat. Lembaga keuangan umumnya membaca tiga bulan atau lebih.`,
      whenDone: `${readiness.monthsRecorded} bulan tercatat.`,
    },
    {
      key: "reclass",
      done: readiness.needsReclassCount === 0,
      title: "Kategori catatan",
      whenMissing: `${readiness.needsReclassCount} catatan lama belum dicek kategorinya, jadi angkanya bisa masuk ke pos yang salah.`,
      whenDone: "Semua catatan sudah punya kategori.",
    },
    {
      key: "stock",
      done: readiness.stockCounted,
      title: `Hitung stok ${monthLabel(lastMonth)}`,
      whenMissing: "Belum dihitung. Nilai stok di berkas memakai hitungan terakhir yang ada.",
      whenDone: "Sudah dihitung.",
    },
  ];

  const pending = items.filter((item) => !item.done);

  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1b2a3a]">Kesiapan berkas</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
            {pending.length === 0
              ? "Semua bagian sudah lengkap. Berkasnya siap dikirim."
              : `${pending.length} hal masih bisa dilengkapi. Berkas tetap bisa dibuat sekarang.`}
          </p>
        </div>
        {readiness.balanced ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#edfbf5] px-2 py-1 text-[10px] font-bold text-[#0b7a55]">
            <Scale size={12} /> Angka seimbang
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fdf1f3] px-2 py-1 text-[10px] font-bold text-[#b4304a]">
            <Scale size={12} /> Perlu diperiksa
          </span>
        )}
      </div>

      <ul className="mt-4 divide-y divide-[#eef2f6]">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-3">
            {item.done ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#0b7a55]" />
            ) : (
              <CircleAlert size={16} className="mt-0.5 shrink-0 text-[#c98a1e]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#1b2a3a]">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#6e859e]">
                {item.done ? item.whenDone : item.whenMissing}
              </p>
            </div>
            {!item.done && item.action && (
              <button
                type="button"
                onClick={item.action.run}
                className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-[#0b5f86]"
              >
                {item.action.label} <ArrowRight size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
