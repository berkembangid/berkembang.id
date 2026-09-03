"use client";

/**
 * Kartu draf hasil ucapan.
 *
 * Yang membedakannya dari daftar item biasa: kartu ini menunjukkan **kenapa**
 * sistem menebak begitu. Kata yang menghasilkan nominal dan kata yang memicu
 * kategori disorot di transkripnya, sehingga pemilik dapat memeriksa tebakan
 * itu tanpa harus mempercayainya.
 *
 * Tiga tingkat, tidak pernah ada yang tersimpan otomatis:
 *
 *   TINGGI  angka besar, kategori sudah terpilih, tinggal Simpan
 *   SEDANG  sama, tetapi chip kategori terbuka supaya mudah dibetulkan
 *   RENDAH  satu pertanyaan lebih dulu — dua pilihan nominal, atau ketik
 *
 * Satu pertanyaan, tidak pernah dua. Pemilik yang ditanya berulang berhenti
 * memakai fitur suara sama sekali.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { CategoryChips, type CategorySelection } from "@/components/warung/CategoryChips";
import { InlineMoneyInput } from "@/components/warung/MoneyInput";
import { formatIdr } from "@/modules/accounting/warung";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";

export type DraftAmountCandidate = { value: number; confidence: number; span: [number, number] };

export type VoiceDraft = {
  amountCandidates: DraftAmountCandidate[];
  category: { code: number; subtype?: string; evidenceSpan: [number, number] } | null;
  paymentMethod: string | null;
  occurredOn: string;
  counterpartySuggestion: string | null;
  description: string;
  tier: "TINGGI" | "SEDANG" | "RENDAH";
};

/**
 * Menyorot potongan transkrip yang menghasilkan tebakan.
 *
 * Rentangnya diurutkan dan yang bertumpuk dibuang, karena satu kata bisa
 * memicu nominal sekaligus kategori dan sorotan ganda hanya membuat kalimatnya
 * sulit dibaca.
 */
export function highlightSegments(
  text: string,
  spans: ReadonlyArray<[number, number]>,
): Array<{ text: string; highlighted: boolean }> {
  const valid = spans
    .filter(([start, end]) => Number.isFinite(start) && end > start && start >= 0 && end <= text.length)
    .sort((a, b) => a[0] - b[0]);

  const pieces: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of valid) {
    if (start < cursor) continue;
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), highlighted: false });
    pieces.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), highlighted: false });
  return pieces.filter((piece) => piece.text !== "");
}

export function VoiceDraftCard({
  draft,
  transcript,
  selection,
  onSelectionChange,
  onAmountChange,
  onSave,
  busy = false,
  sector = pilotSector,
  onTap,
}: {
  draft: VoiceDraft;
  transcript: string;
  selection: CategorySelection;
  onSelectionChange: (next: CategorySelection) => void;
  onAmountChange: (value: number | null) => void;
  onSave: () => void;
  busy?: boolean;
  sector?: AccountingSector;
  /** Setiap ketukan dihitung; targetnya median dua sampai tersimpan. */
  onTap?: (field: string) => void;
}) {
  const [chosenAmount, setChosenAmount] = useState<number | null>(
    draft.amountCandidates.length === 1 ? draft.amountCandidates[0].value : null,
  );

  const spans = useMemo(() => {
    const collected: Array<[number, number]> = draft.amountCandidates.map((amount) => amount.span);
    if (draft.category) collected.push(draft.category.evidenceSpan);
    return collected;
  }, [draft]);

  const needsAnswer = draft.tier === "RENDAH";
  const choices = draft.amountCandidates.slice(0, 2);

  const choose = (value: number | null) => {
    setChosenAmount(value);
    onAmountChange(value);
    onTap?.("amount");
  };

  return (
    <article className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      {transcript !== "" && (
        <p className="text-[11px] leading-relaxed text-[#6e859e]">
          {highlightSegments(transcript, spans).map((piece, index) =>
            piece.highlighted ? (
              <mark key={index} className="rounded bg-[#eef8fd] px-0.5 font-bold text-[#0b5f86]">
                {piece.text}
              </mark>
            ) : (
              <span key={index}>{piece.text}</span>
            ),
          )}
        </p>
      )}

      {needsAnswer ? (
        <div className="mt-3">
          <p className="text-sm font-bold text-[#1b2a3a]">
            {choices.length >= 2 ? "Yang mana maksudnya?" : "Berapa nominalnya?"}
          </p>
          {choices.length >= 2 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {choices.map((candidate) => (
                <button
                  key={candidate.value}
                  type="button"
                  onClick={() => choose(candidate.value)}
                  aria-pressed={chosenAmount === candidate.value}
                  className={`min-h-12 rounded-xl border px-4 text-base font-bold transition-colors ${
                    chosenAmount === candidate.value
                      ? "border-[#0b5f86] bg-[#0b5f86] text-white"
                      : "border-[#d8dcff] bg-white text-[#1b2a3a]"
                  }`}
                >
                  {formatIdr(candidate.value)}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <InlineMoneyInput
                value={chosenAmount}
                onChange={choose}
                ariaLabel="Nominal transaksi"
              />
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#1b2a3a] tabular-nums">
          {formatIdr(chosenAmount ?? draft.amountCandidates[0]?.value ?? 0)}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#6e859e]">
        <div className="flex gap-1">
          <dt>Tanggal</dt>
          <dd className="font-bold text-[#1b2a3a]">{draft.occurredOn}</dd>
        </div>
        {draft.paymentMethod && (
          <div className="flex gap-1">
            <dt>Bayar</dt>
            <dd className="font-bold text-[#1b2a3a]">{draft.paymentMethod}</dd>
          </div>
        )}
        {draft.counterpartySuggestion && (
          <div className="flex gap-1">
            <dt>Pelanggan</dt>
            <dd className="font-bold text-[#1b2a3a]">{draft.counterpartySuggestion}</dd>
          </div>
        )}
      </dl>

      {/*
        Chip kategori selalu terlihat, bukan hanya saat sistem ragu. Kategori
        yang salah diam-diam membuat laporan melenceng tanpa ada yang tahu, dan
        memperlihatkannya jauh lebih murah daripada menemukannya sebulan
        kemudian.
      */}
      <div className="mt-4">
        <CategoryChips
          idPrefix="draf-suara"
          selection={selection}
          amountIdr={chosenAmount}
          sector={sector}
          onChange={(next) => {
            onSelectionChange(next);
            onTap?.("category");
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          onTap?.("save");
          onSave();
        }}
        disabled={busy || (needsAnswer && chosenAmount === null)}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5f86] text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
        {busy ? "Menyimpan..." : "Simpan catatan"}
      </button>
    </article>
  );
}
