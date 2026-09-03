"use client";

/**
 * Ajakan memotret nota setelah catatan tersimpan.
 *
 * YANG DISIMPAN LEBIH DULU ADALAH CATATANNYA, BUKAN FOTONYA.
 *
 * Foto nota tidak pernah menjadi syarat tersimpannya sebuah catatan. Sinyal di
 * pasar hilang timbul, dan kalau unggahan yang gagal ikut menggagalkan
 * pencatatan, pemilik kehilangan angka yang sudah benar demi bukti yang bisa
 * menyusul kapan saja. Karena itu komponen ini hanya muncul SETELAH catatan
 * tersimpan, dan kegagalannya berbunyi "bukti belum terkirim" — bukan
 * "catatan gagal".
 *
 * Nomor nota tidak dibaca. Angkanya sudah datang dari ucapan atau ketikan
 * pemilik; foto di sini berperan sebagai bukti, bukan sebagai sumber angka.
 */

import { useRef, useState } from "react";
import { Camera, Check, RotateCw } from "lucide-react";
import { DocumentClientError } from "@/modules/documents/document-client";
import { uploadAndAttachEvidence } from "@/modules/documents/evidence-client";
import type { AttachmentTargetType } from "@/modules/documents/attachment-schema";
import type { DocumentType } from "@/modules/documents/document-schema";
import { savedSizeText } from "@/modules/ledger/evidence-nudge";

export type EvidenceTarget = { targetType: AttachmentTargetType; targetId: string };

type State = "idle" | "working" | "done" | "failed";

export function EvidencePrompt({
  targets,
  docType = "nota",
  title = "Foto notanya?",
  hint = "Boleh dilewati. Bukti ini yang nanti membuat catatan Anda bisa dipercaya pihak lain.",
  buttonLabel = "Foto nota",
  onAttached,
}: {
  targets: readonly EvidenceTarget[];
  docType?: DocumentType;
  title?: string;
  hint?: string;
  buttonLabel?: string;
  onAttached?: (documentId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [sizeText, setSizeText] = useState("");

  async function send(file: File) {
    setState("working");
    setMessage("");
    try {
      const result = await uploadAndAttachEvidence(file, targets, docType);
      setPending(null);
      setSizeText(savedSizeText(result.originalBytes, result.uploadedBytes));
      setState("done");
      onAttached?.(result.documentId);
    } catch (error) {
      // Fotonya disimpan di memori supaya "Coba lagi" tidak memaksa pemilik
      // memotret ulang nota yang mungkin sudah dibuang.
      setPending(file);
      setState("failed");
      setMessage(
        error instanceof DocumentClientError
          ? error.message
          : "Foto belum terkirim. Coba lagi ya.",
      );
    }
  }

  if (targets.length === 0) return null;

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-[#bde5c8] bg-[#f0faf3] px-3.5 py-3 text-[11px] font-bold text-[#1d6b39]">
        <Check size={14} className="shrink-0" /> Foto nota tersimpan.
        {sizeText && <span className="font-normal text-[#4a6280]">· {sizeText}</span>}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e3e9f0] bg-white px-3.5 py-3">
      <p className="text-xs font-bold text-[#1b2a3a]">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-[#4a6280]">{hint}</p>

      {state === "failed" && (
        <p className="mt-2 rounded-xl border border-[#f0d9a8] bg-[#fdf8ee] px-3 py-2 text-[11px] leading-relaxed text-[#8a6412]">
          {message} Catatannya sendiri sudah tersimpan.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />

      <button
        type="button"
        disabled={state === "working"}
        onClick={() => {
          if (state === "failed" && pending) {
            void send(pending);
            return;
          }
          inputRef.current?.click();
        }}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 py-2.5 text-xs font-bold text-[#0b5f86] transition-colors hover:bg-[#e3f3fb] disabled:opacity-60"
      >
        {state === "working" ? (
          <>
            <RotateCw size={14} className="shrink-0 animate-spin" /> Mengirim foto…
          </>
        ) : state === "failed" ? (
          <>
            <RotateCw size={14} className="shrink-0" /> Coba lagi
          </>
        ) : (
          <>
            <Camera size={14} className="shrink-0" /> {buttonLabel}
          </>
        )}
      </button>
    </div>
  );
}
