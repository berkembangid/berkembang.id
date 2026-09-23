"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarCheck, Plus } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { BankReportCard } from "@/components/warung/BankReportCard";
import { ContactBalances } from "@/components/warung/ContactBalances";
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
import { laporanSectionFor } from "../../umkm-navigation";

/**
 * Halaman Laporan menampilkan SATU bagian, yang dipilih lewat menu Laporan
 * (`?tab=`, lihat `LAPORAN_SECTIONS`). Deretan tab di atas halaman sudah
 * tidak ada: menu itulah pemilihnya.
 *
 * `useSearchParams` dibungkus `<Suspense>` di bawah, sesuai panduan Next:
 * tanpa itu seluruh halaman kehilangan pra-render.
 */
export default function LaporanPage() {
  return (
    <Suspense fallback={null}>
      <LaporanView />
    </Suspense>
  );
}

function LaporanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = laporanSectionFor(searchParams.get("tab"));
  const tab = section.tab;
  const { confirm, confirmWithReason } = useConfirm();
  // Buku kas dibuka pada hari ini: itu yang dicari setelah berjualan. Kecuali
  // datang dari baris aktivitas Beranda (`?cari=`) -- catatan itu bisa saja
  // dari hari lain, jadi pencariannya memakai sebulan.
  const initialPreset: Exclude<Preset, "custom"> = searchParams.get("cari") ? "month" : "today";
  const [range, setRange] = useState<LedgerRangeState>(() => dateRange(initialPreset));
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [report, setReport] = useState<LedgerReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sector, setSector] = useState<AccountingSector>(pilotSector);
  const [businessName, setBusinessName] = useState("");

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
      const { data } = await supabase.from("profiles").select("sektor_usaha,nama_usaha").eq("auth_user_id", session.user.id).maybeSingle();
      if (!cancelled) {
        setSector(sectorFromAnswer(data?.sektor_usaha));
        setBusinessName(data?.nama_usaha ?? "");
      }
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

  // Status tutup kas dibaca sendiri, bukan dari rentang Buku Kas: rentangnya
  // kini « hari ini », sedangkan sebelum pukul 04.00 yang ditutup hari kemarin.
  const [closingDone, setClosingDone] = useState(false);
  const loadClosingStatus = useCallback(async () => {
    try {
      const day = await getLedgerReportClient({ startDate: closingDate, endDate: closingDate });
      setClosingDone(day.closings.some((item) => item.closingDate === closingDate));
    } catch {
      // Tombolnya tetap aktif; basis data yang menolak tutup kas ganda.
    }
  }, [closingDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadClosingStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadClosingStatus]);

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
      setClosingDone(true);
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
        title={section.label}
        description={section.description}
        icon={BarChart3}
        actions={tab === "kas" && (
          <>
            <button type="button" onClick={() => setShowClosing(true)} disabled={closingDone} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-3 text-xs font-bold text-umkm-brand disabled:cursor-not-allowed disabled:opacity-50">
              <CalendarCheck size={14} aria-hidden /> {closingDone ? `Kas ${closingDayLabel(closingDate, new Date())} sudah ditutup` : "Tutup kas"}
            </button>
            <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-3 text-xs font-bold text-white">
              <Plus size={14} aria-hidden /> Catat transaksi
            </button>
          </>
        )}
      />

      {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

      {tab === "bulan-ini" && <MonthlyTab month={jakartaDate().slice(0, 7)} onManageContacts={() => router.push("/umkm/laporan?tab=utang-piutang")} />}
      {tab === "utang-piutang" && <ContactBalances sector={sector} businessName={businessName} onChanged={() => void loadReport()} />}
      {tab === "bank" && <BankReportCard onOpenCondition={() => router.push("/umkm/profil/kondisi-awal")} />}
      {tab === "kas" && (
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
