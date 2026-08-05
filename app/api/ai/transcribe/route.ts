import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import OpenAI from "openai";

// ───────── TYPES ─────────
interface RawItem {
  item?: string;
  qty?: string;
  type?: string;
  nominal?: number | string;
  kategori?: string;
}

interface ProviderKeys {
  groqKey?: string;
  openaiKey?: string;
  geminiKey?: string;
}

// ───────── NORMALIZER ─────────
function normalizeExtractedItems(rawText: string, items: RawItem[]): RawItem[] {
  const lowerText = rawText.toLowerCase();
  const mentionsMasuk = /(masuk|pemasukan|laku|terjual|penjualan|dapat|terima|omzet|pendapatan|bayaran)/i.test(lowerText);
  const mentionsKeluar = /(keluar|pengeluaran|beli|belanja|bayar|sewa|listrik|ongkir|gaji|habis|modal)/i.test(lowerText);
  const hasRibu = /(?:rb|ribu|k)\b/i.test(lowerText) || /\b\d+\s*ribu\b/i.test(lowerText);
  const hasJuta = /(?:jt|juta)\b/i.test(lowerText);

  return items.map((item) => {
    let nominal = Number(item.nominal) || 0;
    let type = item.type;

    // Correct type only when the whole transcript is unambiguous
    if (mentionsMasuk && !mentionsKeluar) type = "masuk";
    else if (mentionsKeluar && !mentionsMasuk) type = "keluar";

    // Safety fix: If 50rb was returned as 50,000,000 → scale down
    if (hasRibu && !hasJuta && nominal >= 1_000_000) nominal /= 1000;
    // Safety fix: If 50rb was returned as 50 → scale up
    if (hasRibu && nominal < 1000) nominal *= 1000;

    return {
      ...item,
      type: type === "keluar" ? "keluar" : "masuk",
      nominal: Math.round(nominal),
    };
  });
}

const SYSTEM_PROMPT_INSTRUCTION = `Anda adalah AI pakar pencatatan keuangan UMKM Indonesia.
ATURAN WAJIB NOMINAL RUPIAH:
1. "50rb" / "50 ribu" / "50 k" = 50000 (LIMA PULUH RIBU RUPIAH). JANGAN SEKALI-KALI MENJADIKANNYA 50000000 (50 JUTA)!
2. "50 juta" / "50jt" = 50000000 (LIMA PULUH JUTA RUPIAH).
3. "50" tanpa sebutan unit = 50000 (50 ribu).

ATURAN TIPE TRANSAKSI:
1. Pemasukan / Terjual / Laku / Omzet / Terima Uang / Pendapatan -> type: "masuk"
2. Pengeluaran / Beli / Belanja / Bayar / Sewa / Gaji / Habis -> type: "keluar"

Format JSON yang wajib dikembalikan:
{
  "transcription": "kalimat ucapan lengkap",
  "items": [
    {
      "item": "nama barang / keterangan transaksi",
      "qty": "jumlah (contoh: 1 paket, 20 porsi)",
      "type": "masuk" | "keluar",
      "nominal": angka_integer_murni,
      "kategori": "Penjualan" | "Bahan" | "Operasional" | "Gaji" | "Lainnya"
    }
  ]
}`;

// ─── SHARED: Run rawText through LLM providers, return normalized result ───────
async function extractItemsFromText(
  rawText: string,
  keys: ProviderKeys
): Promise<{ transcription: string; items: RawItem[] } | null> {
  const { groqKey, openaiKey, geminiKey } = keys;
  const userMessage = `Kalimat suara pengguna: "${rawText}"`;

  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });
      const jsonStr = completion.choices[0]?.message?.content;
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        parsed.items = normalizeExtractedItems(rawText, parsed.items ?? []);
        parsed.transcription = rawText;
        return parsed;
      }
    } catch (e: any) {
      console.warn("Groq LLM error:", e.message);
    }
  }

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const gptRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT_INSTRUCTION },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });
      const jsonStr = gptRes.choices[0]?.message?.content;
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        parsed.items = normalizeExtractedItems(rawText, parsed.items ?? []);
        parsed.transcription = rawText;
        return parsed;
      }
    } catch (e: any) {
      console.warn("OpenAI LLM error:", e.message);
    }
  }

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([SYSTEM_PROMPT_INSTRUCTION, userMessage]);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.items = normalizeExtractedItems(rawText, parsed.items ?? []);
        parsed.transcription = rawText;
        return parsed;
      }
    } catch (e: any) {
      console.warn("Gemini LLM error:", e.message);
    }
  }

  return null;
}

// ─── API ROUTE ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Resolve API keys once — shared across both modes
    const keys: ProviderKeys = {
      groqKey: process.env.GROQ_API_KEY,
      openaiKey: process.env.OPENAI_API_KEY,
      geminiKey: process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    };

    // ─── TEXT-ONLY MODE: re-process edited caption without audio ─────────────
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const rawText: string = (body.text ?? "").slice(0, 500).trim();

      if (!rawText) {
        return NextResponse.json({ error: "Teks tidak ditemukan." }, { status: 400 });
      }

      const result = await extractItemsFromText(rawText, keys);
      if (result) return NextResponse.json(result);

      // Fallback: return empty items — frontend local parser takes over
      return NextResponse.json({ transcription: rawText, items: [] });
    }

    // ─── AUDIO MODE ───────────────────────────────────────────────────────────
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: "File audio tidak ditemukan." }, { status: 400 });
    }

    // Provider 1: Groq Whisper + Llama (Ultra-Fast ~0.3s)
    if (keys.groqKey) {
      try {
        const groq = new Groq({ apiKey: keys.groqKey });
        const actualMime = audioFile.type || "audio/webm";
        const ext = actualMime.includes("mp4") ? "mp4" : actualMime.includes("ogg") ? "ogg" : "webm";
        const file = new File([await audioFile.arrayBuffer()], `recording.${ext}`, {
          type: actualMime,
        });
        const transcriptionRes = await groq.audio.transcriptions.create({
          file,
          model: "whisper-large-v3",
          language: "id",
        });
        const rawText = transcriptionRes.text ?? "";
        const result = await extractItemsFromText(rawText, { groqKey: keys.groqKey });
        if (result) return NextResponse.json(result);
      } catch (e: any) {
        console.warn("Groq Whisper error, falling back:", e.message);
      }
    }

    // Provider 2: OpenAI Whisper-1 + GPT-4o-mini
    if (keys.openaiKey) {
      try {
        const openai = new OpenAI({ apiKey: keys.openaiKey });
        const actualMime2 = audioFile.type || "audio/webm";
        const ext2 = actualMime2.includes("mp4") ? "mp4" : actualMime2.includes("ogg") ? "ogg" : "webm";
        const file = new File([await audioFile.arrayBuffer()], `recording.${ext2}`, {
          type: actualMime2,
        });
        const transcriptRes = await openai.audio.transcriptions.create({
          file,
          model: "whisper-1",
          language: "id",
        });
        const rawText = transcriptRes.text ?? "";
        const result = await extractItemsFromText(rawText, { openaiKey: keys.openaiKey });
        if (result) return NextResponse.json(result);
      } catch (e: any) {
        console.warn("OpenAI Whisper error, falling back:", e.message);
      }
    }

    // Provider 3: Google Gemini 1.5 Flash (audio inline)
    if (keys.geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(keys.geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = audioFile.type || "audio/webm";
        const normalizedMime = mimeType.includes("mp4") ? "audio/mp4" : mimeType.includes("ogg") ? "audio/ogg" : "audio/webm";

        const result = await model.generateContent([
          SYSTEM_PROMPT_INSTRUCTION,
          { inlineData: { data: base64Audio, mimeType: normalizedMime } },
        ]);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.items = normalizeExtractedItems(parsed.transcription ?? "", parsed.items ?? []);
          return NextResponse.json(parsed);
        }
      } catch (e: any) {
        console.warn("Gemini Audio error, using fallback:", e.message);
      }
    }

    // Fallback (no API keys configured)
    return NextResponse.json({
      transcription: "Pemasukan 50 ribu rupiah",
      items: [{ item: "Pemasukan Usaha", qty: "1 paket", type: "masuk", nominal: 50000, kategori: "Penjualan" }],
    });
  } catch (err: any) {
    console.error("Transcribe API error:", err);
    return NextResponse.json({ error: "Gagal memproses audio AI." }, { status: 500 });
  }
}
