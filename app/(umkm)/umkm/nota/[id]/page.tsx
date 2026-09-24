"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LoaderCircle, MessageCircle, Printer } from "lucide-react";
import { DashboardPage } from "@/components/dashboard";
import { supabase } from "@/lib/supabase";
import {
  paymentLabel, receiptDate, receiptLine, receiptNumber, receiptWhatsappLink,
  type ReceiptBusiness, type ReceiptSource,
} from "@/modules/ledger/receipt";

function idr(value: number) { return `Rp${Math.round(value).toLocaleString("id-ID")}`; }

/**
 * Nota untuk pembeli, siap dicetak atau disimpan sebagai PDF lewat peramban.
 *
 * Dibaca langsung dari tabel lewat RLS -- pemilik hanya bisa membuka nota dari
 * catatannya sendiri. Hanya pemasukan yang belum dibatalkan yang punya nota:
 * nota untuk penjualan yang sudah dibatalkan akan menjadi bukti yang keliru.
 *
 * Saat dicetak, hanya kotak nota yang terlihat; menu dan header disembunyikan
 * lewat aturan cetak di bawah.
 */
export default function NotaPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");
  const [source, setSource] = useState<ReceiptSource | null>(null);
  const [business, setBusiness] = useState<ReceiptBusiness>({ name: "" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      const [transaction, profile] = await Promise.all([
        supabase.from("transactions")
          .select("id,direction,type,amount_idr,nominal,transaction_date,tanggal,item,quantity,unit,unit_price_idr,payment_method,counterparty,ledger_status")
          .eq("id", id).maybeSingle(),
        supabase.from("profiles").select("nama_usaha,alamat,phone").eq("auth_user_id", session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const row = transaction.data;
      const direction = row?.direction ?? (row?.type === "masuk" ? "income" : "expense");
      if (!row || direction !== "income" || row.ledger_status === "cancelled") {
        setState("missing");
        return;
      }
      setSource({
        id: row.id,
        transactionDate: row.transaction_date ?? row.tanggal ?? "",
        description: row.item ?? "Penjualan",
        amountIdr: Number(row.amount_idr ?? row.nominal ?? 0),
        quantity: row.quantity === null ? null : Number(row.quantity),
        unit: row.unit,
        unitPriceIdr: row.unit_price_idr === null ? null : Number(row.unit_price_idr),
        paymentMethod: row.payment_method,
        counterparty: row.counterparty,
      });
      setBusiness({ name: profile.data?.nama_usaha ?? "", address: profile.data?.alamat ?? null, phone: profile.data?.phone ?? null });
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <DashboardPage width="compact">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #nota, #nota * { visibility: visible !important; }
        #nota { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; box-shadow: none !important; }
      }`}</style>

      {state === "loading" && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-white p-8 text-sm text-umkm-subtle"><LoaderCircle size={16} className="animate-spin" aria-hidden /> Menyiapkan nota…</p>
      )}
      {state === "missing" && (
        <p role="alert" className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft p-4 text-xs text-umkm-warning">
          Nota tidak tersedia. Nota hanya bisa dibuat dari catatan uang masuk yang belum dibatalkan.
        </p>
      )}
      {state === "ready" && source && (
        <>
          <article id="nota" className="rounded-2xl border border-umkm-line bg-white p-6 text-umkm-ink shadow-[0_8px_28px_rgba(27,42,58,.04)]">
            <header className="border-b border-dashed border-umkm-line-strong pb-4 text-center">
              <h1 className="text-lg font-bold">{business.name || "Nota pembelian"}</h1>
              {business.address && <p className="mt-0.5 text-xs text-umkm-muted">{business.address}</p>}
              {business.phone && <p className="text-xs text-umkm-muted">{business.phone}</p>}
            </header>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-4 text-xs">
              <dt className="text-umkm-subtle">No</dt><dd className="font-semibold">{receiptNumber(source)}</dd>
              <dt className="text-umkm-subtle">Tanggal</dt><dd>{receiptDate(source.transactionDate)}</dd>
              {source.counterparty && (<><dt className="text-umkm-subtle">Kepada</dt><dd>{source.counterparty}</dd></>)}
            </dl>
            <div className="border-y border-dashed border-umkm-line-strong py-3 text-sm">{receiptLine(source)}</div>
            <div className="flex items-baseline justify-between pt-3">
              <span className="text-sm font-bold">Total</span>
              <span className="text-lg font-bold tabular-nums">{idr(source.amountIdr)}</span>
            </div>
            <p className="mt-1 text-xs text-umkm-muted">
              Pembayaran: {paymentLabel(source.paymentMethod)}
              {source.paymentMethod === "credit" || source.paymentMethod === "unpaid" ? " — belum lunas" : ""}
            </p>
            <p className="mt-6 text-center text-xs text-umkm-subtle">Terima kasih atas pembeliannya.</p>
          </article>

          <div className="flex flex-wrap gap-2">
            <a
              href={receiptWhatsappLink(source, business)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-umkm-success-line bg-umkm-success-soft px-4 text-xs font-bold text-umkm-success"
            >
              <MessageCircle size={15} aria-hidden /> Kirim lewat WhatsApp
            </a>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white">
              <Printer size={15} aria-hidden /> Cetak / simpan PDF
            </button>
          </div>
        </>
      )}
    </DashboardPage>
  );
}
