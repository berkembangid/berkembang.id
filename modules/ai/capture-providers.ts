import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { z } from "zod";
import {
  categoryCodeSchema,
  jakartaDate,
  paymentMethodSchema,
  transactionDraftItemsSchema,
  transactionTypeSchema,
  type TransactionDraftItem,
} from "@/modules/ledger/capture-schema";
import {
  EXTRACTION_SYSTEM_PROMPT_V2 as EXTRACTION_SYSTEM_PROMPT,
  applyHouseholdPrior,
} from "@/modules/ai/extraction-prompt";

export type AudioInput = { file: File; mimeType: string };
export type TranscriptInput = { transcription: string; transactionDate: string };
export type TranscriptResult = { text: string };
export type ExtractionResult = {
  items: TransactionDraftItem[];
  promptTokens?: number;
  completionTokens?: number;
};

export interface TranscriptionProvider {
  readonly provider: string;
  readonly model: string;
  transcribe(input: AudioInput): Promise<TranscriptResult>;
}

export interface ExtractionProvider {
  readonly provider: string;
  readonly model: string;
  extractTransactions(input: TranscriptInput): Promise<ExtractionResult>;
}

export type CaptureProviderAdapter = {
  provider: string;
  model: string;
  process(input: { sourceText?: string; audio?: AudioInput }): Promise<{
    transcription: string;
    items: TransactionDraftItem[];
    promptTokens?: number;
    completionTokens?: number;
  }>;
};

export class CaptureProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, options?: { cause?: unknown }) {
    super(code, { cause: options?.cause });
    this.name = "CaptureProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

const providerItemSchema = z.object({
  transactionType: transactionTypeSchema,
  amountIdr: z.number().int().positive().max(9_000_000_000_000),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryCode: categoryCodeSchema,
  description: z.string().trim().min(1).max(160),
  quantity: z.number().positive().max(1_000_000).nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  unitPriceIdr: z.number().int().positive().max(9_000_000_000_000).nullable().optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  salesChannel: z.string().trim().min(1).max(80).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  emkmCategoryCode: z.number().int().min(1).max(10).nullable().optional(),
  emkmCategorySubtype: z
    .enum(["4a", "4b", "5210", "5220", "5230", "5240", "5250", "5260", "5270", "5280", "5290"])
    .nullable()
    .optional(),
  counterpartyName: z.string().trim().min(1).max(120).nullable().optional(),
  interestAmountIdr: z.number().int().nonnegative().max(9_000_000_000_000).nullable().optional(),
});

const providerPayloadSchema = z.object({
  items: z.array(providerItemSchema).min(1).max(20),
});

function parseJsonPayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new CaptureProviderError("AI_VALIDATION_FAILED", false);
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      throw new CaptureProviderError("AI_VALIDATION_FAILED", false, { cause: error });
    }
  }
}

function normalizeProviderItems(
  value: unknown,
  defaultDate: string,
  transcription = "",
): TransactionDraftItem[] {
  const parsed = providerPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new CaptureProviderError("AI_VALIDATION_FAILED", false, { cause: parsed.error });
  }

  const normalized = parsed.data.items.map((item, index) =>
    applyHouseholdPrior(
      {
        clientItemId: `item-${index + 1}`,
        ...item,
        transactionDate: item.transactionDate ?? defaultDate,
      },
      transcription,
    ),
  );
  const validated = transactionDraftItemsSchema.safeParse(normalized);
  if (!validated.success) {
    throw new CaptureProviderError("AI_VALIDATION_FAILED", false, { cause: validated.error });
  }
  return validated.data;
}

function providerError(error: unknown) {
  if (error instanceof CaptureProviderError) return error;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  const code =
    status === 429
      ? "AI_RATE_LIMITED"
      : status === 408
        ? "AI_TIMEOUT"
        : status >= 500
          ? "AI_PROVIDER_UNAVAILABLE"
          : "AI_PROVIDER_FAILED";
  return new CaptureProviderError(code, status === 408 || status === 429 || status >= 500 || status === 0, {
    cause: error,
  });
}

type CircuitState = { failures: number; openUntil: number };
const providerCircuits = new Map<string, CircuitState>();
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;

function assertCircuitClosed(provider: string) {
  const circuit = providerCircuits.get(provider);
  if (circuit && circuit.openUntil > Date.now()) {
    throw new CaptureProviderError("AI_PROVIDER_CIRCUIT_OPEN", true);
  }
}

function recordProviderSuccess(provider: string) {
  providerCircuits.delete(provider);
}

function recordProviderFailure(provider: string) {
  const current = providerCircuits.get(provider) ?? { failures: 0, openUntil: 0 };
  const failures = current.failures + 1;
  providerCircuits.set(provider, {
    failures,
    openUntil: failures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() + CIRCUIT_OPEN_MS : 0,
  });
}

function extractionUserPrompt(input: TranscriptInput) {
  return `Tanggal default: ${input.transactionDate}\nTranskrip pengguna:\n${input.transcription}`;
}

function createGroqProviders(apiKey: string): {
  transcription: TranscriptionProvider;
  extraction: ExtractionProvider;
} {
  const client = new Groq({ apiKey });
  const extractionModel = process.env.CAPTURE_GROQ_EXTRACTION_MODEL?.trim() || "openai/gpt-oss-20b";
  return {
    transcription: {
      provider: "groq",
      model: "whisper-large-v3",
      async transcribe(input) {
        try {
          const response = await client.audio.transcriptions.create({
            file: input.file,
            model: "whisper-large-v3",
            language: "id",
          });
          const text = response.text?.trim();
          if (!text) throw new CaptureProviderError("AI_TRANSCRIPTION_EMPTY", false);
          return { text };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
    extraction: {
      provider: "groq",
      model: extractionModel,
      async extractTransactions(input) {
        try {
          const response = await client.chat.completions.create({
            model: extractionModel,
            messages: [
              { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
              { role: "user", content: extractionUserPrompt(input) },
            ],
            response_format: { type: "json_object" },
          });
          const content = response.choices[0]?.message?.content;
          if (!content) throw new CaptureProviderError("AI_VALIDATION_FAILED", false);
          return {
            items: normalizeProviderItems(parseJsonPayload(content), input.transactionDate, input.transcription),
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
          };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
  };
}

function createOpenAiProviders(apiKey: string): {
  transcription: TranscriptionProvider;
  extraction: ExtractionProvider;
} {
  const client = new OpenAI({ apiKey });
  return {
    transcription: {
      provider: "openai",
      model: "whisper-1",
      async transcribe(input) {
        try {
          const response = await client.audio.transcriptions.create({
            file: input.file,
            model: "whisper-1",
            language: "id",
          });
          const text = response.text?.trim();
          if (!text) throw new CaptureProviderError("AI_TRANSCRIPTION_EMPTY", false);
          return { text };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
    extraction: {
      provider: "openai",
      model: "gpt-4o-mini",
      async extractTransactions(input) {
        try {
          const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
              { role: "user", content: extractionUserPrompt(input) },
            ],
            response_format: { type: "json_object" },
          });
          const content = response.choices[0]?.message?.content;
          if (!content) throw new CaptureProviderError("AI_VALIDATION_FAILED", false);
          return {
            items: normalizeProviderItems(parseJsonPayload(content), input.transactionDate, input.transcription),
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
          };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
  };
}

function createGeminiProviders(apiKey: string): {
  transcription: TranscriptionProvider;
  extraction: ExtractionProvider;
} {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
  return {
    transcription: {
      provider: "gemini",
      model: "gemini-1.5-flash",
      async transcribe(input) {
        try {
          const audio = Buffer.from(await input.file.arrayBuffer()).toString("base64");
          const response = await model.generateContent([
            "Transkripsikan audio Bahasa Indonesia berikut secara verbatim. Kembalikan teks saja.",
            { inlineData: { data: audio, mimeType: input.mimeType } },
          ]);
          const text = response.response.text().trim();
          if (!text) throw new CaptureProviderError("AI_TRANSCRIPTION_EMPTY", false);
          return { text };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
    extraction: {
      provider: "gemini",
      model: "gemini-1.5-flash",
      async extractTransactions(input) {
        try {
          const response = await model.generateContent([
            EXTRACTION_SYSTEM_PROMPT,
            extractionUserPrompt(input),
          ]);
          const metadata = response.response.usageMetadata;
          return {
            items: normalizeProviderItems(
              parseJsonPayload(response.response.text()),
              input.transactionDate,
              input.transcription,
            ),
            promptTokens: metadata?.promptTokenCount,
            completionTokens: metadata?.candidatesTokenCount,
          };
        } catch (error) {
          throw providerError(error);
        }
      },
    },
  };
}

function composeAdapter(
  transcriptionProvider: TranscriptionProvider,
  extractionProvider: ExtractionProvider,
): CaptureProviderAdapter {
  return {
    provider: extractionProvider.provider,
    model: `${transcriptionProvider.model}+${extractionProvider.model}`,
    async process(input) {
      assertCircuitClosed(extractionProvider.provider);
      try {
        const transcript = input.sourceText?.trim()
          ? input.sourceText.trim()
          : input.audio
            ? (await transcriptionProvider.transcribe(input.audio)).text
            : "";
        if (!transcript) throw new CaptureProviderError("AI_TRANSCRIPTION_EMPTY", false);
        const extracted = await extractionProvider.extractTransactions({
          transcription: transcript,
          transactionDate: jakartaDate(),
        });
        recordProviderSuccess(extractionProvider.provider);
        return { transcription: transcript, ...extracted };
      } catch (error) {
        recordProviderFailure(extractionProvider.provider);
        throw providerError(error);
      }
    },
  };
}

export function createCaptureProviderAdapters(): CaptureProviderAdapter[] {
  const adapters: CaptureProviderAdapter[] = [];
  if (process.env.GROQ_API_KEY) {
    const provider = createGroqProviders(process.env.GROQ_API_KEY);
    adapters.push(composeAdapter(provider.transcription, provider.extraction));
  }
  if (process.env.OPENAI_API_KEY) {
    const provider = createOpenAiProviders(process.env.OPENAI_API_KEY);
    adapters.push(composeAdapter(provider.transcription, provider.extraction));
  }
  if (process.env.GEMINI_API_KEY) {
    const provider = createGeminiProviders(process.env.GEMINI_API_KEY);
    adapters.push(composeAdapter(provider.transcription, provider.extraction));
  }
  return adapters;
}
