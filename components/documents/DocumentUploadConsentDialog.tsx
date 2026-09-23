"use client";

import { useState } from "react";
import { FileText, ShieldCheck, TriangleAlert } from "lucide-react";
import { FormDialog } from "@/components/ui/dialog";
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
    // Dirender hanya selagi ada berkas yang menunggu, jadi selalu terbuka.
    <FormDialog
      open
      onClose={onCancel}
      eyebrow="Sebelum dokumen diunggah"
      title={`Izinkan pembacaan data ${documentTypeLabels[docType]}`}
      description="Persetujuan ini hanya berlaku untuk file yang akan Anda unggah sekarang."
      className="md:max-w-xl"
    >
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-umkm-line bg-umkm-surface p-3">
          <FileText className="shrink-0 text-umkm-brand" size={19} />
          <p className="min-w-0 truncate text-xs font-bold text-umkm-ink-soft">{fileName}</p>
        </div>

        {qualityWarning && (
          <div className="mt-3 flex gap-3 rounded-xl border border-umkm-warning-line bg-umkm-warning-soft p-3 text-xs leading-relaxed text-umkm-warning">
            <TriangleAlert className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-bold">Gambar mungkin sulit dibaca</p>
              <p className="mt-1">{qualityWarning}</p>
              <p className="mt-1">Anda tetap dapat melanjutkan, tetapi hasilnya mungkin perlu diperbaiki atau diunggah ulang.</p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3 text-xs leading-relaxed text-umkm-muted">
          <div className="flex gap-3 rounded-xl border border-umkm-brand-tint bg-umkm-brand-soft p-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-umkm-brand" size={18} />
            <div>
              <p className="font-bold text-umkm-ink">Ringkasan persetujuan</p>
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

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-umkm-line p-3 text-xs text-umkm-ink-soft">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-umkm-line-strong text-umkm-brand" />
          <span>
            <span className="block font-bold text-umkm-ink">Saya sudah membaca dan menyetujui</span>
            <span className="mt-1 block text-umkm-subtle">Saya mengizinkan file ini dibaca otomatis sesuai penjelasan di atas.</span>
          </span>
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-muted hover:bg-umkm-surface">Batal</button>
          <button type="button" onClick={onAgree} disabled={!agreed} className="min-h-11 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white hover:bg-umkm-brand-deep disabled:cursor-not-allowed disabled:bg-umkm-line-strong">
            Setuju dan unggah
          </button>
        </div>
    </FormDialog>
  );
}
