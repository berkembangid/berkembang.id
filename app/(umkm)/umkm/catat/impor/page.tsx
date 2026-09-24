"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Landmark, LoaderCircle } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { emptySelection } from "@/components/warung/CategoryChips";
import { emptyTransactionForm, transactionInputFrom } from "@/components/warung/TransactionDialog";
import { formatTanggal } from "@/lib/format";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";
import { requiresCounterparty, sectorFromAnswer, templatesForSector } from "@/modules/accounting/templates";
import { parseBankStatement, type StatementRow } from "@/modules/ledger/bank-statement";
import { createLedgerTransactionClient, getLedgerReportClient } from "@/modules/ledger/ledger-client";
import { jakartaDate, ledgerTransactionInputSchema } from "@/modules/ledger/ledger-schema";

function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

type Draft = StatementRow & {
  include: boolean;
  /** « kode|subtipe » dari template kategori. */
  category: string;
  /** Tanggal, arah, dan nominal yang sama sudah ada di Buku Kas. */
  likelyDuplicate: boolean;
  saved: boolean;
};

const DEFAULT_CATEGORY = { income: "1|", expense: "6|5290" } as const;

/**
 * Impor mutasi rekening dari CSV.
 *
 * Berkasnya dibaca di peramban dan TIDAK diunggah. Setiap baris menjadi
 * usulan -- dana masuk rekening sebagai uang masuk, dana keluar sebagai uang keluar -- yang
 * kategorinya dipilih pemilik. Yang dicentang dicatat satu per satu lewat
 * jalur yang sama dengan formulir manual, dengan cara bayar « Transfer bank ».
 *
 * Baris yang tanggal, arah, dan nominalnya sudah ada di Buku Kas tidak
 * dicentang bawaannya: mutasi yang sudah dicatat lewat suara atau foto tidak
 * boleh masuk dua kali hanya karena rekeningnya ikut diimpor.
 */
export default function ImporMutasiPage() {
  const [sector, setSector] = useState<AccountingSector>(pilotSector);
  const [fileName, setFileName] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [parseError, setParseError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const choices = useMemo(() => {
    const templates = templatesForSector(sector).filter(
      (template) => !requiresCounterparty(template.categoryCode) && template.subtype !== "5280",
    );
    return {
      income: templates.filter((template) => template.direction === "income"),
      expense: templates.filter((template) => template.direction === "expense"),
    };
  }, [sector]);

  const readFile = async (file: File) => {
    setFileName(file.name);
    setParseError("");
    setDrafts(null);
    const text = await file.text();
    const result = parseBankStatement(text, Number(jakartaDate().slice(0, 4)));
    if (result.error === "NO_HEADER") {
      setParseError("Judul kolomnya tidak dikenali. Pastikan berkasnya CSV mutasi rekening yang punya kolom Tanggal, Keterangan, dan nominal (kolom dana masuk/keluar, atau Jumlah).");
      return;
    }
    if (result.error === "NO_ROWS") {
      setParseError("Tidak ada baris mutasi yang terbaca dari berkas ini.");
      return;
    }

    // Tanda « mungkin sudah tercatat »: tanggal + arah + nominal yang sama.
    const dates = result.rows.map((row) => row.date).sort();
    const known = new Set<string>();
    try {
      const report = await getLedgerReportClient({ startDate: dates[0], endDate: dates[dates.length - 1] });
      for (const transaction of report.transactions) {
        if (transaction.status !== "cancelled") known.add(`${transaction.transactionDate}|${transaction.transactionType}|${transaction.amountIdr}`);
      }
    } catch {
      // Tanpa pembanding, semua baris tetap bisa dipilih manual.
    }
    setSkipped(result.skipped);
    setDrafts(result.rows.map((row) => {
      const likelyDuplicate = known.has(`${row.date}|${row.direction}|${row.amountIdr}`);
      return { ...row, include: !likelyDuplicate, category: DEFAULT_CATEGORY[row.direction], likelyDuplicate, saved: false };
    }));
  };

  const update = (line: number, patch: Partial<Draft>) =>
    setDrafts((current) => current?.map((draft) => (draft.line === line ? { ...draft, ...patch } : draft)) ?? null);

  const selected = drafts?.filter((draft) => draft.include && !draft.saved) ?? [];

  const save = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setProgress(0);
    let done = 0;
    try {
      for (const draft of selected) {
        const [code, subtype] = draft.category.split("|");
        const base = emptySelection(draft.direction);
        const input = ledgerTransactionInputSchema.parse(transactionInputFrom({
          ...emptyTransactionForm(),
          amount: String(draft.amountIdr),
          date: draft.date,
          description: draft.description.slice(0, 160),
          paymentMethod: "bank_transfer",
          category: { ...base, emkmCategoryCode: Number(code), emkmCategorySubtype: subtype || null },
        }));
        await createLedgerTransactionClient(input);
        done += 1;
        setProgress(done);
        update(draft.line, { saved: true });
      }
      notifySuccess(`${done} transaksi dari rekening tercatat`, { description: "Semuanya sudah masuk Buku Kas dengan cara bayar Transfer bank." });
    } catch (error) {
      notifyFromError(error, `${done} tercatat, sisanya belum. Periksa baris yang belum bertanda tercatat lalu coba lagi.`);
    } finally {
      setSaving(false);
    }
  };

  const savedCount = drafts?.filter((draft) => draft.saved).length ?? 0;

  return (
    <DashboardPage>
      <PageHeader
        title="Impor mutasi rekening"
        description="Unggah CSV mutasi dari internet banking. Berkasnya dibaca di ponsel atau komputer ini saja dan tidak dikirim ke server — yang tersimpan hanya baris yang Anda pilih."
        icon={Landmark}
      />

      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-umkm-brand-line bg-umkm-brand-soft p-5 text-center">
        <FileUp size={22} aria-hidden className="text-umkm-brand" />
        <span className="text-sm font-bold text-umkm-brand">{fileName ? `Ganti berkas (${fileName})` : "Pilih berkas CSV mutasi rekening"}</span>
        <span className="text-xs text-umkm-subtle">BCA, BRI, Mandiri, BNI, dan bank lain yang bisa mengunduh mutasi sebagai CSV.</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = "";
          }}
        />
      </label>

      {parseError && <FeedbackBanner tone="error" live>{parseError}</FeedbackBanner>}

      {drafts && (
        <section aria-labelledby="impor-baris" className="rounded-2xl border border-umkm-line bg-white shadow-[0_8px_28px_rgba(27,42,58,.04)]">
          <header className="border-b border-umkm-line-soft px-4 py-3 md:px-5">
            <h2 id="impor-baris" className="text-sm font-bold text-umkm-ink">{drafts.length} mutasi terbaca</h2>
            <p className="mt-0.5 text-xs text-umkm-subtle">
              Pilih kategorinya, hapus centang yang bukan transaksi usaha.
              {drafts.some((draft) => draft.likelyDuplicate) ? " Baris bertanda « mungkin sudah tercatat » tidak dicentang." : ""}
              {skipped > 0 ? ` ${skipped} baris dilewati karena tanggal atau nominalnya tidak terbaca.` : ""}
            </p>
          </header>
          <ul className="divide-y divide-umkm-line-soft">
            {drafts.map((draft) => {
              const options = choices[draft.direction];
              return (
                <li key={draft.line} className={`px-4 py-3 md:px-5 ${draft.saved ? "bg-umkm-success-soft" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draft.include || draft.saved}
                      disabled={draft.saved || saving}
                      onChange={(event) => update(draft.line, { include: event.target.checked })}
                      aria-label={`Catat ${draft.description}`}
                      className="mt-1 size-5 shrink-0 accent-[var(--umkm-brand)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-xs font-bold text-umkm-ink">{draft.description}</p>
                        <p className={`shrink-0 text-sm font-bold tabular-nums ${draft.direction === "income" ? "text-umkm-success" : "text-umkm-ink"}`}>
                          {draft.direction === "income" ? "+" : "−"}{formatIdr(draft.amountIdr)}
                        </p>
                      </div>
                      <p className="text-xs text-umkm-subtle">
                        {formatTanggal(draft.date)} · {draft.direction === "income" ? "uang masuk" : "uang keluar"}
                        {draft.likelyDuplicate && !draft.saved ? " · mungkin sudah tercatat" : ""}
                        {draft.saved ? " · tercatat" : ""}
                      </p>
                      {!draft.saved && (
                        <select
                          value={draft.category}
                          disabled={saving}
                          onChange={(event) => update(draft.line, { category: event.target.value })}
                          aria-label={`Kategori ${draft.description}`}
                          className="mt-2 min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white px-3 text-xs font-semibold text-umkm-ink sm:w-72"
                        >
                          {options.map((template) => (
                            <option key={`${template.categoryCode}|${template.subtype ?? ""}`} value={`${template.categoryCode}|${template.subtype ?? ""}`}>
                              {template.labelUmkm}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-umkm-line-soft bg-white px-4 py-3 md:px-5">
            {savedCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs font-bold text-umkm-success">
                <CheckCircle2 size={14} aria-hidden /> {savedCount} tercatat.{" "}
                <Link href="/umkm/laporan?tab=kas" className="underline">Lihat di Buku kas</Link>
              </p>
            ) : <span />}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || selected.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? <><LoaderCircle size={14} className="animate-spin" aria-hidden /> Mencatat {progress}/{selected.length + progress}…</> : `Catat ${selected.length} transaksi`}
            </button>
          </footer>
        </section>
      )}
    </DashboardPage>
  );
}
