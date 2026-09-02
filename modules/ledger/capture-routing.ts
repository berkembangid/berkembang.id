/**
 * Router dua jalur dan gating kepercayaan untuk capture suara.
 *
 * Modul murni: tanpa jaringan, tanpa basis data, tanpa `server-only`. Semua
 * keputusan di sini dapat diuji penuh secara luring, dan itu memang syaratnya —
 * ini tempat sistem memutuskan apakah sebuah ucapan perlu dikirim ke Whisper,
 * berapa nominalnya, dan apakah pemilik perlu ditanya.
 *
 * SATU ATURAN YANG TIDAK BISA DITAWAR
 *
 * Angka hanya lahir dari `nominal-parser`. Model bahasa tidak pernah
 * menghasilkan, memperbaiki, atau membulatkan nominal — tugasnya paling jauh
 * menebak kategori. `parseLlmCategory` di bawah menolak keras payload yang
 * memuat angka, dan pelanggarannya dihitung supaya bisa dipantau: targetnya
 * nol, selamanya.
 */

import { z } from "zod";
import { parseUtterance } from "@/modules/nominal-parser";
import type {
  KeywordEntry,
  ParseResult,
  ParsedAmount,
  ParsedSegment,
  PaymentHint,
} from "@/modules/nominal-parser";

// ---------------------------------------------------------------------------
// Ambang dan jalur
// ---------------------------------------------------------------------------

export const defaultClientTranscriptMinConfidence = 0.85;

/**
 * Ambang keyakinan transkrip peramban. Konfigurasi, bukan konstanta: angkanya
 * hanya dapat disetel benar setelah ada data pilot, dan spek Tahap V-C memang
 * menjadwalkan penyetelannya.
 */
export function clientTranscriptMinConfidence(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.VOICE_CLIENT_TRANSCRIPT_MIN_CONF);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : defaultClientTranscriptMinConfidence;
}

export type CapturePath = "TEXT_ONLY" | "WHISPER";

export type ClientTranscript = {
  text: string;
  confidence: number;
  engine?: string;
  lang?: string;
};

export type RoutingDecision =
  | { path: "TEXT_ONLY"; transcript: string; transcriptConfidence: number; reason: "CONFIDENT" | "ONLY_SOURCE" }
  | { path: "WHISPER" }
  | { path: null; reason: "NO_SOURCE" };

/**
 * Aturan 4.3 spek, ditulis apa adanya.
 *
 * Urutannya penting. Transkrip berkeyakinan tinggi yang MEMANG mengandung
 * nominal menang lebih dulu, karena itu satu-satunya keadaan di mana audio
 * benar-benar tidak diperlukan. Transkrip berkeyakinan rendah tidak langsung
 * kalah — ia hanya kalah dari audio. Kalau audionya tidak ada, teks apa adanya
 * tetap lebih berguna daripada menolak, dan gating yang akan bertanya.
 */
export function chooseCapturePath(input: {
  transcript?: ClientTranscript | null;
  hasAudio: boolean;
  minConfidence?: number;
  now?: Date;
  keywords?: readonly KeywordEntry[];
}): RoutingDecision {
  const minimum = input.minConfidence ?? defaultClientTranscriptMinConfidence;
  const transcript = input.transcript;
  const text = transcript?.text?.trim() ?? "";

  if (text !== "" && (transcript?.confidence ?? 0) >= minimum) {
    const parsed = parseUtterance(text, { now: input.now, keywords: input.keywords });
    const hasAmount = parsed.segments.some((segment) => segment.amounts.length > 0);
    if (hasAmount) {
      return {
        path: "TEXT_ONLY",
        transcript: text,
        transcriptConfidence: transcript?.confidence ?? 0,
        reason: "CONFIDENT",
      };
    }
  }

  if (input.hasAudio) return { path: "WHISPER" };

  if (text !== "") {
    return {
      path: "TEXT_ONLY",
      transcript: text,
      transcriptConfidence: transcript?.confidence ?? 0,
      reason: "ONLY_SOURCE",
    };
  }

  return { path: null, reason: "NO_SOURCE" };
}

// ---------------------------------------------------------------------------
// Draf dan gating
// ---------------------------------------------------------------------------

export type GatingTier = "TINGGI" | "SEDANG" | "RENDAH";

export type DraftCandidate = {
  amountCandidates: ParsedAmount[];
  category:
    | { code: number; subtype?: string; source: "KEYWORD" | "LLM"; confidence: number; evidenceSpan: [number, number] }
    | null;
  paymentMethod: PaymentHint | null;
  occurredOn: string;
  counterpartySuggestion: string | null;
  description: string;
  tier: GatingTier;
};

export type DraftQuestion = {
  draftIndex: number;
  field: "amount";
  type: "NUMPAD" | "CHOICE";
  choices?: number[];
};

/**
 * Gating Bagian 5 spek.
 *
 * Tidak pernah ada tingkat "otomatis simpan". Yang paling tinggi pun tetap
 * melewati kartu konfirmasi — pemilik selalu melihat angkanya sebelum masuk
 * buku, dan itu yang membedakan produk ini dari pencatat otomatis yang tidak
 * bisa dipertanggungjawabkan.
 */
export function gatingTier(
  draft: Pick<DraftCandidate, "amountCandidates" | "category">,
  transcriptConfidence: number,
  minConfidence = defaultClientTranscriptMinConfidence,
): GatingTier {
  const certain = draft.amountCandidates.filter((amount) => amount.confidence === 1);
  if (certain.length !== 1 || draft.amountCandidates.length !== 1) return "RENDAH";
  if (draft.category?.source === "KEYWORD" && transcriptConfidence >= minConfidence) return "TINGGI";
  if (draft.category && draft.category.confidence >= 0.7) return "SEDANG";
  return "SEDANG";
}

function describeSegment(segment: ParsedSegment): string {
  const residual = segment.residualText.replace(/\s+/g, " ").trim();
  return residual === "" ? "Catatan dari suara" : residual.slice(0, 160);
}

export function buildDrafts(
  parsed: ParseResult,
  transcriptConfidence: number,
  minConfidence = defaultClientTranscriptMinConfidence,
): DraftCandidate[] {
  return parsed.segments.map((segment) => {
    const category = segment.categoryHint
      ? {
          code: segment.categoryHint.code as number,
          ...(segment.categoryHint.subtype ? { subtype: segment.categoryHint.subtype } : {}),
          source: "KEYWORD" as const,
          confidence: 1,
          evidenceSpan: segment.categoryHint.span,
        }
      : null;
    const base = { amountCandidates: segment.amounts, category };
    return {
      ...base,
      paymentMethod: segment.paymentHint ?? null,
      occurredOn: segment.date.value,
      counterpartySuggestion: segment.counterpartyHint?.name ?? null,
      description: describeSegment(segment),
      tier: gatingTier(base, transcriptConfidence, minConfidence),
    };
  });
}

/**
 * Paling banyak SATU pertanyaan untuk seluruh respons.
 *
 * Bertanya dua kali menghabiskan target dua ketukan, dan pemilik yang ditanya
 * berulang berhenti memakai fitur suara sama sekali. Kalau ada beberapa draf
 * yang sama-sama meragukan, yang ditanyakan hanya yang pertama; sisanya
 * diperbaiki lewat kartu konfirmasi seperti biasa.
 */
export function buildQuestions(drafts: readonly DraftCandidate[]): DraftQuestion[] {
  for (const [index, draft] of drafts.entries()) {
    if (draft.tier !== "RENDAH") continue;
    const choices = draft.amountCandidates.map((amount) => amount.value);
    if (choices.length >= 2) {
      return [{ draftIndex: index, field: "amount", type: "CHOICE", choices: choices.slice(0, 2) }];
    }
    return [{ draftIndex: index, field: "amount", type: "NUMPAD" }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Penjaga: model bahasa tidak boleh mengeluarkan angka
// ---------------------------------------------------------------------------

/**
 * Skema keluaran LLM untuk kategori. Perhatikan yang TIDAK ada di sini: tidak
 * satu pun medan angka nominal. `.strict()` menolak medan tambahan apa pun,
 * sehingga model yang mengembalikan `amount` gagal keras alih-alih diam-diam
 * menyelinapkan angka ke pembukuan pemilik.
 */
export const llmCategorySchema = z
  .object({
    category_code: z.number().int().min(1).max(10),
    subtype: z.string().max(8).optional(),
    confidence: z.number().min(0).max(1),
    evidence_span: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  })
  .strict();

export type LlmCategory = z.infer<typeof llmCategorySchema>;

export class LlmAmountViolationError extends Error {
  constructor(readonly field: string) {
    super("LLM_AMOUNT_VIOLATION");
    this.name = "LlmAmountViolationError";
  }
}

const amountLikeKeys = ["amount", "nominal", "value", "total", "harga", "jumlah", "price", "idr"];
let violations = 0;

/** Berapa kali model mencoba mengeluarkan angka. Targetnya nol, selamanya. */
export function llmAmountViolationCount(): number {
  return violations;
}

export function resetLlmAmountViolationCount(): void {
  violations = 0;
}

export function parseLlmCategory(raw: unknown): LlmCategory {
  if (typeof raw === "object" && raw !== null) {
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      if (amountLikeKeys.some((needle) => key.toLowerCase().includes(needle))) {
        violations += 1;
        throw new LlmAmountViolationError(key);
      }
    }
  }
  return llmCategorySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Peristiwa telemetry Bagian 8, dibangun sebagai fungsi murni supaya isinya
 * dapat diuji. Transkrip dan audio TIDAK PERNAH masuk ke sini: ucapan warung
 * memuat nama pelanggan, dan nama pelanggan tidak boleh keluar dari tabel
 * capture yang ber-RLS.
 */
export function captureSubmittedEvent(input: {
  path: CapturePath | null;
  hasTranscript: boolean;
  hasAudio: boolean;
  queuedOffline?: boolean;
}) {
  return {
    event: "capture_submitted" as const,
    path: input.path,
    has_transcript: input.hasTranscript,
    has_audio: input.hasAudio,
    queued_offline: input.queuedOffline ?? false,
  };
}

export function draftReturnedEvent(input: {
  drafts: readonly DraftCandidate[];
  path: CapturePath;
  processingMs: number;
}) {
  const first = input.drafts[0];
  return {
    event: "draft_returned" as const,
    tier: first?.tier ?? "RENDAH",
    draft_count: input.drafts.length,
    amount_candidates: input.drafts.reduce((sum, draft) => sum + draft.amountCandidates.length, 0),
    category_source: first?.category?.source ?? null,
    path: input.path,
    processing_ms: input.processingMs,
  };
}

/**
 * Divergensi petunjuk klien dengan hasil server.
 *
 * `client_hints` tidak pernah dipercaya sebagai kebenaran — ia hanya
 * dibandingkan. Kalau parser klien dan parser server sering berbeda padahal
 * kodenya sama, yang berbeda pasti transkripnya, dan itu sinyal yang jauh
 * lebih berguna daripada angka akurasi mana pun.
 */
export function clientServerDivergence(
  hints: { amounts?: number[]; categoryCode?: number } | null | undefined,
  drafts: readonly DraftCandidate[],
): string[] {
  if (!hints) return [];
  const diverged: string[] = [];
  const serverAmounts = drafts.flatMap((draft) => draft.amountCandidates.map((amount) => amount.value));
  if (hints.amounts && hints.amounts.length > 0) {
    const same =
      hints.amounts.length === serverAmounts.length &&
      hints.amounts.every((value) => serverAmounts.includes(value));
    if (!same) diverged.push("amount");
  }
  if (hints.categoryCode !== undefined && drafts[0]?.category?.code !== hints.categoryCode) {
    diverged.push("category");
  }
  return diverged;
}
