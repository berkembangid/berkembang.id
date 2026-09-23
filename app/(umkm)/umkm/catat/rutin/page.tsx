"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, LoaderCircle, Pencil, Plus, Repeat, SkipForward, Trash2 } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { FormDialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { CategoryChips, emptySelection, type CategorySelection } from "@/components/warung/CategoryChips";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { TransactionDialog, emptyTransactionForm, transactionInputFrom, type TransactionFormState } from "@/components/warung/TransactionDialog";
import { formatTanggal } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";
import { categoryLabel, normalizeCategory, sectorFromAnswer } from "@/modules/accounting/templates";
import {
  advanceRecurringClient, createLedgerTransactionClient, deleteRecurringClient, listRecurringClient, saveRecurringClient,
} from "@/modules/ledger/ledger-client";
import { jakartaDate, ledgerTransactionInputSchema, paymentMethodLabels } from "@/modules/ledger/ledger-schema";
import { cadenceLabels, recurringInputSchema, splitByDue, type RecurringView } from "@/modules/ledger/recurring";

function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

type Draft = {
  id: string | null;
  description: string;
  amount: number | null;
  category: CategorySelection;
  paymentMethod: string;
  counterparty: string;
  cadence: "weekly" | "monthly";
  nextDue: string;
};

function emptyDraft(): Draft {
  return { id: null, description: "", amount: null, category: emptySelection("expense"), paymentMethod: "cash", counterparty: "", cadence: "monthly", nextDue: jakartaDate() };
}

const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm font-normal text-umkm-ink outline-none focus:border-umkm-brand";

/**
 * Catatan rutin: sewa, gaji, listrik, cicilan.
 *
 * Tidak ada yang dicatat otomatis. Pada harinya muncul pengingat di Beranda;
 * di sini pemilik menekan « Catat » (nominalnya boleh berbeda bulan ini) atau
 * « Lewati ». Keduanya memajukan tanggal berikutnya satu periode.
 */
export default function CatatanRutinPage() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<RecurringView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sector, setSector] = useState<AccountingSector>(pilotSector);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<RecurringView | null>(null);
  const [form, setForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [today] = useState(() => jakartaDate());

  const load = useCallback(async () => {
    try {
      setItems(await listRecurringClient());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const normalized = normalizeCategory(draft.category.emkmCategoryCode, draft.category.emkmCategorySubtype, null);
    const parsed = recurringInputSchema.safeParse({
      id: draft.id,
      description: draft.description,
      amountIdr: draft.amount ?? 0,
      emkmCategoryCode: normalized.categoryCode,
      emkmCategorySubtype: normalized.subtype,
      paymentMethod: draft.paymentMethod,
      counterparty: draft.counterparty || null,
      cadence: draft.cadence,
      nextDue: draft.nextDue,
    });
    if (!parsed.success) { notifyWarning(parsed.error.issues[0]?.message ?? "Periksa kembali isiannya."); return; }
    setBusy(true);
    try {
      await saveRecurringClient(parsed.data);
      notifySuccess(draft.id ? "Catatan rutin diperbarui" : "Catatan rutin ditambahkan", {
        description: `Pengingat muncul di Beranda pada ${formatTanggal(parsed.data.nextDue, "long")}.`,
      });
      setDraft(null);
      await load();
    } catch (error) {
      notifyFromError(error, "Catatan rutin belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  const openRecord = (item: RecurringView) => {
    setForm({
      ...emptyTransactionForm(),
      amount: String(item.amountIdr),
      date: item.nextDue <= today ? item.nextDue : today,
      description: item.description,
      paymentMethod: item.paymentMethod,
      counterparty: item.counterparty ?? "",
      category: { ...emptySelection("expense"), emkmCategoryCode: item.emkmCategoryCode, emkmCategorySubtype: item.emkmCategorySubtype, counterpartyName: item.counterparty },
    });
    setRecording(item);
  };

  const saveRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recording) return;
    const input = ledgerTransactionInputSchema.safeParse(transactionInputFrom(form));
    if (!input.success) { notifyWarning(input.error.issues[0]?.message ?? "Periksa kembali isiannya."); return; }
    setBusy(true);
    try {
      await createLedgerTransactionClient(input.data);
      const advanced = await advanceRecurringClient(recording.id, recording.nextDue);
      notifySuccess(`${recording.description} tercatat`, { description: `Pengingat berikutnya: ${formatTanggal(advanced.nextDue, "long")}.` });
      setRecording(null);
      await load();
    } catch (error) {
      notifyFromError(error, "Catatan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async (item: RecurringView) => {
    const yes = await confirm({
      title: `Lewati ${item.description} kali ini?`,
      description: `Tidak ada yang dicatat untuk ${formatTanggal(item.nextDue, "long")}. Pengingat berikutnya muncul satu periode lagi.`,
      confirmLabel: "Lewati",
      cancelLabel: "Batal",
    });
    if (!yes) return;
    try {
      await advanceRecurringClient(item.id, item.nextDue);
      await load();
    } catch (error) {
      notifyFromError(error, "Belum berhasil dilewati.");
    }
  };

  const remove = async (item: RecurringView) => {
    const yes = await confirm({
      title: `Hapus catatan rutin ${item.description}?`,
      description: "Pengingatnya berhenti. Catatan yang sudah tercatat di buku kas tidak ikut terhapus.",
      confirmLabel: "Hapus",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;
    try {
      await deleteRecurringClient(item.id);
      notifySuccess("Catatan rutin dihapus");
      await load();
    } catch (error) {
      notifyFromError(error, "Belum berhasil dihapus.");
    }
  };

  const { due, upcoming } = splitByDue(items ?? [], today);

  const row = (item: RecurringView, isDue: boolean) => (
    <li key={item.id} className={`rounded-2xl border bg-white p-4 ${isDue ? "border-umkm-warning-line" : "border-umkm-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-umkm-ink">{item.description}</p>
          <p className="mt-0.5 text-xs text-umkm-subtle">
            {[categoryLabel(item.emkmCategoryCode, item.emkmCategorySubtype), paymentMethodLabels[item.paymentMethod] ?? item.paymentMethod, item.counterparty, cadenceLabels[item.cadence]].filter(Boolean).join(" · ")}
          </p>
          <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${isDue ? "text-umkm-warning" : "text-umkm-muted"}`}>
            <CalendarClock size={13} aria-hidden /> {isDue ? `Jatuh tempo ${formatTanggal(item.nextDue, "long")}` : `Berikutnya ${formatTanggal(item.nextDue, "long")}`}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums text-umkm-ink">{formatIdr(item.amountIdr)}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {isDue && (
          <>
            <button type="button" onClick={() => openRecord(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white"><Plus size={14} aria-hidden /> Catat sekarang</button>
            <button type="button" onClick={() => void skip(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-muted"><SkipForward size={14} aria-hidden /> Lewati</button>
          </>
        )}
        <button type="button" onClick={() => setDraft({ id: item.id, description: item.description, amount: item.amountIdr, category: { ...emptySelection("expense"), emkmCategoryCode: item.emkmCategoryCode, emkmCategorySubtype: item.emkmCategorySubtype }, paymentMethod: item.paymentMethod, counterparty: item.counterparty ?? "", cadence: item.cadence, nextDue: item.nextDue })} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-muted"><Pencil size={13} aria-hidden /> Ubah</button>
        <button type="button" onClick={() => void remove(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-umkm-danger hover:bg-umkm-danger-soft"><Trash2 size={14} aria-hidden /> Hapus</button>
      </div>
    </li>
  );

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Catatan rutin"
        description="Sewa, gaji, listrik, cicilan — diingatkan pada harinya, dicatat dengan satu ketukan."
        icon={Repeat}
        actions={<button type="button" onClick={() => setDraft(emptyDraft())} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white"><Plus size={14} aria-hidden /> Tambah</button>}
      />

      {failed && <FeedbackBanner tone="error">Catatan rutin belum dapat dimuat. <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button></FeedbackBanner>}
      {!items && !failed && <p role="status" className="flex items-center gap-2 text-sm text-umkm-subtle"><LoaderCircle size={16} className="animate-spin" aria-hidden /> Memuat…</p>}

      {items && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-umkm-line-strong bg-white p-8 text-center">
          <Repeat className="mx-auto text-umkm-faint" size={28} aria-hidden />
          <p className="mt-2 text-sm font-bold text-umkm-ink">Belum ada catatan rutin</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-umkm-subtle">Tambahkan biaya yang datang setiap bulan atau minggu, misalnya sewa kios atau gaji karyawan. Tidak ada yang dicatat otomatis — Anda diingatkan dulu.</p>
          <button type="button" onClick={() => setDraft(emptyDraft())} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white"><Plus size={14} aria-hidden /> Tambah catatan rutin</button>
        </div>
      )}

      {due.length > 0 && (
        <section aria-labelledby="rutin-jatuh-tempo" className="space-y-2">
          <h2 id="rutin-jatuh-tempo" className="text-sm font-bold text-umkm-ink">Waktunya dicatat</h2>
          <ul className="space-y-2">{due.map((item) => row(item, true))}</ul>
        </section>
      )}
      {upcoming.length > 0 && (
        <section aria-labelledby="rutin-berikutnya" className="space-y-2">
          <h2 id="rutin-berikutnya" className="text-sm font-bold text-umkm-ink">Berikutnya</h2>
          <ul className="space-y-2">{upcoming.map((item) => row(item, false))}</ul>
        </section>
      )}

      <FormDialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        eyebrow={draft?.id ? "Ubah catatan rutin" : "Catatan rutin baru"}
        title="Biaya yang datang berulang"
        className="md:max-w-xl"
      >
        {draft && (
          <form onSubmit={(event) => void saveDraft(event)} className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-umkm-ink">
              Namanya
              <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Contoh: Sewa kios" className={inputClass} />
            </label>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-umkm-ink">Nominal biasanya</p>
              <InlineMoneyInput value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} ariaLabel="Nominal biasanya" />
            </div>
            <CategoryChips idPrefix="rutin" selection={draft.category} amountIdr={draft.amount} sector={sector} onChange={(category) => setDraft({ ...draft, category })} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-umkm-ink">
                Setiap
                <select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as Draft["cadence"] })} className={inputClass}>
                  <option value="monthly">Bulan</option>
                  <option value="weekly">Minggu</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-umkm-ink">
                Tanggal berikutnya
                <input type="date" value={draft.nextDue} onChange={(event) => setDraft({ ...draft, nextDue: event.target.value })} className={inputClass} />
              </label>
              <label className="block text-xs font-bold text-umkm-ink">
                Pembayaran
                <select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })} className={inputClass}>
                  {Object.entries(paymentMethodLabels).filter(([key]) => key !== "unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-umkm-ink">
                Dibayar ke (boleh kosong)
                <input value={draft.counterparty} onChange={(event) => setDraft({ ...draft, counterparty: event.target.value })} placeholder="Pemilik kios" className={inputClass} />
              </label>
            </div>
            <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-umkm-brand text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan"}</button>
          </form>
        )}
      </FormDialog>

      <TransactionDialog open={recording !== null} form={form} setForm={setForm} editing={null} busy={busy} sector={sector} onClose={() => setRecording(null)} onSubmit={(event) => void saveRecord(event)} />
    </DashboardPage>
  );
}
