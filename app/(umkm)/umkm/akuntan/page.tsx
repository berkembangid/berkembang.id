"use client";

/**
 * Mode Akuntan (spek Bagian 9).
 *
 * Wajah kedua dari mesin yang sama. Mode Warung menjawab "usaha saya untung
 * berapa"; layar ini menjawab "tunjukkan pembukuannya" — untuk pendamping,
 * koperasi, atau petugas bank yang perlu menelusuri satu angka sampai ke
 * catatan hariannya.
 *
 * Dua aturan yang membentuk layar ini:
 *
 *   1. BACA SAJA. Tidak ada satu tombol pun yang mengubah angka. Yang
 *      membetulkan catatan tetap Mode Warung, dalam bahasa pemiliknya, supaya
 *      tidak pernah ada dua pintu masuk ke pembukuan yang sama.
 *   2. ISTILAH AKUNTANSI BOLEH DI SINI, dan hanya di sini. Debit, kredit, dan
 *      buku besar adalah kosakata pembacanya. `lint:terms` tetap melarang
 *      bahasa penilaian kredit di mana pun, termasuk di layar ini.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenCheck,
  Download,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  Scale,
} from "lucide-react";
import Link from "next/link";
import {
  AccountingClientError,
  getGeneralLedgerClient,
  getJournalClient,
  getTrialBalanceClient,
  journalExportUrl,
} from "@/modules/accounting/accounting-client";
import { chartOfAccounts } from "@/modules/accounting/coa";
import type {
  GeneralLedgerView,
  JournalEntryView,
  TrialBalanceRow,
} from "@/modules/accounting/reports";
import { createDocumentSignedUrl } from "@/modules/documents/document-client";
import { listTransactionAttachments } from "@/modules/documents/evidence-client";
import { DashboardPage, DashboardPanel, EmptyState, PageHeader, PanelHeader } from "@/components/dashboard";
import { jakartaDate } from "@/modules/ledger/capture-schema";

type View = "journal" | "ledger" | "trial";

const viewLabels: Array<{ id: View; label: string }> = [
  { id: "journal", label: "Jurnal Umum" },
  { id: "ledger", label: "Buku Besar" },
  { id: "trial", label: "Neraca Saldo" },
];

/** Sumber jurnal, dalam kata yang dipakai basis data, apa adanya. */
const sourceLabels: Record<string, string> = {
  TRANSACTION: "Transaksi",
  OPENING: "Saldo awal",
  DEPRECIATION: "Penyusutan",
  INVENTORY: "Koreksi persediaan",
  REVERSAL: "Pembalikan",
  ASSET_DISPOSAL: "Pelepasan aset",
  ADJUSTMENT: "Penyesuaian",
};

function idr(value: number) {
  return value === 0 ? "—" : Math.abs(value).toLocaleString("id-ID");
}

function signedIdr(value: number) {
  return `${value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("id-ID")}`;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export default function AkuntanPage() {
  const today = jakartaDate();
  const [view, setView] = useState<View>("journal");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);

  return (
    <DashboardPage>
      <PageHeader
        title="Mode Akuntan"
        description="Pembukuan lengkap di balik angka yang dilihat pemilik usaha. Hanya untuk dibaca — perbaikan catatan tetap dilakukan dari halaman Laporan."
        icon={BookOpenCheck}
        actions={
          <>
            <Link
              href="/umkm/laporan"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-3 text-xs font-bold text-[#4a6280]"
            >
              <ArrowLeft size={14} /> Kembali ke Laporan
            </Link>
            <a
              href={journalExportUrl(from, to)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#a9ebd0] bg-[#edfbf5] px-3 text-xs font-bold text-[#0b7a55]"
            >
              <Download size={14} /> Unduh jurnal (CSV)
            </a>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#e3e9f0] bg-white p-4">
        <label className="text-[11px] font-bold text-[#4a6280]">
          Dari tanggal
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1.5 block min-h-10 rounded-xl border border-[#d8dcff] px-3 text-sm font-medium outline-none focus:border-[#0b5f86]"
          />
        </label>
        <label className="text-[11px] font-bold text-[#4a6280]">
          Sampai tanggal
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1.5 block min-h-10 rounded-xl border border-[#d8dcff] px-3 text-sm font-medium outline-none focus:border-[#0b5f86]"
          />
        </label>
        {/*
          Keterangan kolom CSV turun ke barisnya sendiri. Sebelumnya ia didorong
          `ml-auto` ke kanan dan berdesakan dengan kedua kolom tanggal begitu
          layarnya menyempit.
        */}
        <p className="basis-full text-[11px] leading-relaxed text-[#6e859e] xl:ml-auto xl:max-w-md xl:basis-auto">
          Berkas CSV memakai kolom <code className="break-words">kode_akun, nama_akun, debit, kredit, tanggal, sumber, memo</code>{" "}
          — mengikuti rentang tanggal di atas.
        </p>
      </div>

      <nav aria-label="Tampilan pembukuan" className="flex gap-1 rounded-xl border border-[#e3e9f0] bg-white p-1">
        {viewLabels.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-bold transition-colors ${
              view === item.id ? "bg-[#eef8fd] text-[#0b5f86] shadow-sm" : "text-[#6e859e] hover:bg-[#f3f6f9]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === "journal" && <JournalPanel from={from} to={to} />}
      {view === "ledger" && <LedgerPanel from={from} to={to} />}
      {view === "trial" && <TrialBalancePanel asOf={to} />}
    </DashboardPage>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-[#6e859e]">
      <LoaderCircle className="animate-spin" size={18} /> {label}
    </div>
  );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-2xl border border-[#f3c6cf] bg-[#fdf1f3] p-4 text-xs font-semibold text-[#b4304a]"
    >
      <AlertCircle size={16} /> {message}
      <button onClick={onRetry} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-bold">
        <RefreshCcw size={13} /> Coba lagi
      </button>
    </div>
  );
}

function useAsync<T>(load: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await load());
    } catch (cause) {
      setError(cause instanceof AccountingClientError ? cause.message : fallback);
    } finally {
      setLoading(false);
    }
  }, [load, fallback]);

  useEffect(() => {
    const timer = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(timer);
  }, [run]);

  return { data, loading, error, reload: run };
}

function JournalPanel({ from, to }: { from: string; to: string }) {
  const load = useCallback(() => getJournalClient({ from, to, limit: 100 }), [from, to]);
  const { data, loading, error, reload } = useAsync(load, "Jurnal belum dapat dimuat.");

  if (loading) return <Loading label="Memuat jurnal umum..." />;
  if (error || !data) return <Failure message={error || "Jurnal belum dapat dimuat."} onRetry={reload} />;
  if (data.entries.length === 0) {
    return (
      <EmptyState
        icon={BookOpenCheck}
        title="Belum ada jurnal pada rentang ini"
        description="Ubah rentang tanggal di atas, atau catat transaksi lebih dulu dari halaman Catat."
      />
    );
  }

  return (
    <DashboardPanel>
      <PanelHeader
        title="Jurnal Umum"
        description={`${data.entries.length} entri${data.hasMore ? ", masih ada lanjutannya — persempit tanggalnya" : ""}.`}
      />
      <div className="px-4 pb-4 md:px-5">
        {/*
          Judul kolom ditulis SEKALI di sini, bukan diulang pada setiap entri.
          Tiga entri berarti tiga kali "Akun / Debit / Kredit", dan itulah yang
          membuat halaman ini terasa berantakan padahal isinya sedikit.
        */}
        <div className="flex items-baseline gap-3 border-b border-[#e3e9f0] py-2 text-[10px] font-bold uppercase tracking-wide text-[#6e859e]">
          <span className="min-w-0 flex-1">Akun</span>
          <span className="w-24 shrink-0 text-right md:w-32">Debit</span>
          <span className="w-24 shrink-0 text-right md:w-32">Kredit</span>
        </div>
        <ul className="divide-y divide-[#eef2f6]">
          {data.entries.map((entry) => (
            <JournalEntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>
    </DashboardPanel>
  );
}

/**
 * Klip bukti pada satu baris jurnal.
 *
 * Inilah gunanya seluruh rak bukti bagi orang yang memeriksa pembukuan:
 * dari satu baris jurnal, bukti fisiknya bisa dibuka dalam satu ketukan tanpa
 * meminta apa pun kepada pemilik usaha. Tautannya bertanda tangan dan hanya
 * berlaku semenit, jadi ia diminta saat diketuk -- bukan diperoleh di muka
 * untuk seluruh halaman.
 */
function EvidenceClip({ transactionId, count }: { transactionId: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          const attachments = await listTransactionAttachments(transactionId);
          const first = attachments[0];
          if (!first) return;
          const { signedUrl } = await createDocumentSignedUrl(first.documentId);
          window.open(signedUrl, "_blank", "noopener,noreferrer");
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
      aria-label={`Lihat bukti (${count})`}
      title={failed ? "Bukti belum bisa dibuka. Coba lagi." : `Lihat bukti (${count})`}
      className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
        failed ? "text-[#8a6412] hover:bg-[#fdf8ee]" : "text-[#0b5f86] hover:bg-[#eef8fd]"
      } disabled:opacity-40`}
    >
      <Paperclip size={11} />
      {count > 1 ? count : ""}
    </button>
  );
}

function JournalEntryRow({ entry }: { entry: JournalEntryView }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#1b2a3a]">
          {entry.entryDate} · {sourceLabels[entry.source] ?? entry.source}
          {entry.attachmentCount > 0 && entry.sourceId && (
            <EvidenceClip transactionId={entry.sourceId} count={entry.attachmentCount} />
          )}
        </p>
        <p className="text-xs font-bold tabular-nums text-[#1b2a3a]">{idr(entry.totalIdr)}</p>
      </div>
      {(entry.memo || entry.reason) && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6e859e]">{entry.reason ?? entry.memo}</p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {entry.lines.map((line, index) => (
          <div
            key={`${entry.id}-${line.accountCode}-${index}`}
            className="flex items-baseline gap-3 text-[11px] text-[#1b2a3a]"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-[10px] text-[#6e859e]">{line.accountCode}</span> {line.accountName}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums md:w-32">{idr(line.debitIdr)}</span>
            <span className="w-24 shrink-0 text-right tabular-nums md:w-32">{idr(line.creditIdr)}</span>
          </div>
        ))}
      </div>
    </li>
  );
}

function LedgerPanel({ from, to }: { from: string; to: string }) {
  const [accountCode, setAccountCode] = useState("1100");
  const load = useCallback(() => getGeneralLedgerClient(accountCode, from, to), [accountCode, from, to]);
  const { data, loading, error, reload } = useAsync(load, "Buku besar belum dapat dimuat.");

  return (
    <DashboardPanel>
      <PanelHeader title="Buku Besar" description="Mutasi satu akun beserta saldo berjalannya." />
      <div className="px-4 py-4 md:px-5">
        <label className="block max-w-md text-[11px] font-bold text-[#4a6280]">
          Akun
          <select
            value={accountCode}
            onChange={(event) => setAccountCode(event.target.value)}
            className="mt-1.5 block min-h-10 w-full rounded-xl border border-[#d8dcff] px-3 text-sm font-medium outline-none focus:border-[#0b5f86]"
          >
            {chartOfAccounts.map((account) => (
              <option key={account.code} value={account.code}>
                {account.code} — {account.name}
              </option>
            ))}
          </select>
        </label>
        {loading && <Loading label="Memuat buku besar..." />}
        {!loading && (error || !data) && (
          <Failure message={error || "Buku besar belum dapat dimuat."} onRetry={reload} />
        )}
        {!loading && data && <LedgerTable ledger={data} />}
      </div>
    </DashboardPanel>
  );
}

function LedgerTable({ ledger }: { ledger: GeneralLedgerView }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-[11px]">
        <caption className="sr-only">
          Buku besar akun {ledger.accountCode} {ledger.accountName}
        </caption>
        <thead>
          <tr className="border-b border-[#e3e9f0] text-left text-[#6e859e]">
            <th className="py-1.5 font-semibold">Tanggal</th>
            <th className="py-1.5 font-semibold">Sumber</th>
            <th className="py-1.5 font-semibold">Memo</th>
            <th className="py-1.5 text-right font-semibold">Debit</th>
            <th className="py-1.5 text-right font-semibold">Kredit</th>
            <th className="py-1.5 text-right font-semibold">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef2f6]">
          <tr className="text-[#6e859e]">
            <td className="py-1.5" colSpan={5}>
              Saldo awal periode
            </td>
            <td className="py-1.5 text-right font-bold tabular-nums">{signedIdr(ledger.openingBalanceIdr)}</td>
          </tr>
          {ledger.rows.map((row, index) => (
            <tr key={`${row.entryId}-${index}`} className="text-[#1b2a3a]">
              <td className="py-1.5 whitespace-nowrap">{row.entryDate}</td>
              <td className="py-1.5 whitespace-nowrap">{sourceLabels[row.source] ?? row.source}</td>
              <td className="py-1.5">{row.memo ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{idr(row.debitIdr)}</td>
              <td className="py-1.5 text-right tabular-nums">{idr(row.creditIdr)}</td>
              <td className="py-1.5 text-right tabular-nums">{signedIdr(row.balanceIdr)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#e3e9f0] font-bold text-[#1b2a3a]">
            <td className="py-1.5" colSpan={3}>
              Jumlah periode
            </td>
            <td className="py-1.5 text-right tabular-nums">{idr(ledger.totalDebitIdr)}</td>
            <td className="py-1.5 text-right tabular-nums">{idr(ledger.totalCreditIdr)}</td>
            <td className="py-1.5 text-right tabular-nums">{signedIdr(ledger.closingBalanceIdr)}</td>
          </tr>
        </tfoot>
      </table>
      {ledger.truncated && (
        <p className="mt-2 text-[11px] font-semibold text-[#b4304a]">
          Barisnya terlalu banyak untuk satu halaman. Persempit rentang tanggalnya.
        </p>
      )}
    </div>
  );
}

function TrialBalancePanel({ asOf }: { asOf: string }) {
  const load = useCallback(() => getTrialBalanceClient(asOf), [asOf]);
  const { data, loading, error, reload } = useAsync(load, "Neraca saldo belum dapat dimuat.");
  const rows = useMemo<TrialBalanceRow[]>(
    () => (data?.rows ?? []).filter((row) => row.totalDebitIdr !== 0 || row.totalCreditIdr !== 0),
    [data],
  );

  if (loading) return <Loading label="Menghitung neraca saldo..." />;
  if (error || !data) return <Failure message={error || "Neraca saldo belum dapat dimuat."} onRetry={reload} />;

  return (
    <DashboardPanel>
      <PanelHeader title="Neraca Saldo" description={`Posisi seluruh akun per ${data.asOf}.`} />
      <div className="px-4 py-4 md:px-5">
        <div
          className={`mb-3 flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${
            data.balanced
              ? "border-[#a9ebd0] bg-[#edfbf5] text-[#0b7a55]"
              : "border-[#f3c6cf] bg-[#fdf1f3] text-[#b4304a]"
          }`}
        >
          <Scale size={15} />
          {data.balanced
            ? "Seimbang: jumlah debit sama dengan jumlah kredit."
            : "Tidak seimbang. Hubungi pendamping sebelum berkas ini dipakai."}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[11px]">
            <thead>
              <tr className="border-b border-[#e3e9f0] text-left text-[#6e859e]">
                <th className="py-1.5 font-semibold">Akun</th>
                <th className="py-1.5 text-right font-semibold">Debit</th>
                <th className="py-1.5 text-right font-semibold">Kredit</th>
                <th className="py-1.5 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f6]">
              {rows.map((row) => (
                <tr key={row.accountCode} className="text-[#1b2a3a]">
                  <td className="py-1.5">
                    <span className="font-mono text-[10px] text-[#6e859e]">{row.accountCode}</span> {row.accountName}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{idr(row.totalDebitIdr)}</td>
                  <td className="py-1.5 text-right tabular-nums">{idr(row.totalCreditIdr)}</td>
                  <td className="py-1.5 text-right tabular-nums">{signedIdr(row.balanceIdr)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#e3e9f0] font-bold text-[#1b2a3a]">
                <td className="py-1.5">Jumlah</td>
                <td className="py-1.5 text-right tabular-nums">{idr(data.totalDebitIdr)}</td>
                <td className="py-1.5 text-right tabular-nums">{idr(data.totalCreditIdr)}</td>
                <td className="py-1.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </DashboardPanel>
  );
}
