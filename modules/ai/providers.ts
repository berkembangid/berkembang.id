import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";

import {
  parseProviderExtraction,
  type AiExtractionResult,
} from "@/modules/ai/schema";

type ProviderKeys = {
  groq?: string;
  openai?: string;
  gemini?: string;
};

const SYSTEM_PROMPT = `Anda mengekstrak transaksi UMKM Indonesia dari transkrip pengguna.

Aturan:
- Jangan menambah transaksi, nominal, kuantitas, atau detail yang tidak dinyatakan pengguna.
- Jika transaksi atau nominal tidak jelas, kembalikan items kosong.
- "50 ribu", "50rb", dan "50k" berarti 50000. "50 juta" dan "50jt" berarti 50000000.
- Tipe hanya "masuk" atau "keluar".
- Kategori hanya "Penjualan", "Bahan", "Operasional", "Gaji", atau "Lainnya".
- Kembalikan JSON saja.

Format:
{
  "transcription": "teks pengguna tanpa perubahan",
  "items": [
    {
      "item": "keterangan yang dinyatakan pengguna",
      "qty": "kuantitas yang dinyatakan atau string kosong",
      "type": "masuk atau keluar",
      "nominal": 50000,
      "kategori": "Penjualan atau Bahan atau Operasional atau Gaji atau Lainnya"
    }
  ]
}`;

function getProviderKeys(): ProviderKeys {
  return {
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
}

function parseJsonPayload(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function safeProviderWarning(provider: string, stage: string) {
  console.warn("AI provider attempt failed", { provider, stage });
}

async function extractTransactionsFromText(
  rawText: string,
  keys: ProviderKeys,
): Promise<AiExtractionResult | null> {
  const userMessage = `Transkrip pengguna:\n${rawText}`;

  if (keys.groq) {
    try {
      const groq = new Groq({ apiKey: keys.groq });
      const model = process.env.CAPTURE_GROQ_EXTRACTION_MODEL?.trim() || "openai/gpt-oss-20b";
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content
        ? parseProviderExtraction(parseJsonPayload(content), rawText)
        : null;
      if (parsed) return parsed;
    } catch {
      safeProviderWarning("groq", "extract");
    }
  }

  if (keys.openai) {
    try {
      const openai = new OpenAI({ apiKey: keys.openai });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content
        ? parseProviderExtraction(parseJsonPayload(content), rawText)
        : null;
      if (parsed) return parsed;
    } catch {
      safeProviderWarning("openai", "extract");
    }
  }

  if (keys.gemini) {
    try {
      const genAI = new GoogleGenerativeAI(keys.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([SYSTEM_PROMPT, userMessage]);
      const parsed = parseProviderExtraction(
        parseJsonPayload(result.response.text()),
        rawText,
      );
      if (parsed) return parsed;
    } catch {
      safeProviderWarning("gemini", "extract");
    }
  }

  return null;
}

function fileExtensionForMime(mimeType: string) {
  if (mimeType === "audio/mp4") return "mp4";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  return "webm";
}

export async function processTextWithAi(
  rawText: string,
): Promise<AiExtractionResult | null> {
  return extractTransactionsFromText(rawText, getProviderKeys());
}

export async function processAudioWithAi(
  audioFile: File,
  mimeType: string,
): Promise<AiExtractionResult | null> {
  const keys = getProviderKeys();
  const fileName = `recording.${fileExtensionForMime(mimeType)}`;

  if (keys.groq) {
    try {
      const groq = new Groq({ apiKey: keys.groq });
      const file = new File([await audioFile.arrayBuffer()], fileName, {
        type: mimeType,
      });
      const transcription = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        language: "id",
      });
      const rawText = transcription.text?.trim();
      if (rawText) {
        const extracted = await extractTransactionsFromText(rawText, keys);
        if (extracted) return extracted;
      }
    } catch {
      safeProviderWarning("groq", "transcribe");
    }
  }

  if (keys.openai) {
    try {
      const openai = new OpenAI({ apiKey: keys.openai });
      const file = new File([await audioFile.arrayBuffer()], fileName, {
        type: mimeType,
      });
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "id",
      });
      const rawText = transcription.text?.trim();
      if (rawText) {
        const extracted = await extractTransactionsFromText(rawText, keys);
        if (extracted) return extracted;
      }
    } catch {
      safeProviderWarning("openai", "transcribe");
    }
  }

  if (keys.gemini) {
    try {
      const genAI = new GoogleGenerativeAI(keys.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64Audio = Buffer.from(await audioFile.arrayBuffer()).toString("base64");
      const result = await model.generateContent([
        SYSTEM_PROMPT,
        { inlineData: { data: base64Audio, mimeType } },
      ]);
      const extracted = parseProviderExtraction(
        parseJsonPayload(result.response.text()),
      );
      if (extracted) return extracted;
    } catch {
      safeProviderWarning("gemini", "transcribe");
    }
  }

  return null;
}
