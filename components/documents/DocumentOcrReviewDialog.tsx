"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { FormDialog } from "@/components/ui/dialog";
import {
  documentTypeLabels,
  parseDocumentOcrResult,
  type DocumentOcrResult,
  type OcrDocumentType,
} from "@/modules/documents/document-schema";

type FieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  inputMode?: "text" | "numeric";
  type?: "text" | "date";
};

const fields: Record<OcrDocumentType, FieldDefinition[]> = {
  ktp: [
    { key: "nik", label: "NIK", required: true, inputMode: "numeric" },
    { key: "name", label: "Nama lengkap", required: true },
    { key: "placeOfBirth", label: "Tempat lahir" },
    { key: "dateOfBirth", label: "Tanggal lahir", type: "date" },
    { key: "address", label: "Alamat" },
  ],
  nib: [
    { key: "nib", label: "Nomor Induk Berusaha", required: true, inputMode: "numeric" },
    { key: "businessName", label: "Nama usaha" },
    { key: "ownerName", label: "Nama pemilik" },
    { key: "businessAddress", label: "Alamat usaha" },
  ],
  npwp: [
    { key: "npwp", label: "Nomor NPWP", required: true, inputMode: "numeric" },
    { key: "taxpayerName", label: "Nama wajib pajak", required: true },
    { key: "address", label: "Alamat" },
  ],
};

function inputValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function DocumentOcrReviewDialog({
  docType,
  initialData,
  busy,
  onClose,
  onConfirm,
}: {
  docType: OcrDocumentType;
  initialData: DocumentOcrResult;
  busy: boolean;
  onClose: () => void;
  onConfirm: (data: DocumentOcrResult) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    initialData as unknown as Record<string, unknown>,
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    let parsed: DocumentOcrResult;
    try {
      parsed = parseDocumentOcrResult(docType, draft);
    } catch {
      setError("Periksa kembali nomor identitas dan data wajib sebelum mengonfirmasi.");
      return;
    }
    setError(null);
    try {
      await onConfirm(parsed);
    } catch {
      setError("Konfirmasi belum dapat disimpan. Data Anda tetap aman; silakan coba lagi.");
    }
  };

  return (
    // Selagi menyimpan, Esc dan tombol tutup tidak berbuat apa-apa: menutup di
    // tengah jalan membuat pemilik tidak tahu apakah konfirmasinya tersimpan.
    <FormDialog
      open
      onClose={() => { if (!busy) onClose(); }}
      eyebrow="Data berhasil dibaca"
      title={documentTypeLabels[docType]}
      description="Koreksi jika hasil pembacaan tidak sesuai dokumen asli."
      className="md:max-w-xl"
    >
        <div className="mt-4 flex gap-3 rounded-xl border border-umkm-warning-line bg-umkm-warning-soft p-3 text-xs text-umkm-warning">
          <ShieldAlert className="mt-0.5 shrink-0" size={17} />
          <p>Pastikan data di bawah sesuai dengan dokumen asli. Konfirmasi ini bukan pemeriksaan keaslian oleh pemerintah atau lembaga pembiayaan.</p>
        </div>

        <div className="mt-5 space-y-3">
          {fields[docType].map((field) => (
            <label key={field.key} className="block text-xs font-bold text-umkm-ink-soft">
              {field.label}{field.required && <span className="ml-1 text-umkm-danger">*</span>}
              <input
                type={field.type ?? "text"}
                inputMode={field.inputMode}
                value={inputValue(draft[field.key])}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  [field.key]: event.target.value.trimStart() || null,
                }))}
                disabled={busy}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line px-3 text-sm font-medium text-umkm-ink outline-none focus:border-umkm-sky focus:ring-2 focus:ring-umkm-brand-tint disabled:bg-umkm-surface"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-umkm-surface p-3 text-xs text-umkm-muted">
          Tingkat keterbacaan awal: <span className="font-bold">{Math.round(initialData.confidence * 100)}%</span>. Angka ini tidak menentukan keaslian dokumen.
        </div>
        {error && <p className="mt-3 rounded-xl bg-umkm-danger-soft p-3 text-xs font-semibold text-umkm-danger">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-muted hover:bg-umkm-surface disabled:opacity-50">
            Nanti saja
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white hover:bg-umkm-brand-deep disabled:opacity-50">
            <CheckCircle2 size={16} /> {busy ? "Menyimpan..." : "Konfirmasi data"}
          </button>
        </div>
    </FormDialog>
  );
}
