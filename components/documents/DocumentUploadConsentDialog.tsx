"use client";

import { useState } from "react";
import { FileText, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { documentTypeLabels, type OcrDocumentType } from "@/modules/documents/document-schema";

export function DocumentUploadConsentDialog({
  docType,
  fileName,
  qualityWarning,
  onCancel,
  onAgree,
}: {
  docType: OcrDocumentType;
  fileName: string;
  qualityWarning: string | null;
  onCancel: () => void;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="document-consent-title">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-xl md:rounded-3xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Sebelum dokumen diunggah</p>
            <h2 id="document-consent-title" className="mt-1 text-lg font-black text-slate-800">
              Izinkan pembacaan data {documentTypeLabels[docType]}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Persetujuan ini hanya berlaku untuk file yang akan Anda unggah sekarang.
            </p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <FileText className="shrink-0 text-blue-600" size={19} />
          <p className="min-w-0 truncate text-xs font-bold text-slate-700">{fileName}</p>
        </div>

        {qualityWarning && (
          <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <TriangleAlert className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-bold">Gambar mungkin sulit dibaca</p>
              <p className="mt-1">{qualityWarning}</p>
              <p className="mt-1">Anda tetap dapat melanjutkan, tetapi hasilnya mungkin perlu diperbaiki atau diunggah ulang.</p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
          <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div>
              <p className="font-bold text-slate-800">Ringkasan persetujuan</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4">
                <li>File diproses oleh layanan pembaca data otomatis (AI) yang digunakan platform.</li>
                <li>Tujuannya hanya menyalin data penting agar Anda tidak perlu mengetik dari awal.</li>
                <li>File disimpan secara privat dan aksesnya dibatasi serta dicatat.</li>
                <li>Anda wajib memeriksa dan dapat memperbaiki hasil baca sebelum mengonfirmasinya.</li>
                <li>Hasil pembacaan bukan bukti bahwa dokumen asli atau telah disahkan lembaga resmi.</li>
              </ul>
            </div>
          </div>
          <p>Jika tidak setuju, pilih <span className="font-bold">Batal</span>. File tidak akan diunggah dan tidak akan dikirim untuk dibaca.</p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
          <span>
            <span className="block font-bold text-slate-800">Saya sudah membaca dan menyetujui</span>
            <span className="mt-1 block text-slate-500">Saya mengizinkan file ini dibaca otomatis sesuai penjelasan di atas.</span>
          </span>
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" onClick={onAgree} disabled={!agreed} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            Setuju dan unggah
          </button>
        </div>
      </div>
    </div>
  );
}
