"use client";

import { useEffect, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { formatSeconds } from "../_lib/capture-items";

const BAR_COUNT = 12;

/**
 * Meter suara sungguhan.
 *
 * Gelombang lama adalah sembilan batang hiasan yang bergoyang sendiri, jadi
 * mikrofon yang mati atau tertutup jari tetap terlihat « mendengarkan » --
 * pemilik baru tahu setelah AI membaca rekaman kosong. Batang ini membaca
 * kekuatan suara yang benar-benar masuk.
 */
function useLevels(stream: MediaStream | null) {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.08));
  // Diam lebih dari lima detik: kemungkinan mikrofon salah atau tertutup.
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    if (!stream || typeof window === "undefined" || !("AudioContext" in window)) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let last = 0;
    let lastLoud = performance.now();
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      // Sepuluh kali sedetik cukup untuk mata, dan hemat baterai ponsel.
      if (time - last < 100) return;
      last = time;
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const next = Array.from({ length: BAR_COUNT }, (_, index) => Math.max(0.08, (data[index * step] ?? 0) / 255));
      if (next.some((level) => level > 0.25)) lastLoud = time;
      setLevels(next);
      setQuiet(time - lastLoud > 5000);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);
  return { levels, quiet };
}

export function RecordingCard({ seconds, maxSeconds, stream, onStop, onCancel }: {
  seconds: number;
  maxSeconds: number;
  stream: MediaStream | null;
  onStop: () => void;
  onCancel: () => void;
}) {
  const { levels, quiet } = useLevels(stream);
  const remaining = Math.max(0, maxSeconds - seconds);

  return (
    <div className="animate-fade-in space-y-5 rounded-3xl border border-umkm-line bg-white p-8 text-center shadow-card">
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-20 place-items-center rounded-full border-4 border-umkm-sky bg-umkm-brand-tint text-umkm-brand-hover" aria-hidden>
          <Mic size={36} />
        </div>
        <div role="status" aria-live="polite">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-umkm-brand-line bg-umkm-brand-soft px-3 py-1">
            <span className="size-2 animate-ping rounded-full bg-umkm-danger" aria-hidden />
            <span className="font-mono text-xs font-bold text-umkm-brand" aria-hidden>{formatSeconds(seconds)}</span>
          </div>
          <h2 className="font-headline text-xl font-bold text-umkm-brand">Sedang mendengarkan…</h2>
          <p className="mt-1 text-xs text-umkm-muted">
            {quiet
              ? "Suara Anda belum terdengar. Dekatkan ponsel, atau periksa izin mikrofon."
              : "Ceritakan semua transaksinya, lalu tekan Selesai."}
          </p>
        </div>
      </div>

      <div aria-hidden className="flex h-12 items-center justify-center gap-1.5">
        {levels.map((level, index) => (
          <div key={index} className="w-1.5 rounded-full bg-umkm-sky transition-[height] duration-100" style={{ height: `${Math.round(level * 100)}%` }} />
        ))}
      </div>

      {remaining <= 20 && <p className="text-xs font-semibold text-umkm-warning">Rekaman berhenti sendiri dalam {remaining} detik.</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-umkm-line px-6 text-xs font-bold text-umkm-muted hover:bg-umkm-surface">
          <X size={14} aria-hidden /> Batal, jangan kirim
        </button>
        <button type="button" onClick={onStop} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-umkm-brand px-8 text-xs font-bold text-white shadow-md hover:bg-umkm-brand-deep">
          <Square size={14} className="fill-current" aria-hidden /> Selesai berbicara
        </button>
      </div>
    </div>
  );
}
