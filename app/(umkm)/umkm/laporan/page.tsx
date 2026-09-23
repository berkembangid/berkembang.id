"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarCheck, Plus } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { BankReportCard } from "@/components/warung/BankReportCard";
import { MonthlyTab } from "@/components/warung/MonthlyTab";
import { supabase } from "@/lib/supabase";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";
import { sectorFromAnswer } from "@/modules/accounting/templates";
import { closingDayLabel, closingTargetDate } from "@/modules/ledger/closing-day";
import { cancelLedgerTransactionClient, closeLedgerDayClient, createLedgerTransactionClient, getLedgerReportClient, updateLedgerTransactionClient } from "@/modules/ledger/ledger-client";
import type { LedgerReportView, LedgerTransactionView } from "@/modules/ledger/ledger-repository";
import { jakartaDate, ledgerTransactionInputSchema } from "@/modules/ledger/ledger-schema";
import { CashBook, dateRange, formatIdr, type LedgerRangeState, type Preset } from "./_components/cash-book";
import { ClosingDialog } from "./_components/closing-dialog";
import {
  emptyTransactionForm, TransactionDialog, transactionFormFrom, transactionInputFrom, type TransactionFormState,
} from "@/components/warung/TransactionDialog";

// Kondisi awal usaha pindah ke menu Profil. Laporan menjawab « bagaimana
// usaha saya berjalan » dan dibaca berulang kali; kondisi awal menjawab
// « dari mana saya mulai » dan diisi sekali seumur usaha.
type Tab = "month" | "bank" | "cash";

export default function LaporanPage() {
  const router = useRouter();
  const { confirm, confirmWithReason } = useConfirm();
  const [tab, setTab] = useState<Tab>("month");
  const [range, setRange] = useState<LedgerRangeState>(() => dateRange("month"));
  const [preset, setPreset] = useState<Preset>("month");
  const [report, setReport] = useState<LedgerReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sector, setSector] = useState<AccountingSector>(pilotSector);

  const [form, setForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [editing, setEditing] = useState<LedgerTransactionView | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  // Pengingat "Tutup kas" di Beranda menautkan ke sini dengan tanggalnya,
  // supaya satu ketukan langsung membuka dialog untuk hari yang tepat.
  const [closingDate, setClosingDate] = useState(() => closingTargetDate(new Date()));
  const [showClosing, setShowClosing] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [physicalCash, setPhysicalCash] = useState("");
  const [closingNote, setClosingNote] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tutup-kas");
    // Ditunda satu tick: memanggil setState langsung di effect memicu render berantai.
    const timer = window.setTimeout(() => {
      // « Lihat buku kas » dari Catat: catatan barunya ada di tab Buku Kas.
      if (params.get("tab") === "kas") setTab("cash");
      if (requested) {
        // Sebelum pukul 04.00 yang ditawarkan hari kemarin, dan dialog harus
        // menutup hari itu -- bukan hari yang baru dua jam berjalan.
        setClosingDate(/^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : closingTargetDate(new Date()));
        setShowClosing(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Kategori formulir manual memakai kata-kata sektor usaha, sama seperti Catat.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      const { data } = await supabase.from("profiles").select("sektor_usaha").eq("auth_user_id", session.user.id).maybeSingle();
      if (!cancelled) setSector(sectorFromAnswer(data?.sektor_usaha));
    })();
    return () => { cancelled = true; };
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getLedgerReportClient(range));
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Laporan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const closedDates = useMemo(() => new Set(report?.closings.map((item) => item.closingDate) ?? []), [report]);
  const closingDone = report?.closings.some((item) => item.closingDate === closingDate) ?? false;

  const choosePreset = (value: Exclude<Preset, "custom">) => { setPreset(value); setRange(dateRange(value)); };
  const chooseRange = (value: LedgerRangeState) => { setPreset("custom"); setRange(value); };
  const openCreate = () => { setEditing(null); setForm(emptyTransactionForm()); setShowTransactionForm(true); };
  const openEdit = (transaction: LedgerTransactionView) => { setEditing(transaction); setForm(transactionFormFrom(transaction)); setShowTransactionForm(true); };

  const saveTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = ledgerTransactionInputSchema.safeParse(transactionInputFrom(form));
    // Salah isi bukan kegagalan sistem, jadi warnanya kuning, bukan merah.
    if (!input.success) { notifyWarning(input.error.issues[0]?.message ?? "Periksa kembali transaksi."); return; }
    if (editing && form.reason.trim().length < 3) {
      notifyWarning("Tuliskan alasan perubahan minimal 3 huruf.", { description: "Alasannya ikut tersimpan di riwayat, dan yang terlalu pendek tidak menjelaskan apa pun nanti." });
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateLedgerTransactionClient(editing.id, input.data, form.reason);
      else await createLedgerTransactionClient(input.data);
      setShowTransactionForm(false);
      notifySuccess(editing ? "Perubahan tersimpan" : "Transaksi tersimpan", {
        description: editing
          ? "Catatan lama tetap ada di riwayat beserta alasan perubahannya."
          : `${input.data.transactionType === "income" ? "Uang masuk" : "Uang keluar"} ${formatIdr(input.data.amountIdr)} sudah masuk buku kas.`,
      });
      await loadReport();
    } catch (error) {
      notifyFromError(error, "Transaksi belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pembatalan menanyakan alasannya di dalam aplikasi, bukan lewat
   * `window.prompt`: kotak peramban tidak bisa menjelaskan bahwa catatannya
   * TIDAK hilang, dan tidak bisa menolak alasan sependek satu huruf.
   */
  const cancelTransaction = async (transaction: LedgerTransactionView) => {
    const reason = await confirmWithReason({
      title: "Batalkan transaksi ini?",
      description: `${transaction.description} — ${formatIdr(transaction.amountIdr)}. Catatannya tidak dihapus: tetap terlihat di riwayat dengan tanda dibatalkan, dan pengaruhnya pada laporan ikut dibalik pada tanggal yang sama.`,
      reasonLabel: "Kenapa dibatalkan?",
      reasonPlaceholder: "Contoh: pembeli mengembalikan barang",
      confirmLabel: "Batalkan transaksi",
      cancelLabel: "Tidak jadi",
      tone: "danger",
    });
    if (reason === null) return;
    setBusy(true);
    try {
      await cancelLedgerTransactionClient(transaction.id, reason);
      notifySuccess("Transaksi dibatalkan", { description: "Riwayatnya tetap tersimpan beserta alasan yang Anda tulis." });
      await loadReport();
    } catch (error) {
      notifyFromError(error, "Transaksi belum dapat dibatalkan.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Tutup kas dikonfirmasi karena akibatnya tidak terlihat di formulirnya:
   * setelah ditutup, transaksi tanggal itu tidak bisa diubah lagi.
   */
  const closeDay = async (event: React.FormEvent) => {
    event.preventDefault();
    const dayLabel = closingDayLabel(closingDate, new Date());
    const yes = await confirm({
      title: `Tutup kas ${dayLabel}?`,
      description: "Setelah ditutup, transaksi pada tanggal itu tidak dapat diubah lagi. Kalau nanti ada yang keliru, transaksinya masih bisa dibatalkan dengan alasan.",
      confirmLabel: "Tutup kas",
      cancelLabel: "Periksa lagi",
    });
    if (!yes) return;
    setBusy(true);
    try {
      await closeLedgerDayClient({ closingDate, openingCashIdr: openingCash ? Number(openingCash) : null, physicalCashIdr: physicalCash ? Number(physicalCash) : null, note: closingNote || null });
      setShowClosing(false);
      notifySuccess(`Kas ${dayLabel} sudah ditutup`, { description: "Transaksi tanggal itu sekarang terkunci dari pengubahan." });
      await loadReport();
    } catch (error) {
      notifyFromError(error, "Tutup kas belum berhasil.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardPage>
      <PageHeader
        title="Buku kas & laporan"
        description="Pahami uang masuk, biaya, dan selisih usaha dari catatan yang sudah Anda konfirmasi."
        icon={BarChart3}
        actions={
          <>
            <button type="button" onClick={() => setShowClosing(true)} disabled={closingDone} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-3 text-xs font-bold text-umkm-brand disabled:cursor-not-allowed disabled:opacity-50">
              <CalendarCheck size={14} aria-hidden /> {closingDone ? `Kas ${closingDayLabel(closingDate, new Date())} sudah ditutup` : "Tutup kas"}
            </button>
            <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-3 text-xs font-bold text-white">
              <Plus size={14} aria-hidden /> Catat transaksi
            </button>
          </>
        }
      />

      {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

      <nav aria-label="Tampilan laporan" className="flex gap-1 rounded-xl border border-umkm-line bg-white p-1 shadow-[0_5px_18px_rgba(27,42,58,.04)]">
        {([{ id: "month", label: "Bulan ini" }, { id: "bank", label: "Untuk bank" }, { id: "cash", label: "Buku kas" }] as const).map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-bold transition-colors ${tab === item.id ? "bg-umkm-brand-soft text-umkm-brand shadow-sm" : "text-umkm-subtle hover:bg-umkm-surface-muted"}`}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "month" && <MonthlyTab month={jakartaDate().slice(0, 7)} />}
      {tab === "bank" && <BankReportCard onOpenCondition={() => router.push("/umkm/profil/kondisi-awal")} />}
      {tab === "cash" && (
        <CashBook
          report={report}
          loading={loading}
          range={range}
          preset={preset}
          busy={busy}
          closedDates={closedDates}
          onPreset={choosePreset}
          onRange={chooseRange}
          onReload={() => void loadReport()}
          onCreate={openCreate}
          onEdit={openEdit}
          onCancel={(transaction) => void cancelTransaction(transaction)}
        />
      )}

      <TransactionDialog open={showTransactionForm} form={form} setForm={setForm} editing={editing} busy={busy} sector={sector} onClose={() => setShowTransactionForm(false)} onSubmit={saveTransaction} />
      <ClosingDialog open={showClosing} dayLabel={closingDayLabel(closingDate, new Date())} openingCash={openingCash} physicalCash={physicalCash} note={closingNote} busy={busy} setOpeningCash={setOpeningCash} setPhysicalCash={setPhysicalCash} setNote={setClosingNote} onClose={() => setShowClosing(false)} onSubmit={closeDay} />
    </DashboardPage>
  );
}
