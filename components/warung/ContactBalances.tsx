"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HandCoins, LoaderCircle, MessageCircle, Phone, Wallet } from "lucide-react";
import { emptySelection } from "@/components/warung/CategoryChips";
import { TransactionDialog, emptyTransactionForm, transactionInputFrom, type TransactionFormState } from "@/components/warung/TransactionDialog";
import { formatTanggal } from "@/lib/format";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";
import type { AccountingSector } from "@/modules/accounting/coa";
import { totalsByKind, whatsappLink, type ContactBalance } from "@/modules/ledger/contact-balances";
import { createLedgerTransactionClient, getContactBalancesClient, setContactPhoneClient } from "@/modules/ledger/ledger-client";
import { ledgerTransactionInputSchema } from "@/modules/ledger/ledger-schema";

function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

/**
 * Utang piutang per orang.
 *
 * Dulu hanya ada daftar penjualan tempo yang tidak pernah berkurang, dan
 * tidak ada apa pun untuk utang ke pemasok. Di sini setiap orang punya satu
 * saldo, dengan dua tindakan: menagih lewat WhatsApp milik pemilik sendiri,
 * dan mencatat pelunasan -- lewat formulir yang sama dengan Buku Kas,
 * sehingga pelunasan tetap tercatat sebagai transaksi berjurnal.
 */
export function ContactBalances({ sector, businessName, onChanged }: {
  sector: AccountingSector;
  businessName: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ContactBalance[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [phoneFor, setPhoneFor] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [settling, setSettling] = useState<ContactBalance | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getContactBalancesClient());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  /** Pelunasan: kategori 3 untuk piutang, 7 untuk utang. Nominalnya boleh diubah untuk bayar sebagian. */
  const openSettle = (row: ContactBalance) => {
    const base = emptySelection(row.kind === "PIUTANG" ? "income" : "expense");
    setForm({
      ...emptyTransactionForm(),
      amount: String(row.balanceIdr),
      description: row.kind === "PIUTANG" ? `Pelunasan dari ${row.name}` : `Bayar utang ke ${row.name}`,
      counterparty: row.name,
      category: {
        ...base,
        emkmCategoryCode: row.kind === "PIUTANG" ? 3 : 7,
        emkmCategorySubtype: null,
        counterpartyName: row.name,
      },
    });
    setSettling(row);
  };

  const saveSettle = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = ledgerTransactionInputSchema.safeParse(transactionInputFrom(form));
    if (!input.success) { notifyWarning(input.error.issues[0]?.message ?? "Periksa kembali isiannya."); return; }
    setBusy(true);
    try {
      await createLedgerTransactionClient(input.data);
      notifySuccess(settling?.kind === "PIUTANG" ? "Pelunasan tercatat" : "Pembayaran utang tercatat", {
        description: `${formatIdr(input.data.amountIdr)} — sudah masuk buku kas.`,
      });
      setSettling(null);
      await load();
      onChanged?.();
    } catch (error) {
      notifyFromError(error, "Pelunasan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async (row: ContactBalance) => {
    setBusy(true);
    try {
      await setContactPhoneClient(row.name, phone.trim() || null, row.kind);
      notifySuccess(`Nomor ${row.name} tersimpan`);
      setPhoneFor(null);
      await load();
    } catch (error) {
      notifyFromError(error, "Nomor belum tersimpan. Periksa lagi angkanya.");
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <p role="alert" className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft p-4 text-xs text-umkm-warning">
        Utang piutang belum dapat dimuat.{" "}
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button>
      </p>
    );
  }
  if (!rows) {
    return <p role="status" className="flex items-center gap-2 rounded-2xl bg-white p-8 text-sm text-umkm-subtle"><LoaderCircle className="animate-spin" size={16} aria-hidden /> Menghitung utang piutang…</p>;
  }

  const totals = totalsByKind(rows);
  const section = (kind: ContactBalance["kind"]) => {
    const list = rows.filter((row) => row.kind === kind);
    const receivable = kind === "PIUTANG";
    return (
      <section aria-labelledby={`kontak-${kind}`} className="rounded-2xl border border-umkm-line bg-white shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <header className="flex items-start justify-between gap-3 border-b border-umkm-line-soft px-4 py-4 md:px-5">
          <div>
            <h2 id={`kontak-${kind}`} className="text-sm font-bold text-umkm-ink">{receivable ? "Pelanggan yang belum bayar" : "Yang masih harus Anda bayar"}</h2>
            <p className="mt-0.5 text-xs text-umkm-subtle">{receivable ? "Penjualan tempo dikurangi pelunasan, per pelanggan." : "Belanja tempo dan pinjaman dikurangi pembayaran pokok, per orang atau lembaga."}</p>
          </div>
          <span className={`shrink-0 text-sm font-bold tabular-nums ${receivable ? "text-umkm-warning" : "text-umkm-ink"}`}>{formatIdr(receivable ? totals.piutangIdr : totals.utangIdr)}</span>
        </header>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-5 text-xs text-umkm-success md:px-5"><CheckCircle2 size={16} aria-hidden /> {receivable ? "Semua pelanggan sudah membayar." : "Tidak ada utang yang tercatat."}</p>
        ) : (
          <ul className="divide-y divide-umkm-line-soft">
            {list.map((row) => (
              <li key={`${row.kind}-${row.name}`} className="px-4 py-3 md:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-umkm-ink">{row.name}</p>
                    <p className="text-xs text-umkm-subtle">
                      {row.since ? `sejak ${formatTanggal(row.since)}` : ""}
                      {row.phone ? `${row.since ? " · " : ""}${row.phone}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-umkm-ink">{formatIdr(row.balanceIdr)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {receivable && (
                    <a
                      href={whatsappLink(row, businessName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-success-line bg-umkm-success-soft px-3 text-xs font-bold text-umkm-success"
                    >
                      <MessageCircle size={14} aria-hidden /> Tagih lewat WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => openSettle(row)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-umkm-brand px-3 text-xs font-bold text-white">
                    {receivable ? <HandCoins size={14} aria-hidden /> : <Wallet size={14} aria-hidden />} {receivable ? "Sudah dibayar" : "Catat pembayaran"}
                  </button>
                  {receivable && (
                    <button type="button" onClick={() => { setPhoneFor(row.name); setPhone(row.phone ?? ""); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-muted">
                      <Phone size={14} aria-hidden /> {row.phone ? "Ubah nomor" : "Simpan nomor"}
                    </button>
                  )}
                </div>
                {phoneFor === row.name && (
                  <form onSubmit={(event) => { event.preventDefault(); void savePhone(row); }} className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs font-bold text-umkm-muted">
                      Nomor WhatsApp {row.name}
                      <input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="081234567890" className="mt-1 block min-h-11 w-48 rounded-lg border border-umkm-line-strong px-3 text-sm text-umkm-ink" />
                    </label>
                    <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">Simpan</button>
                    <button type="button" onClick={() => setPhoneFor(null)} className="min-h-11 rounded-lg border border-umkm-line px-3 text-xs font-bold text-umkm-muted">Batal</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-umkm-surface px-4 py-3 text-xs leading-relaxed text-umkm-muted">
        Dihitung dari catatan dengan nama pelanggan atau pemasok yang sama. Tulis namanya dengan konsisten saat mencatat supaya saldonya tepat. Pesan WhatsApp tidak dikirim otomatis — Anda yang membaca dan menekan kirim.
      </p>
      {section("PIUTANG")}
      {section("UTANG")}
      <TransactionDialog open={settling !== null} form={form} setForm={setForm} editing={null} busy={busy} sector={sector} onClose={() => setSettling(null)} onSubmit={(event) => void saveSettle(event)} />
    </div>
  );
}
