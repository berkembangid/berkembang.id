"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert, X } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Periksa data dokumen">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-xl md:rounded-3xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Data berhasil dibaca</p>
            <h2 className="mt-1 text-lg font-black text-slate-800">{documentTypeLabels[docType]}</h2>
            <p className="mt-1 text-xs text-slate-500">Koreksi jika hasil pembacaan tidak sesuai dokumen asli.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Tutup pemeriksaan data">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={17} />
          <p>Pastikan data di bawah sesuai dengan dokumen asli. Konfirmasi ini bukan pemeriksaan keaslian oleh pemerintah atau lembaga pembiayaan.</p>
        </div>

        <div className="mt-5 space-y-3">
          {fields[docType].map((field) => (
            <label key={field.key} className="block text-xs font-bold text-slate-700">
              {field.label}{field.required && <span className="ml-1 text-red-500">*</span>}
              <input
                type={field.type ?? "text"}
                inputMode={field.inputMode}
                value={inputValue(draft[field.key])}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  [field.key]: event.target.value.trimStart() || null,
                }))}
                disabled={busy}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Tingkat keterbacaan awal: <span className="font-bold">{Math.round(initialData.confidence * 100)}%</span>. Angka ini tidak menentukan keaslian dokumen.
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Nanti saja
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            <CheckCircle2 size={16} /> {busy ? "Menyimpan..." : "Konfirmasi data"}
          </button>
        </div>
      </div>
    </div>
  );
}
