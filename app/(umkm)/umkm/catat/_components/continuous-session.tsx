"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CloudOff, LoaderCircle, Mic, Send, Square } from "lucide-react";
import { notifyFromError, notifyInfo } from "@/lib/notify";
import { submitVoiceSegment, segmentSummary } from "../_lib/capture-pipeline";
import { ContinuousRecorder, keepScreenOn, screenWakeLockSupported } from "../_lib/continuous-recorder";
import { createSegmentQueue } from "../_lib/segment-queue";

/** Batas potongan per sesi -- pengaman biaya pembacaan bila mikrofon tertinggal menyala. */
const MAX_SEGMENTS = 200;

/** Capture dari sesi ini, supaya halaman periksa tahu mana yang baru. */
export const CONTINUOUS_SESSION_STORAGE_KEY = "berkembang:catat-sesi";

type SegmentRow = {
  localId: number;
  status: "sending" | "processing" | "ready" | "failed" | "offline" | "still";
  summary?: string;
  message?: string;
};

function rememberCapture(captureId: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(CONTINUOUS_SESSION_STORAGE_KEY) ?? "[]");
    localStorage.setItem(CONTINUOUS_SESSION_STORAGE_KEY, JSON.stringify([captureId, ...list.filter((id) => id !== captureId)].slice(0, MAX_SEGMENTS)));
  } catch {
    // Penyimpanan peramban mati: halaman periksa tetap menampilkan semua yang belum diperiksa.
  }
}

/**
 * Mode catat terus-menerus: sambil berjualan.
 *
 * Mikrofon tetap terbuka; setiap penjualan yang diucapkan lalu disusul hening
 * sebentar menjadi satu catatan yang dibaca di belakang. Hasilnya menumpuk di
 * daftar dan diperiksa belakangan di /umkm/catat/periksa -- tidak ada yang
 * masuk buku kas sebelum dilihat pemiliknya.
 */
export function ContinuousSession({ onExit }: { onExit: () => void }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const recorderRef = useRef<ContinuousRecorder | null>(null);
  const releaseWakeLockRef = useRef<(() => void) | null>(null);
  const nextIdRef = useRef(1);
  const lastLevelAtRef = useRef(0);

  const update = useCallback((localId: number, patch: Partial<SegmentRow>) => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }, []);

  // Dibuat sekali; `update` stabil, jadi penutupnya tidak basi.
  const [queue] = useState(() => createSegmentQueue<{ localId: number; blob: Blob; mimeType: string }>(async ({ localId, blob, mimeType }) => {
    const result = await submitVoiceSegment(blob, mimeType, (stage, captureId) => {
      if (captureId) rememberCapture(captureId);
      update(localId, { status: stage === "sending" ? "sending" : "processing" });
    });
    if (result.kind === "ready") update(localId, { status: "ready", summary: segmentSummary(result.capture) });
    else if (result.kind === "still_processing") update(localId, { status: "still" });
    else if (result.kind === "saved_offline") update(localId, { status: "offline" });
    else update(localId, { status: "failed", message: result.message });
  }, 2));

  const stopSession = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    releaseWakeLockRef.current?.();
    releaseWakeLockRef.current = null;
    setRunning(false);
    setSpeaking(false);
    setLevel(0);
  }, []);

  useEffect(() => () => stopSession(), [stopSession]);

  const startSession = async () => {
    setStarting(true);
    const recorder = new ContinuousRecorder({
      onSegment: (blob, mimeType) => {
        const localId = nextIdRef.current;
        if (localId > MAX_SEGMENTS) {
          stopSession();
          notifyInfo("Sesi dijeda", { description: `Sudah ${MAX_SEGMENTS} catatan. Periksa dulu, lalu mulai sesi baru.` });
          return;
        }
        nextIdRef.current += 1;
        setRows((current) => [{ localId, status: "sending" }, ...current]);
        queue.push({ localId, blob, mimeType });
      },
      onLevel: (value, isSpeaking) => {
        // Sepuluh kali sedetik cukup untuk mata, dan hemat baterai ponsel.
        const now = performance.now();
        if (now - lastLevelAtRef.current < 100) return;
        lastLevelAtRef.current = now;
        setLevel(value);
        setSpeaking(isSpeaking);
      },
      onAutoPause: () => {
        stopSession();
        notifyInfo("Sesi dijeda otomatis", { description: "Sepuluh menit tanpa ucapan. Tekan « Mulai » untuk melanjutkan." });
      },
    });
    try {
      await recorder.start();
      recorderRef.current = recorder;
      releaseWakeLockRef.current = await keepScreenOn();
      setRunning(true);
    } catch (error) {
      recorder.stop();
      notifyFromError(error, "Mikrofon belum bisa dibuka. Izinkan akses mikrofon di peramban, lalu coba lagi.");
    } finally {
      setStarting(false);
    }
  };

  const finish = () => {
    stopSession();
    router.push("/umkm/catat/periksa");
  };

  const readyCount = rows.filter((row) => row.status === "ready").length;
  const busyCount = rows.filter((row) => row.status === "sending" || row.status === "processing").length;
  const bars = Array.from({ length: 12 }, (_, index) => Math.max(0.08, Math.min(1, level * 6 * (0.6 + ((index * 7) % 5) / 10))));

  return (
    <section aria-labelledby="catat-terus" className="space-y-4">
      <div className={`rounded-3xl border p-5 text-center shadow-[0_8px_28px_rgba(27,42,58,.06)] ${running ? "border-umkm-brand-line bg-umkm-brand-soft" : "border-umkm-line bg-white"}`}>
        <h2 id="catat-terus" className="text-base font-bold text-umkm-ink">
          {!running ? "Catat sambil berjualan" : speaking ? "Merekam penjualan…" : "Mendengarkan…"}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-umkm-subtle">
          Sebut satu penjualan, lalu diam sebentar. Setiap penjualan dibaca di belakang dan menunggu Anda periksa — tidak ada yang langsung masuk buku kas.
        </p>

        {running && (
          <div className="mx-auto mt-4 flex h-12 max-w-xs items-end justify-center gap-1" aria-hidden>
            {bars.map((value, index) => (
              <span key={index} className={`w-2 rounded-full transition-[height] duration-100 ${speaking ? "bg-umkm-brand" : "bg-umkm-brand-line"}`} style={{ height: `${value * 100}%` }} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {!running ? (
            <button
              type="button"
              onClick={() => void startSession()}
              disabled={starting}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-umkm-brand px-6 text-sm font-bold text-white disabled:opacity-60"
            >
              {starting ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Mic size={18} aria-hidden />}
              {rows.length > 0 ? "Lanjutkan" : "Mulai"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => recorderRef.current?.sendNow()}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-umkm-brand px-5 text-sm font-bold text-white"
              >
                <Send size={16} aria-hidden /> Kirim sekarang
              </button>
              <button
                type="button"
                onClick={stopSession}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-umkm-line bg-white px-5 text-sm font-bold text-umkm-ink"
              >
                <Square size={14} aria-hidden /> Jeda
              </button>
            </>
          )}
        </div>

        {running && !screenWakeLockSupported() && (
          <p className="mt-3 text-xs text-umkm-warning">Jaga layar tetap menyala — rekaman berhenti bila layar terkunci.</p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-umkm-line bg-white shadow-[0_8px_28px_rgba(27,42,58,.04)]">
          <div className="flex items-center justify-between gap-3 border-b border-umkm-line-soft px-4 py-3">
            <p className="text-xs font-bold text-umkm-ink">
              {readyCount} siap diperiksa{busyCount > 0 ? ` · ${busyCount} sedang dibaca` : ""}
            </p>
            <button type="button" onClick={finish} className="inline-flex min-h-11 items-center rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white">
              Selesai & periksa
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-umkm-line-soft overflow-y-auto" aria-live="polite">
            {rows.map((row) => (
              <li key={row.localId} className="flex items-center gap-3 px-4 py-2.5">
                <SegmentIcon status={row.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-umkm-ink">
                    {row.status === "ready" ? row.summary
                      : row.status === "sending" ? "Mengirim rekaman…"
                      : row.status === "processing" ? "Sedang dibaca…"
                      : row.status === "still" ? "Masih dibaca — hasilnya muncul di halaman periksa"
                      : row.status === "offline" ? "Tersimpan di ponsel, dikirim saat sinyal kembali"
                      : row.message ?? "Belum dapat dibaca"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-umkm-subtle">#{row.localId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => { stopSession(); onExit(); }} className="min-h-11 text-xs font-bold text-umkm-subtle underline">
        Kembali ke catat sekali
      </button>
    </section>
  );
}

function SegmentIcon({ status }: { status: SegmentRow["status"] }) {
  if (status === "ready") return <CheckCircle2 size={16} className="shrink-0 text-umkm-success" aria-label="Siap diperiksa" />;
  if (status === "failed") return <AlertCircle size={16} className="shrink-0 text-umkm-danger" aria-label="Gagal" />;
  if (status === "offline") return <CloudOff size={16} className="shrink-0 text-umkm-warning" aria-label="Tersimpan di ponsel" />;
  return <LoaderCircle size={16} className="shrink-0 animate-spin text-umkm-brand" aria-label="Diproses" />;
}
