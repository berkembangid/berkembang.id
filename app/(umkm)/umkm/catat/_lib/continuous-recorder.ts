import { createSegmenter, rms, type SegmenterConfig } from "./voice-segmenter";

/**
 * Perekam untuk mode catat terus-menerus.
 *
 * Satu mikrofon tetap terbuka selama sesi. Rekamannya dipotong-potong:
 * setiap kali pemotong ucapan (`voice-segmenter.ts`) memutuskan satu penjualan
 * selesai, `MediaRecorder` yang berjalan dihentikan dan yang baru LANGSUNG
 * dimulai pada aliran yang sama. Karena perekam selalu berjalan, suku kata
 * pertama ucapan berikutnya tidak pernah terpotong.
 *
 * Bitrate ditetapkan rendah (24 kbps): potongan 30 detik sekitar 90 KB, jauh
 * di bawah batas 500 KB rute capture, dan tetap jelas untuk dibaca mesin.
 */
export type ContinuousRecorderCallbacks = {
  onSegment: (blob: Blob, mimeType: string) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  /** Tidak ada ucapan selama `idleLimitMs`: sesi dijeda untuk menghemat baterai. */
  onAutoPause?: () => void;
};

type Segment = { recorder: MediaRecorder; chunks: Blob[]; hasSpeech: boolean };

/** Bagaimana potongan ditutup: dikirim bila berisi ucapan, selalu dikirim, atau dibuang. */
type CloseMode = "if_speech" | "always" | "discard";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];

export class ContinuousRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private current: Segment | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mimeType = "";
  private lastSpeechAt = 0;
  private segmenter;

  constructor(
    private readonly callbacks: ContinuousRecorderCallbacks,
    private readonly options: { segmenter?: Partial<SegmenterConfig>; idleLimitMs?: number } = {},
  ) {
    this.segmenter = createSegmenter(options.segmenter);
  }

  get active() {
    return this.stream !== null;
  }

  get mediaStream() {
    return this.stream;
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.mimeType = MIME_CANDIDATES.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
    this.segmenter = createSegmenter(this.options.segmenter);
    this.lastSpeechAt = Date.now();
    this.current = this.openSegment();

    const frameMs = this.options.segmenter?.frameMs ?? 50;
    const samples = new Float32Array(this.analyser.fftSize);
    this.timer = setInterval(() => this.tick(samples), frameMs);
  }

  /** Tombol « Kirim sekarang »: potong di sini, walau pemotong belum mendengar ucapan. */
  sendNow() {
    if (!this.current) return;
    this.segmenter.resetSegment();
    this.rotate("always");
  }

  /** Selesai: potongan yang sedang berisi ucapan tetap dikirim. */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const last = this.current;
    this.current = null;
    if (last) this.close(last, "if_speech");
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
  }

  private tick(samples: Float32Array) {
    if (!this.analyser || !this.current) return;
    this.analyser.getFloatTimeDomainData(samples as Float32Array<ArrayBuffer>);
    const level = rms(samples);
    const event = this.segmenter.push(level);
    if (event === "speech_start") this.current.hasSpeech = true;
    if (this.segmenter.speaking) this.lastSpeechAt = Date.now();
    this.callbacks.onLevel?.(level, this.segmenter.speaking);

    if (event === "cut" || event === "force_cut") this.rotate("if_speech");
    else if (event === "discard") this.rotate("discard");

    if (Date.now() - this.lastSpeechAt > (this.options.idleLimitMs ?? 10 * 60_000)) {
      this.stop();
      this.callbacks.onAutoPause?.();
    }
  }

  private openSegment(): Segment {
    const recorder = new MediaRecorder(this.stream as MediaStream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      audioBitsPerSecond: 24_000,
    });
    const segment: Segment = { recorder, chunks: [], hasSpeech: false };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) segment.chunks.push(event.data);
    };
    recorder.start(1000);
    return segment;
  }

  /** Tutup potongan berjalan dan langsung buka yang baru pada aliran yang sama. */
  private rotate(mode: CloseMode) {
    const previous = this.current;
    if (!previous || !this.stream) return;
    this.current = this.openSegment();
    this.close(previous, mode);
  }

  private close(segment: Segment, mode: CloseMode) {
    const send = mode === "always" || (mode === "if_speech" && segment.hasSpeech);
    segment.recorder.onstop = () => {
      if (!send || segment.chunks.length === 0) return;
      const type = segment.recorder.mimeType || this.mimeType || "audio/webm";
      this.callbacks.onSegment(new Blob(segment.chunks, { type }), type);
    };
    try {
      if (segment.recorder.state !== "inactive") segment.recorder.stop();
    } catch {
      // Perekam yang sudah berhenti sendiri tidak perlu dihentikan lagi.
    }
  }
}

/**
 * Menjaga layar tetap menyala selama sesi. Peramban di ponsel mematikan
 * mikrofon begitu layar terkunci, jadi tanpa ini rekaman berhenti diam-diam
 * saat pemilik sibuk melayani pembeli.
 */
export async function keepScreenOn(): Promise<() => void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
  if (!nav.wakeLock) return () => {};
  let sentinel: { release: () => Promise<void> } | null = null;
  const acquire = async () => {
    try { sentinel = await nav.wakeLock!.request("screen"); } catch { sentinel = null; }
  };
  // Kunci layar dilepas peramban setiap kali tab disembunyikan; minta lagi.
  const onVisible = () => {
    if (document.visibilityState === "visible") void acquire();
  };
  await acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => undefined);
  };
}

export function screenWakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}
