import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  createCaptureRecord,
  createCaptureUploadSession,
  type CaptureUploadSession,
  type CreatedCapture,
} from "@/modules/ledger/capture-repository";
import {
  CaptureOperationError,
  captureErrorResponse,
  captureValidationErrorResponse,
} from "@/modules/ledger/capture-errors";
import {
  createCaptureRequestSchema,
  idempotencyKeySchema,
  type CreateCaptureRequest,
} from "@/modules/ledger/capture-schema";
import {
  buildDrafts,
  buildQuestions,
  captureSubmittedEvent,
  chooseCapturePath,
  clientServerDivergence,
  clientTranscriptMinConfidence,
  draftReturnedEvent,
} from "@/modules/ledger/capture-routing";
import { parseUtterance, type KeywordEntry } from "@/modules/nominal-parser";
import { categoryKeywordsForSector, sectorForCurrentUser } from "@/modules/ledger/category-keywords";

type AuthenticatedUser = { id: string };

export type CreateCaptureRouteDependencies = {
  authenticate: () => Promise<AuthenticatedUser | null>;
  createCapture: (
    input: CreateCaptureRequest,
    idempotencyKey: string,
    capturePath?: "TEXT_ONLY" | "WHISPER",
  ) => Promise<CreatedCapture>;
  createUploadSession: (path: string) => Promise<CaptureUploadSession>;
  minConfidence?: number;
  now?: Date;
  /** Disuntik uji; produksi membacanya dari `category_templates`. */
  keywords?: readonly KeywordEntry[];
};

const defaultDependencies: CreateCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  createCapture: createCaptureRecord,
  createUploadSession: createCaptureUploadSession,
};

/**
 * Batas audio untuk jalur suara: 15 detik, 500 KB.
 *
 * Lebih ketat daripada batas 10 MiB yang berlaku umum, dan itu disengaja.
 * Klip pendek menekan biaya transkripsi, mempercepat draf, dan membatasi
 * seberapa banyak percakapan sekitar ikut terekam di tempat usaha.
 */
const maxVoiceAudioBytes = 500 * 1024;

export async function handleCreateCaptureRequest(
  request: Request,
  dependencies: CreateCaptureRouteDependencies = defaultDependencies,
) {
  const startedAt = Date.now();
  try {
    const user = await dependencies.authenticate();
    if (!user) return captureErrorResponse(new CaptureOperationError("UNAUTHENTICATED"));

    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotencyKey.success) return captureValidationErrorResponse(idempotencyKey.error);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return captureValidationErrorResponse();
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "file" in body &&
      typeof body.file === "object" &&
      body.file !== null
    ) {
      const file = body.file as { mimeType?: unknown; size?: unknown };
      if (typeof file.size === "number" && file.size > maxVoiceAudioBytes) {
        return captureErrorResponse(new CaptureOperationError("FILE_TOO_LARGE"));
      }
      if (
        typeof file.mimeType === "string" &&
        !["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"].includes(file.mimeType)
      ) {
        return captureErrorResponse(new CaptureOperationError("UNSUPPORTED_MEDIA_TYPE"));
      }
    }

    const parsedBody = createCaptureRequestSchema.safeParse(body);
    if (!parsedBody.success) return captureValidationErrorResponse(parsedBody.error);
    const input = parsedBody.data;

    // Layar Catat memakai jalur yang sama untuk ketikan: transkrip dengan
    // engine "typed" dan keyakinan penuh. Satu router, satu perilaku.
    const transcript =
      input.clientTranscript ??
      (input.inputMethod === "manual" && input.sourceText
        ? { text: input.sourceText, confidence: 1, engine: "typed" }
        : null);

    const minConfidence = dependencies.minConfidence ?? clientTranscriptMinConfidence();

    // Kata kunci kategori berasal dari `category_templates`, bukan dari tabel
    // bawaan parser. Tanpa ini, menambah kata benda alat baru di basis data
    // tidak pernah mengubah apa pun -- persis kenapa "meja" tidak pernah
    // terbaca sebagai alat usaha.
    // Gagal membaca tabel referensi TIDAK BOLEH menggagalkan pencatatan.
    // Pemilik yang sedang mengetik transaksi tidak peduli tabel kata kunci
    // sedang tak terbaca; parser punya tabel bawaannya sendiri, dan yang
    // hilang paling jauh hanyalah tebakan kategori yang bisa ia betulkan
    // sendiri di layar konfirmasi.
    let keywords: readonly KeywordEntry[] = dependencies.keywords ?? [];
    if (!dependencies.keywords) {
      try {
        keywords = await categoryKeywordsForSector(await sectorForCurrentUser(user.id));
      } catch {
        keywords = [];
      }
    }

    const routing = chooseCapturePath({
      transcript,
      hasAudio: Boolean(input.file),
      minConfidence,
      ...(keywords.length > 0 ? { keywords } : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });

    if (routing.path === null) {
      return captureValidationErrorResponse();
    }

    const capture = await dependencies.createCapture(input, idempotencyKey.data, routing.path);

    // Jalur teks tidak pernah mengunggah audio dan tidak pernah memanggil
    // Whisper. Itulah seluruh alasan jalur ini ada.
    const upload =
      routing.path === "WHISPER" && capture.status === "draft" && capture.storagePath
        ? await dependencies.createUploadSession(capture.storagePath)
        : null;

    let drafts: ReturnType<typeof buildDrafts> = [];
    let questions: ReturnType<typeof buildQuestions> = [];
    if (routing.path === "TEXT_ONLY") {
      const parsed = parseUtterance(routing.transcript, {
        ...(keywords.length > 0 ? { keywords } : {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
      });
      drafts = buildDrafts(parsed, routing.transcriptConfidence, minConfidence);
      questions = buildQuestions(drafts);
    }

    const processingMs = Date.now() - startedAt;
    console.info(
      JSON.stringify(
        captureSubmittedEvent({
          path: routing.path,
          hasTranscript: transcript !== null,
          hasAudio: Boolean(input.file),
        }),
      ),
    );
    if (routing.path === "TEXT_ONLY") {
      console.info(
        JSON.stringify(draftReturnedEvent({ drafts, path: routing.path, processingMs })),
      );
    }

    return Response.json(
      {
        data: {
          capture,
          upload,
          path: routing.path,
          drafts,
          questions,
          divergence: clientServerDivergence(input.clientHints, drafts),
          processingMs,
        },
      },
      { status: capture.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return captureErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return handleCreateCaptureRequest(request);
}
