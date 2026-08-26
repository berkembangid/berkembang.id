import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  processAudioWithAi,
  processTextWithAi,
} from "@/modules/ai/providers";
import {
  textRequestSchema,
  type AiExtractionResult,
} from "@/modules/ai/schema";

const DEFAULT_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
]);

type AuthenticatedUser = { id: string };

export type TranscribeRouteDependencies = {
  authenticate: () => Promise<AuthenticatedUser | null>;
  processText: (text: string) => Promise<AiExtractionResult | null>;
  processAudio: (
    file: File,
    mimeType: string,
  ) => Promise<AiExtractionResult | null>;
  maxAudioBytes: number;
};

const defaultDependencies: TranscribeRouteDependencies = {
  authenticate: getAuthenticatedUser,
  processText: processTextWithAi,
  processAudio: processAudioWithAi,
  maxAudioBytes: getMaxAudioBytes(),
};

function getMaxAudioBytes() {
  const configured = Number(process.env.AI_MAX_AUDIO_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_AUDIO_BYTES;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
) {
  return Response.json(
    {
      status: "failed",
      error: {
        code,
        message,
        retryable,
        requestId: crypto.randomUUID(),
      },
      transactions: [],
    },
    { status },
  );
}

function aiFailureResponse() {
  return errorResponse(
    502,
    "AI_PROCESSING_FAILED",
    "Rekaman belum dapat diproses. Silakan coba lagi atau gunakan input manual.",
    true,
  );
}

function successResponse(result: AiExtractionResult) {
  return Response.json({
    status: "needs_review",
    transcription: result.transcription,
    transactions: result.transactions,
  });
}

export async function handleTranscribeRequest(
  request: Request,
  dependencies: TranscribeRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.authenticate();
    if (!user) {
      return errorResponse(
        401,
        "UNAUTHENTICATED",
        "Sesi berakhir. Silakan masuk kembali.",
      );
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return errorResponse(
          400,
          "VALIDATION_FAILED",
          "Format permintaan tidak valid.",
        );
      }

      const parsedBody = textRequestSchema.safeParse(body);
      if (!parsedBody.success) {
        return errorResponse(
          400,
          "VALIDATION_FAILED",
          "Teks wajib diisi dan maksimal 500 karakter.",
        );
      }

      const result = await dependencies.processText(parsedBody.data.text);
      return result ? successResponse(result) : aiFailureResponse();
    }

    if (!contentType.includes("multipart/form-data")) {
      return errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Gunakan file audio WebM, MP4, OGG, atau MP3.",
      );
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > dependencies.maxAudioBytes + 1024 * 1024
    ) {
      return errorResponse(
        413,
        "FILE_TOO_LARGE",
        "Ukuran rekaman melebihi batas yang diizinkan.",
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return errorResponse(
        400,
        "VALIDATION_FAILED",
        "Form audio tidak dapat dibaca.",
      );
    }

    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return errorResponse(
        400,
        "VALIDATION_FAILED",
        "File audio wajib diunggah.",
      );
    }

    const normalizedMimeType = audio.type.toLowerCase().split(";", 1)[0];
    if (!ALLOWED_AUDIO_MIME_TYPES.has(normalizedMimeType)) {
      return errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Gunakan file audio WebM, MP4, OGG, atau MP3.",
      );
    }

    if (audio.size > dependencies.maxAudioBytes) {
      return errorResponse(
        413,
        "FILE_TOO_LARGE",
        "Ukuran rekaman melebihi batas yang diizinkan.",
      );
    }

    const result = await dependencies.processAudio(audio, normalizedMimeType);
    return result ? successResponse(result) : aiFailureResponse();
  } catch {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Layanan belum tersedia. Silakan coba lagi.",
      true,
    );
  }
}

export async function POST(request: Request) {
  return handleTranscribeRequest(request);
}
