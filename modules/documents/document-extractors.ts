import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";
import sharp from "sharp";
import {
  parseDocumentOcrResult,
  type DocumentOcrResult,
  type OcrDocumentType,
} from "@/modules/documents/document-schema";

export type DocumentExtractionResult = DocumentOcrResult;
export type DocumentExtractionInput = {
  bytes: Uint8Array;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  docType: OcrDocumentType;
};

export interface DocumentExtractionProvider {
  name: string;
  model: string;
  extractDocument(input: DocumentExtractionInput): Promise<DocumentExtractionResult>;
}

export class DocumentProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true, cause?: unknown) {
    super(message, { cause });
    this.name = "DocumentProviderError";
    this.retryable = retryable;
  }
}

const sharedRules = `Aturan wajib:
- Transkripsikan hanya teks yang terlihat jelas pada dokumen.
- Jangan menebak, melengkapi, atau membuat nomor maupun identitas.
- Gunakan null untuk field opsional yang tidak terbaca.
- confidence adalah angka 0 sampai 1 untuk keyakinan keseluruhan.
- Kembalikan satu objek JSON saja, tanpa markdown atau penjelasan.`;

const prompts: Record<OcrDocumentType, string> = {
  ktp: `Ekstrak data dari KTP Indonesia ini.
${sharedRules}
- NIK wajib tepat 16 digit dan nama wajib terbaca. Jika salah satunya tidak pasti, gunakan null sehingga hasil ditolak untuk pemeriksaan manual.
- Tanggal lahir gunakan YYYY-MM-DD jika terbaca.
- Bentuk JSON: {"documentType":"ktp","nik":"16 digit","name":"teks","placeOfBirth":"teks atau null","dateOfBirth":"YYYY-MM-DD atau null","address":"teks atau null","confidence":0.0}`,
  nib: `Ekstrak data dari dokumen NIB/OSS Indonesia ini.
${sharedRules}
- NIB wajib tepat 13 digit. Jika tidak pasti, gunakan null sehingga hasil ditolak untuk pemeriksaan manual.
- Bentuk JSON: {"documentType":"nib","nib":"13 digit","businessName":"teks atau null","ownerName":"teks atau null","businessAddress":"teks atau null","confidence":0.0}`,
  npwp: `Ekstrak data dari kartu atau dokumen NPWP Indonesia ini.
${sharedRules}
- Nomor NPWP wajib 15 atau 16 digit setelah tanda baca dihilangkan dan nama wajib terbaca. Jika tidak pasti, gunakan null sehingga hasil ditolak untuk pemeriksaan manual.
- Bentuk JSON: {"documentType":"npwp","npwp":"15 atau 16 digit","taxpayerName":"teks","address":"teks atau null","confidence":0.0}`,
};

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function readableText(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
  return typeof value === "string" ? value.trim() : null;
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const match = date.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function normalizeProviderResult(docType: OcrDocumentType, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (docType === "ktp") {
    return {
      documentType: "ktp",
      nik: readableText(source.nik, source.NIK),
      name: readableText(source.name, source.nama, source.fullName),
      placeOfBirth: readableText(source.placeOfBirth, source.tempatLahir),
      dateOfBirth: normalizedDate(source.dateOfBirth ?? source.tanggalLahir),
      address: readableText(source.address, source.alamat),
      confidence: source.confidence,
    };
  }
  if (docType === "nib") {
    return {
      documentType: "nib",
      nib: readableText(source.nib, source.NIB),
      businessName: readableText(source.businessName, source.namaUsaha),
      ownerName: readableText(source.ownerName, source.namaPemilik),
      businessAddress: readableText(source.businessAddress, source.alamatUsaha),
      confidence: source.confidence,
    };
  }
  return {
    documentType: "npwp",
    npwp: readableText(source.npwp, source.NPWP),
    taxpayerName: readableText(source.taxpayerName, source.namaWajibPajak, source.name),
    address: readableText(source.address, source.alamat),
    confidence: source.confidence,
  };
}

function parseExtraction(docType: OcrDocumentType, value: string) {
  try {
    return parseDocumentOcrResult(docType, normalizeProviderResult(docType, parseJson(value)));
  } catch (error) {
    throw new DocumentProviderError("DOCUMENT_EXTRACTION_NOT_CONFIDENT", false, error);
  }
}

function timeoutMs() {
  const configured = Number(process.env.DOCUMENT_AI_TIMEOUT_MS ?? 20_000);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 60_000
    ? configured
    : 20_000;
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new DocumentProviderError("DOCUMENT_PROVIDER_TIMEOUT", true, error);
    if (error instanceof DocumentProviderError) throw error;
    throw new DocumentProviderError("DOCUMENT_PROVIDER_FAILED", true, error);
  } finally {
    clearTimeout(timer);
  }
}

function createOpenAiProvider(apiKey: string): DocumentExtractionProvider {
  const model = process.env.DOCUMENT_OPENAI_MODEL ?? "gpt-5-mini";
  const client = new OpenAI({ apiKey });
  return {
    name: "openai",
    model,
    async extractDocument(input) {
      return withTimeout(async (signal) => {
        const base64 = Buffer.from(input.bytes).toString("base64");
        const prompt = prompts[input.docType];
        const content = input.mimeType === "application/pdf"
          ? [
              { type: "input_text" as const, text: prompt },
              { type: "input_file" as const, filename: `${input.docType}.pdf`, file_data: base64 },
            ]
          : [
              { type: "input_text" as const, text: prompt },
              {
                type: "input_image" as const,
                image_url: `data:${input.mimeType};base64,${base64}`,
                detail: "high" as const,
              },
            ];
        const response = await client.responses.create(
          { model, input: [{ role: "user", content }] },
          { signal },
        );
        return parseExtraction(input.docType, response.output_text);
      });
    },
  };
}

function createGeminiProvider(apiKey: string): DocumentExtractionProvider {
  const model = process.env.DOCUMENT_GEMINI_MODEL ?? "gemini-3.7-flash";
  const client = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model });
  return {
    name: "gemini",
    model,
    async extractDocument(input) {
      return withTimeout(async (signal) => {
        const prompt = prompts[input.docType];
        const result = await client.generateContent(
          [
            prompt,
            {
              inlineData: {
                data: Buffer.from(input.bytes).toString("base64"),
                mimeType: input.mimeType,
              },
            },
          ],
          { signal },
        );
        return parseExtraction(input.docType, result.response.text());
      });
    },
  };
}

function createGroqProvider(apiKey: string): DocumentExtractionProvider {
  const model = process.env.DOCUMENT_GROQ_MODEL ?? "qwen/qwen3.6-27b";
  const client = new Groq({ apiKey });
  return {
    name: "groq",
    model,
    async extractDocument(input) {
      if (input.mimeType === "application/pdf") {
        throw new DocumentProviderError(
          "File PDF belum dapat dibaca oleh layanan yang aktif. Unggah foto JPG atau PNG yang jelas.",
          false,
        );
      }
      return withTimeout(async (signal) => {
        const source = sharp(input.bytes).rotate();
        const metadata = await source.metadata();
        const preparedImage = await (metadata.width && metadata.width < 1600
          ? source.resize({ width: 1600, kernel: sharp.kernel.lanczos3 })
          : source)
          .sharpen({ sigma: 1 })
          .png({ compressionLevel: 8 })
          .toBuffer();
        const response = await client.chat.completions.create({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompts[input.docType] },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${preparedImage.toString("base64")}`,
                  detail: "high",
                },
              },
            ],
          }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_completion_tokens: 800,
        }, { signal });
        const content = response.choices[0]?.message?.content;
        if (!content) throw new DocumentProviderError("DOCUMENT_EXTRACTION_EMPTY", false);
        return parseExtraction(input.docType, content);
      });
    },
  };
}

export function createDocumentExtractionProviders(): DocumentExtractionProvider[] {
  const providers: DocumentExtractionProvider[] = [];
  if (process.env.OPENAI_API_KEY) providers.push(createOpenAiProvider(process.env.OPENAI_API_KEY));
  if (process.env.GEMINI_API_KEY) providers.push(createGeminiProvider(process.env.GEMINI_API_KEY));
  if (process.env.GROQ_API_KEY) providers.push(createGroqProvider(process.env.GROQ_API_KEY));
  return providers;
}
