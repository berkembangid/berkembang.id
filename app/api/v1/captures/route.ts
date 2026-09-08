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
  maxReceiptImageBytes,
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
  type CapturePath,
} from "@/modules/ledger/capture-routing";
import { parseUtterance, type KeywordEntry } from "@/modules/nominal-parser";
import { categoryKeywordsForSector, sectorForCurrentUser } from "@/modules/ledger/category-keywords";
import { featureFlagEnabled } from "@/modules/platform/feature-flags";

type AuthenticatedUser = { id: string };

export type CreateCaptureRouteDependencies = {
  authenticate: () => Promise<AuthenticatedUser | null>;
  createCapture: (
    input: CreateCaptureRequest,
    idempotencyKey: string,
    capturePath?: CapturePath,
  ) => Promise<CreatedCapture>;
  createUploadSession: (path: string) => Promise<CaptureUploadSession>;
  /**
   * Sakelar `capture_camera`. Fitur baru: gagal baca berarti tertutup.
   * Opsional supaya uji jalur suara tidak perlu tahu soal kamera sama sekali.
   */
  cameraEnabled?: () => Promise<boolean>;
  minConfidence?: number;
  now?: Date;
  /** Disuntik uji; produksi membacanya dari `category_templates`. */
  keywords?: readonly KeywordEntry[];
};

const defaultDependencies: CreateCaptureRouteDependencies = {
  authenticate: getAuthenticatedUser,
  createCapture: createCaptureRecord,
  createUploadSession: createCaptureUploadSession,
  cameraEnabled: () => featureFlagEnabled("capture_camera"),
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
      const isImage =
        typeof file.mimeType === "string" && ["image/jpeg", "image/png"].includes(file.mimeType);
      const limit = isImage ? maxReceiptImageBytes : maxVoiceAudioBytes;
      if (typeof file.size === "number" && file.size > limit) {
        return captureErrorResponse(new CaptureOperationError("FILE_TOO_LARGE"));
      }
      if (
        typeof file.mimeType === "string" &&
        !["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "image/jpeg", "image/png"].includes(
          file.mimeType,
        )
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

    // Foto nota tidak melewati router jalur. Router memilih antara transkrip
    // peramban dan audio; foto tidak punya keduanya, dan jalurnya sudah pasti
    // OCR sejak sebelum apa pun dibaca.
    //
    // Yang TIDAK boleh berbeda dari jalur audio adalah bentuk jawabannya.
    // Foto perlu tempat untuk diunggah persis seperti rekaman; tanpa sesi
    // unggah, capture-nya lahir dengan `storagePath` yang tidak akan pernah
    // terisi, dan pekerja OCR menunggu berkas yang tidak pernah datang.
    if (input.inputMethod === "camera") {
      const cameraEnabled = dependencies.cameraEnabled ?? (() => featureFlagEnabled("capture_camera"));
      if (!(await cameraEnabled())) {
        return captureErrorResponse(new CaptureOperationError("CAPTURE_PATH_DISABLED"));
      }
      const capture = await dependencies.createCapture(input, idempotencyKey.data, "OCR");
      const upload =
        capture.status === "draft" && capture.storagePath
          ? await dependencies.createUploadSession(capture.storagePath)
          : null;

      console.info(
        JSON.stringify(
          captureSubmittedEvent({ path: "OCR", hasTranscript: false, hasAudio: false }),
        ),
      );

      return Response.json(
        {
          data: {
            capture,
            upload,
            path: "OCR" as const,
            // Draf lahir setelah fotonya dibaca, bukan sekarang. Mengembalikan
            // daftar kosong -- bukan menghilangkan bidangnya -- membuat klien
            // memakai satu bentuk jawaban untuk ketiga jalur.
            drafts: [],
            questions: [],
            processingMs: Date.now() - startedAt,
          },
        },
        { status: capture.idempotent ? 200 : 201 },
      );
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
