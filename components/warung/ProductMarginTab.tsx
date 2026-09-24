"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Package, Pencil, Plus } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { jakartaDate } from "@/modules/ledger/ledger-schema";
import { archiveProductClient, getLedgerReportClient, getProductsClient, saveProductClient } from "@/modules/ledger/ledger-client";
import { productMargins, type Product } from "@/modules/ledger/product-margin";

function formatIdr(value: number) { return `${value < 0 ? "−" : ""}Rp${Math.abs(Math.round(value)).toLocaleString("id-ID")}`; }

type Period = "this" | "last";

function periodRange(period: Period): { startDate: string; endDate: string; label: string } {
  const today = jakartaDate();
  const [year, month] = today.split("-").map(Number);
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  if (period === "this") return { startDate: `${today.slice(0, 7)}-01`, endDate: today, label: `${names[month - 1]} ${year}` };
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastYear = month === 1 ? year - 1 : year;
  const end = new Date(Date.UTC(lastYear, lastMonth, 0)).getUTCDate();
  const prefix = `${lastYear}-${String(lastMonth).padStart(2, "0")}`;
  return { startDate: `${prefix}-01`, endDate: `${prefix}-${end}`, label: `${names[lastMonth - 1]} ${lastYear}` };
}

type Draft = { id: string | null; name: string; unit: string; sellPriceIdr: number | null; costPriceIdr: number | null };
const emptyDraft: Draft = { id: null, name: "", unit: "", sellPriceIdr: null, costPriceIdr: null };

/**
 * Untung per produk (0115).
 *
 * Omzetnya dari catatan penjualan (Laku / Jualan dan penjualan tempo) pada
 * periode yang dipilih, dicocokkan ke daftar produk lewat nama barang. Modal
 * per satuan diisi pemilik sekali di daftar produk. Ini PERKIRAAN untuk
 * memutuskan produk mana yang didorong -- untung resmi tetap di laporan
 * bulanan.
 */
export function ProductMarginTab() {
  const { confirm } = useConfirm();
  const [period, setPeriod] = useState<Period>("this");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [sales, setSales] = useState<Array<{ description: string; amountIdr: number; quantity: number | null }>>([]);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(async () => {
    try {
      const [list, report] = await Promise.all([getProductsClient(), getLedgerReportClient({ startDate: range.startDate, endDate: range.endDate })]);
      setProducts(list);
      setSales(report.transactions
        .filter((row) => row.transactionType === "income" && row.status !== "cancelled" && (row.emkmCategoryCode === 1 || row.emkmCategoryCode === 10))
        .map((row) => ({ description: row.description, amountIdr: row.amountIdr, quantity: row.quantity })));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const report = useMemo(() => productMargins(sales, products ?? []), [sales, products]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.name.trim() || draft.costPriceIdr === null) return;
    setBusy(true);
    try {
      await saveProductClient({ id: draft.id, name: draft.name.trim(), unit: draft.unit.trim() || null, sellPriceIdr: draft.sellPriceIdr || null, costPriceIdr: draft.costPriceIdr });
      notifySuccess(draft.id ? `${draft.name.trim()} diperbarui` : `${draft.name.trim()} masuk daftar produk`);
      setDraft(null);
      await load();
    } catch (error) {
      notifyFromError(error, "Produk belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (product: Product) => {
    const yes = await confirm({
      title: `Hapus ${product.name} dari daftar produk?`,
      description: "Catatan penjualannya tidak berubah. Produk ini hanya tidak dihitung lagi di laporan untung per produk.",
      confirmLabel: "Hapus dari daftar",
      tone: "danger",
    });
    if (!yes) return;
    try {
      await archiveProductClient(product.id);
      notifySuccess(`${product.name} dihapus dari daftar produk`);
      await load();
    } catch (error) {
      notifyFromError(error, "Produk belum bisa dihapus.");
    }
  };

  if (failed) {
    return (
      <p role="alert" className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft p-4 text-xs text-umkm-warning">
        Untung per produk belum dapat dimuat.{" "}
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button>
      </p>
    );
  }
  if (products === null) {
    return <p role="status" className="flex items-center gap-2 rounded-2xl bg-white p-8 text-sm text-umkm-subtle"><LoaderCircle className="animate-spin" size={16} aria-hidden /> Menghitung untung per produk…</p>;
  }

  const sold = report.products.filter((row) => row.revenueIdr > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Periode">
          {(["this", "last"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-11 rounded-full border px-4 text-xs font-bold ${period === value ? "border-umkm-brand bg-umkm-brand text-white" : "border-umkm-line bg-white text-umkm-muted"}`}
            >
              {value === "this" ? "Bulan ini" : "Bulan lalu"}
            </button>
          ))}
        </div>
        <span className="text-xs text-umkm-subtle">{range.label}</span>
      </div>

      <section aria-labelledby="untung-produk" className="rounded-2xl border border-umkm-line bg-white shadow-[0_8px_28px_rgba(27,42,58,.04)]">
        <header className="border-b border-umkm-line-soft px-4 py-3 md:px-5">
          <h2 id="untung-produk" className="text-sm font-bold text-umkm-ink">Untung per produk</h2>
          <p className="mt-0.5 text-xs text-umkm-subtle">Omzet dikurangi modal per satuan. Perkiraan untuk memilih produk yang didorong — untung resmi tetap di laporan Bulan ini.</p>
        </header>
        {products.length === 0 ? (
          <p className="px-4 py-5 text-xs text-umkm-subtle md:px-5">Belum ada produk. Tambahkan produk dengan modal per satuannya di bawah, atau pilih dari penjualan yang belum dikenali.</p>
        ) : sold.length === 0 ? (
          <p className="px-4 py-5 text-xs text-umkm-subtle md:px-5">Belum ada penjualan produk di daftar pada periode ini.</p>
        ) : (
          <ul className="divide-y divide-umkm-line-soft">
            {sold.map((row) => (
              <li key={row.product.id} className="px-4 py-3 md:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-umkm-ink">{row.product.name}</p>
                    <p className="text-xs text-umkm-subtle">
                      {row.quantity > 0 ? `${row.quantity.toLocaleString("id-ID")} ${row.product.unit ?? "terjual"} · ` : ""}omzet {formatIdr(row.revenueIdr)} · modal {formatIdr(row.costIdr)}
                    </p>
                    {row.incomplete && <p className="mt-0.5 text-xs text-umkm-warning">Sebagian penjualan tanpa jumlah dan produk ini belum punya harga jual, jadi modalnya belum terhitung penuh.</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold tabular-nums ${row.marginIdr >= 0 ? "text-umkm-success" : "text-umkm-danger"}`}>{formatIdr(row.marginIdr)}</p>
                    {row.marginRatio !== null && <p className="text-xs text-umkm-subtle">{Math.round(row.marginRatio * 100)}% dari omzet</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.unmatched.length > 0 && (
        <section aria-labelledby="belum-dikenali" className="rounded-2xl border border-umkm-line bg-white px-4 py-3 md:px-5">
          <h2 id="belum-dikenali" className="text-sm font-bold text-umkm-ink">Penjualan yang belum dikenali</h2>
          <p className="mt-0.5 text-xs text-umkm-subtle">Namanya belum cocok dengan produk di daftar. Jadikan produk supaya untungnya ikut terhitung.</p>
          <ul className="mt-2 divide-y divide-umkm-line-soft">
            {report.unmatched.slice(0, 8).map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-xs text-umkm-ink"><span className="font-bold">{item.name}</span> · {item.count}× · {formatIdr(item.revenueIdr)}</span>
                <button type="button" onClick={() => setDraft({ ...emptyDraft, name: item.name })} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-umkm-brand">Jadikan produk</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="daftar-produk" className="rounded-2xl border border-umkm-line bg-white px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="daftar-produk" className="flex items-center gap-2 text-sm font-bold text-umkm-ink"><Package size={16} aria-hidden className="text-umkm-brand" /> Daftar produk</h2>
          {!draft && (
            <button type="button" onClick={() => setDraft(emptyDraft)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft px-3 text-xs font-bold text-umkm-brand">
              <Plus size={14} aria-hidden /> Tambah produk
            </button>
          )}
        </div>

        {draft && (
          <form onSubmit={(event) => void save(event)} className="mt-3 space-y-3 rounded-xl border border-umkm-brand-line bg-umkm-brand-soft p-3">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="text-xs font-bold text-umkm-ink">
                Nama produk
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} placeholder="Contoh: Nasi kotak" className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-bold text-umkm-ink">
                Satuan
                <input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} maxLength={30} placeholder="kotak, porsi, pcs" className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-sm" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-xs font-bold text-umkm-ink">
                Harga jual per satuan
                <div className="mt-1.5"><InlineMoneyInput ariaLabel="Harga jual per satuan" value={draft.sellPriceIdr} onChange={(value) => setDraft({ ...draft, sellPriceIdr: value })} /></div>
                <span className="mt-1 block text-xs font-normal text-umkm-subtle">Dipakai menebak jumlah terjual bila catatannya tanpa jumlah.</span>
              </div>
              <div className="text-xs font-bold text-umkm-ink">
                Modal per satuan
                <div className="mt-1.5"><InlineMoneyInput ariaLabel="Modal per satuan" value={draft.costPriceIdr} onChange={(value) => setDraft({ ...draft, costPriceIdr: value })} /></div>
                <span className="mt-1 block text-xs font-normal text-umkm-subtle">Bahan, kemasan, dan ongkos yang habis untuk satu satuan.</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-umkm-line bg-white px-4 text-xs font-bold text-umkm-ink">Batal</button>
              <button type="submit" disabled={busy || !draft.name.trim() || draft.costPriceIdr === null} className="min-h-11 flex-1 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">
                {busy ? "Menyimpan..." : draft.id ? "Simpan perubahan" : "Simpan produk"}
              </button>
            </div>
          </form>
        )}

        {products.length > 0 && (
          <ul className="mt-2 divide-y divide-umkm-line-soft">
            {products.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-xs text-umkm-ink">
                  <span className="font-bold">{product.name}</span>
                  {product.sellPriceIdr ? ` · jual ${formatIdr(product.sellPriceIdr)}` : ""} · modal {formatIdr(product.costPriceIdr)}{product.unit ? ` / ${product.unit}` : ""}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setDraft({ id: product.id, name: product.name, unit: product.unit ?? "", sellPriceIdr: product.sellPriceIdr, costPriceIdr: product.costPriceIdr })} aria-label={`Ubah ${product.name}`} className="grid size-11 place-items-center rounded-lg text-umkm-brand"><Pencil size={14} aria-hidden /></button>
                  <button type="button" onClick={() => void archive(product)} className="min-h-11 rounded-lg px-2 text-xs font-bold text-umkm-subtle">Hapus</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
