"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { DocumentOcrReviewDialog } from "@/components/documents/DocumentOcrReviewDialog";
import { DocumentUploadConsentDialog } from "@/components/documents/DocumentUploadConsentDialog";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { supabase } from "@/lib/supabase";
import {
  archiveDocument,
  completeDocumentVersion,
  confirmDocumentExtraction,
  createDocumentSignedUrl,
  createDocumentUploadSession,
  DocumentClientError,
  getDocument,
  listDocuments,
  retryDocumentExtraction,
  sha256Hex,
} from "@/modules/documents/document-client";
import {
  createDocumentUploadSessionSchema,
  documentTypeLabels,
  maxDocumentBytes,
  parseDocumentOcrResult,
  supportsDocumentOcr,
  type DocumentOcrResult,
  type DocumentType,
  type OcrDocumentType,
} from "@/modules/documents/document-schema";
import type { DocumentView } from "@/modules/documents/document-repository";

type DocumentCategory = "identity" | "product" | "finance" | "supporting";

const DOCUMENT_CATEGORIES: Array<{
  id: DocumentCategory;
  title: string;
  description: string;
}> = [
  { id: "identity", title: "Identitas & Legalitas", description: "Dokumen utama pemilik dan badan usaha" },
  { id: "product", title: "Izin & Sertifikasi Produk", description: "Perizinan yang berkaitan dengan produk usaha" },
  { id: "finance", title: "Keuangan & Transaksi", description: "Catatan yang menunjukkan aktivitas keuangan usaha" },
  { id: "supporting", title: "Bukti Pendukung Usaha", description: "Dokumen tambahan untuk memperkuat profil usaha" },
];

const DOCUMENT_REQUIREMENTS: Array<{
  type: DocumentType;
  description: string;
  required: boolean;
  category: DocumentCategory;
}> = [
  { type: "ktp", description: "Identitas pemilik usaha", required: true, category: "identity" },
  { type: "nib", description: "Legalitas usaha dari OSS", required: true, category: "identity" },
  { type: "npwp", description: "Dokumen perpajakan usaha atau pemilik", required: true, category: "identity" },
  { type: "akta_pendirian", description: "Akta atau SK untuk badan usaha", required: false, category: "identity" },
  { type: "pirt", description: "Izin produksi pangan rumah tangga jika relevan", required: false, category: "product" },
  { type: "halal", description: "Sertifikat halal jika sudah dimiliki", required: false, category: "product" },
  { type: "izin_edar", description: "Izin edar produk jika diwajibkan", required: false, category: "product" },
  { type: "rekening_koran", description: "Mutasi rekening usaha", required: false, category: "finance" },
  { type: "qris", description: "Riwayat transaksi QRIS", required: false, category: "finance" },
  { type: "laporan_keuangan", description: "Laporan atau arus kas usaha", required: false, category: "finance" },
  { type: "foto_tempat_usaha", description: "Foto tempat atau aktivitas usaha", required: false, category: "supporting" },
  { type: "utilitas", description: "Tagihan listrik, air, atau internet tempat usaha", required: false, category: "supporting" },
];

function inspectImageQuality(file: File) {
  if (!file.type.startsWith("image/")) return Promise.resolve<string | null>(null);
  return new Promise<string | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.width < 1200 || image.height < 700) {
        resolve(`Ukuran gambar ${image.width} × ${image.height} piksel. Agar data lebih mudah dibaca, gunakan foto minimal 1200 piksel dan pastikan dokumen memenuhi gambar.`);
        return;
      }
      resolve(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("Gambar tidak dapat diperiksa. Pastikan file dapat dibuka dan tidak rusak.");
    };
    image.src = url;
  });
}

const statusPresentation: Record<
  DocumentView["status"],
  { label: string; className: string }
> = {
  uploaded: { label: "Menunggu verifikasi", className: "bg-amber-50 text-amber-700 border-amber-200" },
  processing: { label: "Sedang diproses", className: "bg-blue-50 text-blue-700 border-blue-200" },
  verified: { label: "Terverifikasi", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Perlu diperbaiki", className: "bg-red-50 text-red-700 border-red-200" },
  superseded: { label: "Diarsipkan", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function documentStatusPresentation(document: DocumentView) {
  if (!supportsDocumentOcr(document.docType)) return statusPresentation[document.status];
  if (["verified", "rejected", "superseded"].includes(document.status)) {
    return statusPresentation[document.status];
  }
  if (document.status === "processing" || ["queued", "processing"].includes(document.currentExtraction?.status ?? "")) {
    return { label: "Sedang membaca data", className: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (document.currentExtraction?.status === "failed") {
    return { label: "Data belum terbaca", className: "bg-red-50 text-red-700 border-red-200" };
  }
  if (document.currentExtraction?.status === "succeeded" && document.currentExtraction.extractor === "metadata") {
    return { label: "Perlu diunggah ulang", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
  if (["owner_confirmed", "owner_corrected"].includes(document.currentExtraction?.ownerReviewStatus ?? "")) {
    return { label: "Dikonfirmasi pemilik", className: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  if (document.currentExtraction?.status === "succeeded") {
    return { label: "Data siap dikonfirmasi", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return statusPresentation.uploaded;
}

function fileSizeLabel(bytes: number | null) {
  if (!bytes) return "-";
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

export default function UploadPage() {
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [busyType, setBusyType] = useState<DocumentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUpload, setPendingUpload] = useState<{
    file: File;
    docType: OcrDocumentType;
    existingDocument?: DocumentView;
    qualityWarning: string | null;
  } | null>(null);
  const [confirmingOcr, setConfirmingOcr] = useState(false);
  const [ocrReview, setOcrReview] = useState<{
    documentId: string;
    documentVersionId: string;
    docType: OcrDocumentType;
    data: DocumentOcrResult;
  } | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);

  const documentsByType = useMemo(
    () => new Map(documents.map((document) => [document.docType, document])),
    [documents],
  );

  const loadDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
      setMessage((current) => current?.tone === "error" ? null : current);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Dokumen belum dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  useEffect(() => {
    if (!documents.some((document) => document.status === "processing")) return;
    const interval = window.setInterval(() => void loadDocuments(), 3_000);
    return () => window.clearInterval(interval);
  }, [documents, loadDocuments]);

  const uploadFile = async (
    file: File,
    docType: DocumentType,
    existingDocument?: DocumentView,
    ocrConsent = false,
  ) => {
    setBusyType(docType);
    setMessage({ tone: "info", text: "Memeriksa file sebelum disimpan..." });
    try {
      const checksumSha256 = await sha256Hex(file);
      const parsed = createDocumentUploadSessionSchema.safeParse({
        ...(existingDocument ? { documentId: existingDocument.id } : {}),
        docType,
        ocrConsent: supportsDocumentOcr(docType) ? ocrConsent : false,
        file: {
          name: file.name,
          mimeType: file.type,
          size: file.size,
          checksumSha256,
        },
      });
      if (!parsed.success) {
        throw new DocumentClientError(
          "VALIDATION_FAILED",
          parsed.error.issues[0]?.message ?? "File belum valid.",
          false,
        );
      }

      setMessage({ tone: "info", text: "Menyiapkan penyimpanan aman..." });
      const session = await createDocumentUploadSession(
        parsed.data,
        `document:${crypto.randomUUID()}`,
      );
      const { error: uploadError } = await supabase.storage
        .from(session.upload.bucket)
        .uploadToSignedUrl(session.upload.path, session.upload.token, file, {
          contentType: parsed.data.file.mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new DocumentClientError(
          "UPLOAD_FAILED",
          "File belum berhasil dikirim ke penyimpanan privat. Silakan unggah kembali.",
          true,
        );
      }

      setMessage({ tone: "info", text: "Memastikan file tersimpan dengan lengkap..." });
      await completeDocumentVersion(session.documentId, session.sessionId);
      setMessage({
        tone: "success",
        text: supportsDocumentOcr(docType)
          ? `${documentTypeLabels[docType]} berhasil disimpan dan sedang dibaca. Biasanya selesai kurang dari satu menit.`
          : `${documentTypeLabels[docType]} berhasil disimpan dengan aman.`,
      });
      await loadDocuments();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Dokumen belum berhasil diunggah.",
      });
    } finally {
      setBusyType(null);
    }
  };

  const handleFileSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
    docType: DocumentType,
    existingDocument?: DocumentView,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (supportsDocumentOcr(docType)) {
      const qualityWarning = await inspectImageQuality(file);
      setPendingUpload({ file, docType, existingDocument, qualityWarning });
      return;
    }
    void uploadFile(file, docType, existingDocument, false);
  };

  const handleReviewOcr = async (document: DocumentView) => {
    if (!supportsDocumentOcr(document.docType)) return;
    setBusyType(document.docType);
    setMessage({ tone: "info", text: "Memuat data yang berhasil dibaca..." });
    try {
      const detail = await getDocument(document.id);
      const currentVersion = detail.versions.find((version) => version.version === detail.currentVersion);
      const extraction = currentVersion?.extraction;
      if (!currentVersion || extraction?.status !== "succeeded") {
        throw new DocumentClientError("DOCUMENT_EXTRACTION_NOT_READY", "Data dokumen belum siap diperiksa.", true);
      }
      const data = parseDocumentOcrResult(
        document.docType,
        extraction.confirmedData ?? extraction.structuredData,
      );
      setOcrReview({
        documentId: document.id,
        documentVersionId: currentVersion.id,
        docType: document.docType,
        data,
      });
      setMessage(null);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Data dokumen belum dapat dimuat." });
    } finally {
      setBusyType(null);
    }
  };

  const handleRetryReading = async (document: DocumentView) => {
    setBusyType(document.docType);
    setMessage({ tone: "info", text: "Mencoba membaca kembali dokumen..." });
    try {
      await retryDocumentExtraction(document.id);
      setMessage({ tone: "success", text: "Dokumen sedang dibaca kembali. Anda tidak perlu mengunggah file yang sama." });
      await loadDocuments();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Dokumen belum dapat dibaca kembali." });
    } finally {
      setBusyType(null);
    }
  };

  const handleConfirmOcr = async (data: DocumentOcrResult) => {
    if (!ocrReview) return;
    setConfirmingOcr(true);
    try {
      const result = await confirmDocumentExtraction(
        ocrReview.documentId,
        ocrReview.documentVersionId,
        data,
      );
      setOcrReview(null);
      setMessage({
        tone: "success",
        text: result.reviewStatus === "owner_corrected"
          ? "Perbaikan data telah disimpan. Dokumen masih menunggu pemeriksaan keaslian."
          : "Data telah Anda konfirmasi. Dokumen masih menunggu pemeriksaan keaslian.",
      });
      await loadDocuments();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Konfirmasi data belum berhasil." });
      throw error;
    } finally {
      setConfirmingOcr(false);
    }
  };

  const handleView = async (documentId: string) => {
    setMessage(null);
    try {
      const result = await createDocumentSignedUrl(documentId);
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Dokumen belum dapat dibuka." });
    }
  };

  const handleArchive = async (document: DocumentView) => {
    if (!window.confirm(`Arsipkan ${documentTypeLabels[document.docType]}? File tidak dihapus dan riwayat versi tetap disimpan.`)) return;
    setBusyType(document.docType);
    try {
      await archiveDocument(document.id);
      setMessage({ tone: "success", text: "Dokumen diarsipkan. Riwayat dan audit tetap tersimpan." });
      await loadDocuments();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Dokumen belum dapat diarsipkan." });
    } finally {
      setBusyType(null);
    }
  };

  return (
    <DashboardPage>
      <PageHeader title="Dokumen usaha" description="Simpan dan perbarui dokumen usaha di satu tempat. Anda tetap mengendalikan siapa yang dapat mengaksesnya." icon={FileText} actions={<button
          type="button"
          onClick={() => void loadDocuments()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9]"
        >
          <RefreshCcw size={14} /> Muat ulang
        </button>} />

      <FeedbackBanner title="Dokumen Anda disimpan secara privat">Format dan ukuran file diperiksa. Tautan untuk melihat dokumen hanya berlaku sebentar dan setiap akses dicatat.</FeedbackBanner>

      {message && (
        <FeedbackBanner tone={message.tone === "error" ? "error" : message.tone} live>{message.text}</FeedbackBanner>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm font-semibold text-slate-500">
          <LoaderCircle className="animate-spin" size={18} /> Memuat dokumen...
        </div>
      ) : (
        <div className="space-y-8">
          {DOCUMENT_CATEGORIES.map((category) => {
            const requirements = DOCUMENT_REQUIREMENTS.filter((item) => item.category === category.id);
            const completed = requirements.filter((item) => documentsByType.has(item.type)).length;
            return (
              <section key={category.id} aria-labelledby={`category-${category.id}`}>
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <h2 id={`category-${category.id}`} className="text-base font-black text-slate-800">{category.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {completed} dari {requirements.length} tersedia
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {requirements.map((requirement) => {
            const document = documentsByType.get(requirement.type);
            const isBusy = busyType === requirement.type;
            const presentation = document ? documentStatusPresentation(document) : null;
            const limit = maxDocumentBytes(requirement.type) / 1024 / 1024;
            return (
              <article key={requirement.type} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${document ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                      {document?.status === "verified" ? <CheckCircle2 size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-800">
                        {documentTypeLabels[requirement.type]}
                        {requirement.required && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600">Wajib</span>}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-400">{requirement.description}</p>
                    </div>
                  </div>
                  {presentation && (
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${presentation.className}`}>
                      {presentation.label}
                    </span>
                  )}
                </div>

                {document ? (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-700">{document.name}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">Versi {document.currentVersion} · {fileSizeLabel(document.fileSize)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => void handleView(document.id)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label="Lihat dokumen">
                          <Eye size={15} />
                        </button>
                        <button type="button" onClick={() => void handleArchive(document)} disabled={isBusy} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Arsipkan dokumen">
                          <Archive size={15} />
                        </button>
                      </div>
                    </div>
                    {(document.rejectionReason || document.notes || document.currentExtraction?.status === "failed") && (
                      <p className={`rounded-lg p-2.5 text-[11px] leading-relaxed ${document.rejectionReason ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
                        {document.rejectionReason ?? (document.currentExtraction?.status === "failed"
                          ? "Data belum berhasil dibaca. Foto dokumen dari dekat, pastikan seluruh sisi terlihat, tulisan tidak buram, dan hindari tangkapan layar yang menyisakan area kosong."
                          : document.notes)}
                      </p>
                    )}
                    {supportsDocumentOcr(document.docType) && document.currentExtraction?.status === "succeeded" && document.currentExtraction.extractor !== "metadata" && (
                      <button
                        type="button"
                        onClick={() => void handleReviewOcr(document)}
                        disabled={isBusy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 hover:border-amber-400 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        {["owner_confirmed", "owner_corrected"].includes(document.currentExtraction.ownerReviewStatus)
                          ? "Periksa kembali data"
                          : "Periksa dan konfirmasi data"}
                      </button>
                    )}
                    {supportsDocumentOcr(document.docType) && document.currentExtraction?.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => void handleRetryReading(document)}
                        disabled={isBusy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isBusy ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
                        {isBusy ? "Sedang mencoba..." : "Coba baca lagi"}
                      </button>
                    )}
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-2.5 text-xs font-bold text-blue-600 hover:border-blue-400">
                      {isBusy ? <LoaderCircle className="animate-spin" size={14} /> : <Clock3 size={14} />}
                      {isBusy ? "Memproses..." : "Unggah versi pengganti"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="hidden"
                        disabled={isBusy}
                        onChange={(event) => void handleFileSelection(event, requirement.type, document)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-xs font-bold text-blue-600 hover:border-blue-400 hover:bg-blue-50/50">
                      {isBusy ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}
                      {isBusy ? "Memproses..." : `Pilih file (maks. ${limit} MB)`}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="hidden"
                        disabled={isBusy}
                        onChange={(event) => void handleFileSelection(event, requirement.type)}
                      />
                    </label>
                  </div>
                )}
              </article>
            );
          })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {ocrReview && (
        <DocumentOcrReviewDialog
          docType={ocrReview.docType}
          initialData={ocrReview.data}
          busy={confirmingOcr}
          onClose={() => setOcrReview(null)}
          onConfirm={handleConfirmOcr}
        />
      )}
      {pendingUpload && (
        <DocumentUploadConsentDialog
          docType={pendingUpload.docType}
          fileName={pendingUpload.file.name}
          qualityWarning={pendingUpload.qualityWarning}
          onCancel={() => setPendingUpload(null)}
          onAgree={() => {
            const upload = pendingUpload;
            setPendingUpload(null);
            void uploadFile(upload.file, upload.docType, upload.existingDocument, true);
          }}
        />
      )}
    </DashboardPage>
  );
}
