"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, Trash2 } from "lucide-react";
import { DashboardPage, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";
import { sectorFromAnswer } from "@/modules/accounting/templates";
import { cancelCapture, confirmCapture, getCapture, type CaptureClientView } from "@/modules/ledger/capture-client";
import { ReviewItem } from "../_components/review-item";
import { CONTINUOUS_SESSION_STORAGE_KEY } from "../_components/continuous-session";
import { formatDraftItems, incompleteItems, toDraftItems, type ExtractedItem } from "../_lib/capture-items";

function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

type Card = {
  capture: CaptureClientView;
  items: ExtractedItem[];
  /** Transaksi yang sudah ada dengan nominal dan tanggal yang sama. */
  duplicates: number;
  saving: boolean;
};

/** Tanda « mungkin sudah tercatat ». Gagal membaca bukan alasan menahan simpan. */
async function knownTransactionKeys(items: readonly ExtractedItem[]): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const { data } = await supabase
    .from("transactions")
    .select("amount_idr,transaction_date")
    .in("amount_idr", [...new Set(items.map((item) => item.nominal))])
    .in("transaction_date", [...new Set(items.map((item) => item.transactionDate))])
    .neq("ledger_status", "cancelled")
    .limit(200);
  return new Set((data ?? []).map((row) => `${row.transaction_date}|${Number(row.amount_idr)}`));
}

/**
 * Periksa hasil catat -- terutama dari mode terus-menerus.
 *
 * Setiap penjualan yang diucapkan sambil berjualan menjadi satu catatan
 * `needs_review`. Di sini semuanya dibaca sekaligus, bisa diperbaiki per baris,
 * lalu disimpan bersama. Tidak ada yang masuk buku kas sebelum melewati layar
 * ini. Catatan yang gagal dibaca atau masih dibaca ikut tampil supaya tidak
 * ada yang hilang diam-diam.
 */
export default function PeriksaCatatPage() {
  const { confirm } = useConfirm();
  const [sector, setSector] = useState<AccountingSector>(pilotSector);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [pending, setPending] = useState<Array<{ id: string; status: string; message: string | null }>>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [sessionIds, setSessionIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getUser();
      if (session.user) {
        const { data: profile } = await supabase.from("profiles").select("sektor_usaha").eq("id", session.user.id).maybeSingle();
        setSector(sectorFromAnswer(profile?.sektor_usaha));
      }
      try {
        setSessionIds(new Set(JSON.parse(localStorage.getItem(CONTINUOUS_SESSION_STORAGE_KEY) ?? "[]")));
      } catch {}

      const { data, error } = await supabase
        .from("transaction_captures")
        .select("id,status,failure_message,updated_at")
        .in("status", ["draft", "queued", "processing", "needs_review", "failed"])
        .order("created_at", { ascending: true })
        .limit(60);
      if (error) throw error;
      const rows = data ?? [];
      const ready = rows.filter((row) => row.status === "needs_review");
      setPending(rows.filter((row) => row.status !== "needs_review").map((row) => ({ id: row.id, status: row.status, message: row.failure_message })));

      const captures = await Promise.all(ready.map((row) => getCapture(row.id).catch(() => null)));
      const loaded = captures.filter((capture): capture is CaptureClientView => capture !== null && capture.status === "needs_review");
      const nextCards: Card[] = loaded.map((capture) => ({ capture, items: formatDraftItems(capture.draft), duplicates: 0, saving: false }));
      setCards(nextCards);
      setLoadFailed(false);
      const known = await knownTransactionKeys(nextCards.flatMap((card) => card.items));
      if (known.size > 0) {
        setCards(nextCards.map((card) => ({
          ...card,
          duplicates: card.items.filter((item) => known.has(`${item.transactionDate}|${item.nominal}`)).length,
        })));
      }
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateCard = (captureId: string, patch: Partial<Card>) =>
    setCards((current) => current?.map((card) => (card.capture.id === captureId ? { ...card, ...patch } : card)) ?? null);

  const removeCard = (captureId: string) =>
    setCards((current) => current?.filter((card) => card.capture.id !== captureId) ?? null);

  const saveCard = async (card: Card): Promise<boolean> => {
    if (card.items.length === 0 || incompleteItems(card.items).length > 0) return false;
    updateCard(card.capture.id, { saving: true });
    try {
      await confirmCapture(card.capture.id, toDraftItems(card.items), `confirm:${card.capture.id}`);
      removeCard(card.capture.id);
      return true;
    } catch (error) {
      updateCard(card.capture.id, { saving: false });
      notifyFromError(error, "Catatan ini belum tersimpan.");
      return false;
    }
  };

  const saveAll = async () => {
    if (!cards) return;
    const complete = cards.filter((card) => card.items.length > 0 && incompleteItems(card.items).length === 0);
    const skipped = cards.length - complete.length;
    if (complete.length === 0) {
      notifyWarning("Belum ada catatan yang lengkap", { description: "Lengkapi keterangan dan nominalnya dulu." });
      return;
    }
    const withDuplicates = complete.filter((card) => card.duplicates > 0).length;
    if (withDuplicates > 0) {
      const yes = await confirm({
        title: "Ada yang mungkin sudah tercatat",
        description: `${withDuplicates} catatan punya nominal dan tanggal yang sama dengan transaksi di buku kas. Tetap simpan semuanya?`,
        confirmLabel: "Tetap simpan",
        cancelLabel: "Periksa dulu",
      });
      if (!yes) return;
    }
    setSavingAll(true);
    let saved = 0;
    for (const card of complete) {
      if (await saveCard(card)) saved += 1;
    }
    setSavingAll(false);
    if (saved > 0) {
      notifySuccess(`${saved} catatan tersimpan ke buku kas`, {
        description: skipped > 0 ? `${skipped} catatan belum lengkap dan masih menunggu.` : undefined,
      });
    }
  };

  const discard = async (card: Card) => {
    const yes = await confirm({
      title: "Buang catatan ini?",
      description: "Rekamannya tidak dicatat ke buku kas. Pakai ini untuk ucapan yang bukan transaksi.",
      confirmLabel: "Buang",
      tone: "danger",
    });
    if (!yes) return;
    try {
      await cancelCapture(card.capture.id);
      removeCard(card.capture.id);
    } catch (error) {
      notifyFromError(error, "Catatan belum bisa dibuang.");
    }
  };

  const discardPending = async (id: string) => {
    try {
      await cancelCapture(id);
      setPending((current) => current.filter((row) => row.id !== id));
    } catch (error) {
      notifyFromError(error, "Catatan belum bisa dibuang.");
    }
  };

  const totalItems = cards?.reduce((sum, card) => sum + card.items.length, 0) ?? 0;
  const totalIn = cards?.flatMap((card) => card.items).filter((item) => item.type === "masuk").reduce((sum, item) => sum + item.nominal, 0) ?? 0;

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Periksa hasil catat"
        description="Semua yang Anda ucapkan dan belum disimpan. Perbaiki yang keliru, lalu simpan sekaligus."
        icon={ClipboardCheck}
      />

      {loadFailed && (
        <p role="alert" className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft p-4 text-xs text-umkm-warning">
          Catatan belum dapat dimuat.{" "}
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button>
        </p>
      )}

      {cards === null && !loadFailed && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-white p-8 text-sm text-umkm-subtle"><LoaderCircle size={16} className="animate-spin" aria-hidden /> Memuat catatan…</p>
      )}

      {cards && cards.length === 0 && pending.length === 0 && (
        <div className="rounded-2xl border border-umkm-line bg-white p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-umkm-success" aria-hidden />
          <p className="mt-2 text-sm font-bold text-umkm-ink">Semua catatan sudah diperiksa</p>
          <Link href="/umkm/catat" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white">Catat lagi</Link>
        </div>
      )}

      {cards && cards.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-3">
          <p className="text-xs text-umkm-ink">
            <span className="font-bold">{cards.length} catatan</span> · {totalItems} transaksi · uang masuk {formatIdr(totalIn)}
          </p>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={savingAll}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-60"
          >
            {savingAll && <LoaderCircle size={14} className="animate-spin" aria-hidden />} Simpan semua yang lengkap
          </button>
        </div>
      )}

      {cards?.map((card) => {
        const incomplete = incompleteItems(card.items).length;
        return (
          <article key={card.capture.id} className={`rounded-2xl border bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)] ${card.saving ? "opacity-60" : ""} border-umkm-line`}>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-umkm-subtle">
                  {new Date(card.capture.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
                  {sessionIds.has(card.capture.id) ? " · dari sesi terus-menerus" : ""}
                </p>
                {card.capture.transcription && <p className="mt-0.5 text-xs italic text-umkm-muted">« {card.capture.transcription} »</p>}
              </div>
              <button type="button" onClick={() => void discard(card)} aria-label="Buang catatan ini" className="grid size-11 shrink-0 place-items-center rounded-lg text-umkm-subtle hover:text-umkm-danger">
                <Trash2 size={15} aria-hidden />
              </button>
            </header>
            <div className="mt-2 space-y-2">
              {card.items.map((item) => (
                <ReviewItem
                  key={item.clientItemId}
                  item={item}
                  sector={sector}
                  onChange={(next) => updateCard(card.capture.id, { items: card.items.map((row) => (row.clientItemId === item.clientItemId ? next : row)) })}
                  onDelete={() => updateCard(card.capture.id, { items: card.items.filter((row) => row.clientItemId !== item.clientItemId) })}
                />
              ))}
              {card.items.length === 0 && <p className="text-xs text-umkm-subtle">Semua baris dihapus. Buang catatan ini, atau muat ulang halaman untuk mengembalikannya.</p>}
            </div>
            <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs">
                {card.duplicates > 0 && <span className="font-semibold text-umkm-warning">Mungkin sudah tercatat{incomplete > 0 ? " · " : ""}</span>}
                {incomplete > 0 && <span className="font-semibold text-umkm-warning">{incomplete} baris belum lengkap</span>}
              </span>
              <button
                type="button"
                onClick={() => void saveCard(card).then((ok) => { if (ok) notifySuccess("Catatan tersimpan ke buku kas"); })}
                disabled={card.saving || incomplete > 0 || card.items.length === 0}
                className="min-h-11 rounded-xl border border-umkm-brand-line px-4 text-xs font-bold text-umkm-brand disabled:opacity-50"
              >
                Simpan ini
              </button>
            </footer>
          </article>
        );
      })}

      {pending.length > 0 && (
        <section aria-labelledby="catat-tertunda" className="rounded-2xl border border-umkm-line bg-white p-4">
          <h2 id="catat-tertunda" className="text-sm font-bold text-umkm-ink">Belum selesai dibaca</h2>
          <ul className="mt-2 divide-y divide-umkm-line-soft">
            {pending.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs text-umkm-ink">
                  {row.status === "failed" ? <AlertCircle size={14} className="shrink-0 text-umkm-danger" aria-hidden /> : <LoaderCircle size={14} className="shrink-0 animate-spin text-umkm-brand" aria-hidden />}
                  <span className="truncate">{row.status === "failed" ? row.message ?? "Belum dapat dibaca" : "Masih dibaca"}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Link href={`/umkm/catat?capture=${row.id}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-umkm-brand">Buka</Link>
                  {row.status === "failed" && (
                    <button type="button" onClick={() => void discardPending(row.id)} className="min-h-11 rounded-lg px-2 text-xs font-bold text-umkm-subtle">Buang</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void load()} className="mt-1 min-h-11 text-xs font-bold text-umkm-brand">Muat ulang</button>
        </section>
      )}
    </DashboardPage>
  );
}
