"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Camera, Download, FileText, History, LoaderCircle,
  Lock, Paperclip, Pencil, Receipt, RefreshCcw, Search, SlidersHorizontal, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";
import {
  ComparisonBarChart, DashboardPanel, MetricCard, PanelHeader, StatusBadge, type ComparisonDatum,
} from "@/components/dashboard";
import { EvidencePrompt } from "@/components/warung/EvidencePrompt";
import { formatTanggal } from "@/lib/format";
import { notifyInfo } from "@/lib/notify";
import { activeFilterCount, defaultCashBookFilter, filterCashBook, type CashBookFilter } from "@/modules/ledger/cash-book-filter";
import { getTransactionChangesClient } from "@/modules/ledger/ledger-client";
import type { LedgerReportView, LedgerTransactionView, TransactionChangeView } from "@/modules/ledger/ledger-repository";
import { jakartaDate, paymentMethodLabels } from "@/modules/ledger/ledger-schema";

export type Preset = "today" | "week" | "month" | "custom";
export type LedgerRangeState = { startDate: string; endDate: string };

/** Baris yang tampil sekaligus; sisanya lewat « Tampilkan lagi ». */
const PAGE_SIZE = 30;

export function formatIdr(value: number) { return `Rp${Math.abs(value).toLocaleString("id-ID")}`; }

export function dateRange(preset: Exclude<Preset, "custom">): LedgerRangeState {
  const today = jakartaDate();
  const current = new Date(`${today}T12:00:00+07:00`);
  if (preset === "today") return { startDate: today, endDate: today };
  if (preset === "week") {
    const start = new Date(current);
    start.setDate(current.getDate() - 6);
    return { startDate: start.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), endDate: today };
  }
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

function cashFlowData(transactions: LedgerTransactionView[]): ComparisonDatum[] {
  const daily = new Map<string, { income: number; expense: number }>();
  for (const transaction of transactions) {
    if (transaction.status === "cancelled") continue;
    const value = daily.get(transaction.transactionDate) ?? { income: 0, expense: 0 };
    value[transaction.transactionType] += transaction.amountIdr;
    daily.set(transaction.transactionDate, value);
  }
  return [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, value]) => ({
    label: formatTanggal(date, "dayMonth"),
    primary: value.income,
    secondary: value.expense,
  }));
}

function Distribution({ title, items }: { title: string; items: Array<{ code: string; label: string; amountIdr: number }> }) {
  const maximum = Math.max(...items.map((item) => item.amountIdr), 1);
  return (
    <DashboardPanel>
      <PanelHeader title={title} />
      <div className="p-4 md:p-5">
        {items.length === 0 ? <p className="text-xs text-umkm-subtle">Belum ada data.</p> : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.code}>
                <div className="flex justify-between gap-3 text-xs"><span className="font-semibold text-umkm-ink-soft">{item.label}</span><span className="font-bold tabular-nums text-umkm-ink">{formatIdr(item.amountIdr)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-umkm-line-soft" aria-hidden>
                  <div className="h-full rounded-full bg-umkm-sky" style={{ width: `${Math.max(4, Math.round((item.amountIdr / maximum) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardPanel>
  );
}

const actionLabels: Record<string, string> = { created: "Dicatat", updated: "Diubah", cancelled: "Dibatalkan", adjusted: "Disesuaikan" };

/** Riwayat perubahan satu transaksi -- isi dari lencana « Pernah diubah ». */
function ChangeHistory({ transactionId }: { transactionId: string }) {
  const [changes, setChanges] = useState<TransactionChangeView[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getTransactionChangesClient(transactionId)
      .then((value) => { if (active) setChanges(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [transactionId]);
  if (failed) return <p role="alert" className="text-xs text-umkm-danger">Riwayat belum dapat dimuat.</p>;
  if (!changes) return <p role="status" className="flex items-center gap-2 text-xs text-umkm-subtle"><LoaderCircle size={13} className="animate-spin" aria-hidden /> Memuat riwayat…</p>;
  if (changes.length === 0) return <p className="text-xs text-umkm-subtle">Belum ada perubahan tercatat.</p>;
  return (
    <ol className="space-y-2">
      {changes.map((change) => {
        const before = change.before;
        const after = change.after;
        const amountChanged = before?.amountIdr !== undefined && after?.amountIdr !== undefined && before.amountIdr !== after.amountIdr;
        const dateChanged = before?.date && after?.date && before.date !== after.date;
        return (
          <li key={change.id} className="rounded-xl bg-umkm-surface p-3 text-xs">
            <p className="font-bold text-umkm-ink">{actionLabels[change.action] ?? change.action} · <span className="font-normal text-umkm-subtle">{formatTanggal(change.createdAt, "long")}</span></p>
            {change.reason && <p className="mt-1 text-umkm-ink-soft">Alasan: {change.reason}</p>}
            {amountChanged && <p className="mt-1 text-umkm-subtle">Nominal {formatIdr(Number(before?.amountIdr))} → {formatIdr(Number(after?.amountIdr))}</p>}
            {dateChanged && <p className="mt-1 text-umkm-subtle">Tanggal {formatTanggal(before?.date)} → {formatTanggal(after?.date)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function TransactionRow({ transaction, locked, busy, onEdit, onCancel, onAttached }: {
  transaction: LedgerTransactionView;
  locked: boolean;
  busy: boolean;
  onEdit: (transaction: LedgerTransactionView) => void;
  onCancel: (transaction: LedgerTransactionView) => void;
  onAttached: () => void;
}) {
  const [panel, setPanel] = useState<"evidence" | "history" | null>(null);
  const income = transaction.transactionType === "income";
  const cancelled = transaction.status === "cancelled";
  const toggle = (next: "evidence" | "history") => setPanel((current) => (current === next ? null : next));

  // Tombol ubah tidak lagi dimatikan diam-diam pada hari yang sudah tutup
  // kas: pemilik yang menekannya diberi tahu sebabnya dan jalan keluarnya.
  const edit = () => {
    if (locked) {
      notifyInfo(`Kas ${formatTanggal(transaction.transactionDate, "long")} sudah ditutup`, {
        description: "Catatan pada hari yang sudah ditutup tidak bisa diubah. Kalau keliru, batalkan dengan alasan lalu catat ulang.",
      });
      return;
    }
    onEdit(transaction);
  };

  return (
    <article className={`rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)] ${cancelled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${income ? "bg-umkm-success-soft text-umkm-success" : "bg-umkm-surface-muted text-umkm-ink-soft"}`} aria-hidden>
            {income ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </span>
          <div className="min-w-0">
            <h3 className={`text-sm font-bold text-umkm-ink ${cancelled ? "line-through" : ""}`}>{transaction.description}</h3>
            <p className="mt-0.5 text-xs text-umkm-subtle">
              {formatTanggal(transaction.transactionDate)} · {transaction.categoryLabel} · {paymentMethodLabels[transaction.paymentMethod ?? "unknown"]}
              {transaction.counterparty ? ` · ${transaction.counterparty}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {locked && <StatusBadge tone="info"><Lock size={10} className="mr-0.5 inline" aria-hidden />Kas sudah ditutup</StatusBadge>}
              {transaction.attachmentCount > 0 && <StatusBadge tone="info"><Paperclip size={10} className="mr-0.5 inline" aria-hidden />{transaction.attachmentCount > 1 ? `${transaction.attachmentCount} bukti` : "Ada bukti"}</StatusBadge>}
              {cancelled && <StatusBadge tone="neutral">Dibatalkan</StatusBadge>}
            </div>
          </div>
        </div>
        <p className={`shrink-0 text-sm font-bold tabular-nums ${income ? "text-umkm-success" : "text-umkm-ink"}`}>
          {income ? "+" : "−"}{formatIdr(transaction.amountIdr)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-umkm-line-soft pt-2">
        {transaction.changeCount > 1 && (
          <button type="button" onClick={() => toggle("history")} aria-expanded={panel === "history"} className="mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-umkm-warning hover:bg-umkm-warning-soft">
            <History size={14} aria-hidden /> Pernah diubah
          </button>
        )}
        {!cancelled && (
          <>
            {income && (
              <Link href={`/umkm/nota/${transaction.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-umkm-success hover:bg-umkm-success-soft">
                <Receipt size={14} aria-hidden /> Nota
              </Link>
            )}
            <button type="button" onClick={() => toggle("evidence")} disabled={busy} aria-expanded={panel === "evidence"} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-umkm-brand hover:bg-umkm-brand-soft disabled:opacity-40">
              <Camera size={14} aria-hidden /> Bukti
            </button>
            <button type="button" onClick={edit} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-umkm-brand hover:bg-umkm-brand-soft disabled:opacity-40">
              <Pencil size={13} aria-hidden /> Ubah
            </button>
            <button type="button" onClick={() => onCancel(transaction)} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-umkm-danger hover:bg-umkm-danger-soft disabled:opacity-40">
              <XCircle size={14} aria-hidden /> Batalkan
            </button>
          </>
        )}
      </div>

      {panel === "evidence" && (
        <div className="mt-3">
          <EvidencePrompt
            targets={[{ targetType: "transaction", targetId: transaction.id }]}
            title="Tambah bukti"
            hint="Foto nota atau kuitansinya. Bukti yang menempel di catatan ini yang nanti membuatnya bisa dipercaya pihak lain."
            buttonLabel="Pilih foto"
            onAttached={() => { setPanel(null); onAttached(); }}
          />
        </div>
      )}
      {panel === "history" && <div className="mt-3"><ChangeHistory transactionId={transaction.id} /></div>}
    </article>
  );
}

const selectClass = "min-h-11 rounded-xl border border-umkm-line-strong bg-white px-3 text-xs font-semibold text-umkm-ink-soft";

export function CashBook({ report, loading, range, preset, busy, closedDates, onPreset, onRange, onReload, onCreate, onEdit, onCancel }: {
  report: LedgerReportView | null;
  loading: boolean;
  range: LedgerRangeState;
  preset: Preset;
  busy: boolean;
  closedDates: Set<string>;
  onPreset: (preset: Exclude<Preset, "custom">) => void;
  onRange: (range: LedgerRangeState) => void;
  onReload: () => void;
  onCreate: () => void;
  onEdit: (transaction: LedgerTransactionView) => void;
  onCancel: (transaction: LedgerTransactionView) => void;
}) {
  // ?cari= dari baris aktivitas di Beranda: catatan yang diketuk langsung
  // dicari, alih-alih dibuang ke daftar sebulan penuh.
  const [filter, setFilter] = useState<CashBookFilter>(() => {
    if (typeof window === "undefined") return defaultCashBookFilter;
    const query = new URLSearchParams(window.location.search).get("cari");
    return query ? { ...defaultCashBookFilter, query: query.slice(0, 80) } : defaultCashBookFilter;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const transactions = useMemo(() => report?.transactions ?? [], [report]);
  const filtered = useMemo(() => filterCashBook(transactions, filter), [transactions, filter]);
  const categories = useMemo(() => [...new Set(transactions.map((item) => item.categoryLabel))].sort(), [transactions]);
  const payments = useMemo(() => [...new Set(transactions.map((item) => item.paymentMethod ?? "unknown"))], [transactions]);
  const filterCount = activeFilterCount(filter);
  const update = (patch: Partial<CashBookFilter>) => { setFilter((current) => ({ ...current, ...patch })); setLimit(PAGE_SIZE); };
  const flow = report ? cashFlowData(report.transactions) : [];

  return (
    <>
      <section aria-label="Rentang tanggal" className="rounded-2xl border border-umkm-line bg-white p-3 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Pilihan cepat" className="flex gap-2 overflow-x-auto">
            {([{ id: "today", label: "Hari ini" }, { id: "week", label: "7 hari" }, { id: "month", label: "Bulan ini" }] as const).map((item) => (
              <button key={item.id} type="button" aria-pressed={preset === item.id} onClick={() => onPreset(item.id)} className={`min-h-11 whitespace-nowrap rounded-full px-4 text-xs font-bold ${preset === item.id ? "bg-umkm-brand text-white" : "bg-umkm-surface-muted text-umkm-muted"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="kas-dari">Dari tanggal</label>
            <input id="kas-dari" type="date" value={range.startDate} max={range.endDate} onChange={(e) => onRange({ ...range, startDate: e.target.value })} className="min-h-11 rounded-lg border border-umkm-line-strong px-2 text-xs" />
            <span className="text-xs text-umkm-subtle" aria-hidden>sampai</span>
            <label className="sr-only" htmlFor="kas-sampai">Sampai tanggal</label>
            <input id="kas-sampai" type="date" value={range.endDate} min={range.startDate} max={jakartaDate()} onChange={(e) => onRange({ ...range, endDate: e.target.value })} className="min-h-11 rounded-lg border border-umkm-line-strong px-2 text-xs" />
            <button type="button" onClick={onReload} aria-label="Muat ulang" className="grid size-11 place-items-center rounded-lg text-umkm-subtle hover:bg-umkm-surface-muted"><RefreshCcw size={15} aria-hidden /></button>
            <a href={`/api/v1/ledger/export?startDate=${range.startDate}&endDate=${range.endDate}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-umkm-success-line bg-umkm-success-soft px-3 text-xs font-bold text-umkm-success">
              <Download size={14} aria-hidden /> Unduh CSV
            </a>
          </div>
        </div>
      </section>

      {loading || !report ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-white p-12 text-sm text-umkm-subtle"><LoaderCircle className="animate-spin" size={18} aria-hidden /> Memuat buku kas...</div>
      ) : (
        <>
          <section aria-label="Ringkasan rentang" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Uang masuk" value={formatIdr(report.summary.incomeIdr)} helper="Transaksi yang sudah dikonfirmasi" icon={ArrowDownLeft} tone="success" />
            <MetricCard label="Uang keluar" value={formatIdr(report.summary.expenseIdr)} helper="Belanja dan biaya usaha" icon={ArrowUpRight} tone="neutral" />
            <MetricCard label="Selisih kas" value={`${report.summary.netIdr < 0 ? "−" : ""}${formatIdr(report.summary.netIdr)}`} helper={report.summary.netIdr >= 0 ? "Kas masuk lebih besar dari kas keluar" : "Kas keluar lebih besar dari kas masuk"} icon={BarChart3} tone={report.summary.netIdr >= 0 ? "brand" : "attention"} />
            <MetricCard label="Hari aktif" value={`${report.summary.activityDays} hari`} helper={`${report.summary.transactionCount} transaksi aktif`} icon={FileText} tone="brand" />
          </section>

          {flow.length >= 2 && (
            <DashboardPanel>
              <PanelHeader title="Uang masuk dan keluar per hari" description="Perbandingan uang masuk dan uang keluar pada tujuh hari aktif terakhir." />
              <div className="p-5"><ComparisonBarChart data={flow} primaryLabel="Uang masuk" secondaryLabel="Uang keluar" formatValue={formatIdr} /></div>
            </DashboardPanel>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <Distribution title="Nilai transaksi per kategori" items={report.categoryDistribution} />
            <Distribution title="Cara pembayaran" items={report.paymentDistribution} />
          </section>

          <section aria-labelledby="riwayat-transaksi" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="riwayat-transaksi" className="text-sm font-bold text-umkm-ink">Riwayat transaksi</h2>
                <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">Transaksi dibatalkan tetap tersimpan; tampilkan lewat saringan.</p>
              </div>
              <span className="text-xs font-bold text-umkm-subtle" aria-live="polite">{filtered.length} dari {transactions.length} catatan</span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-umkm-subtle" />
                <label htmlFor="kas-cari" className="sr-only">Cari catatan</label>
                <input id="kas-cari" type="search" value={filter.query} onChange={(e) => update({ query: e.target.value })} placeholder="Cari keterangan, pelanggan, atau nominal" className="min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white pl-9 pr-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand" />
              </div>
              <button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} aria-controls="kas-saringan" className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${filterCount > (filter.query ? 1 : 0) ? "border-umkm-brand bg-umkm-brand-soft text-umkm-brand" : "border-umkm-line-strong bg-white text-umkm-muted"}`}>
                <SlidersHorizontal size={14} aria-hidden /> Saring{filterCount > (filter.query ? 1 : 0) ? ` (${filterCount - (filter.query ? 1 : 0)})` : ""}
              </button>
            </div>

            {showFilters && (
              <div id="kas-saringan" className="grid gap-2 rounded-2xl border border-umkm-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-bold text-umkm-muted">Jenis
                  <select value={filter.direction} onChange={(e) => update({ direction: e.target.value as CashBookFilter["direction"] })} className={`mt-1 block w-full ${selectClass}`}>
                    <option value="all">Semua</option><option value="income">Uang masuk</option><option value="expense">Uang keluar</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-umkm-muted">Kategori
                  <select value={filter.category} onChange={(e) => update({ category: e.target.value })} className={`mt-1 block w-full ${selectClass}`}>
                    <option value="all">Semua kategori</option>
                    {categories.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-umkm-muted">Pembayaran
                  <select value={filter.payment} onChange={(e) => update({ payment: e.target.value })} className={`mt-1 block w-full ${selectClass}`}>
                    <option value="all">Semua cara</option>
                    {payments.map((code) => <option key={code} value={code}>{paymentMethodLabels[code] ?? code}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-umkm-muted">Status
                  <select value={filter.status} onChange={(e) => update({ status: e.target.value as CashBookFilter["status"] })} className={`mt-1 block w-full ${selectClass}`}>
                    <option value="active">Aktif</option><option value="cancelled">Dibatalkan</option><option value="all">Semua</option>
                  </select>
                </label>
                {filterCount > 0 && (
                  <button type="button" onClick={() => update(defaultCashBookFilter)} className="min-h-11 text-left text-xs font-bold text-umkm-brand sm:col-span-2 lg:col-span-4">Hapus semua saringan</button>
                )}
              </div>
            )}

            {transactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-umkm-line-strong bg-white p-10 text-center">
                <Receipt className="mx-auto text-umkm-faint" size={30} aria-hidden />
                <p className="mt-2 text-sm font-bold text-umkm-ink">Belum ada transaksi di rentang ini</p>
                <button type="button" onClick={onCreate} className="mt-3 min-h-11 text-xs font-bold text-umkm-brand">Catat transaksi</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-umkm-line-strong bg-white p-8 text-center">
                <p className="text-sm font-bold text-umkm-ink">Tidak ada catatan yang cocok</p>
                <button type="button" onClick={() => update(defaultCashBookFilter)} className="mt-2 min-h-11 text-xs font-bold text-umkm-brand">Hapus saringan</button>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.slice(0, limit).map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    locked={closedDates.has(transaction.transactionDate)}
                    busy={busy}
                    onEdit={onEdit}
                    onCancel={onCancel}
                    onAttached={onReload}
                  />
                ))}
                {filtered.length > limit && (
                  <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="min-h-11 w-full rounded-xl border border-umkm-line bg-white text-xs font-bold text-umkm-brand hover:bg-umkm-surface">
                    Tampilkan {Math.min(PAGE_SIZE, filtered.length - limit)} lagi ({filtered.length - limit} tersisa)
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

