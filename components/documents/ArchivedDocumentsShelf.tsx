"use client";

import { useCallback, useState } from "react";
import { Archive, ExternalLink, LoaderCircle } from "lucide-react";
import { formatTanggal } from "@/lib/format";
import { notifyFromError } from "@/lib/notify";
import { createDocumentSignedUrl, listArchivedDocuments } from "@/modules/documents/document-client";
import type { DocumentView } from "@/modules/documents/document-repository";
import { documentTypeLabels } from "@/modules/documents/document-schema";

/**
 * Rak arsip: dokumen yang sudah diganti versi baru atau diarsipkan pemiliknya.
 *
 * Diarsipkan tidak berarti dihapus -- layar Dokumen selalu berjanji « riwayat
 * dan catatan aksesnya tetap tersimpan », tetapi sampai sekarang tidak ada
 * tempat untuk melihatnya. Rak ini tertutup bawaannya dan baru dimuat saat
 * dibuka: yang dicari pemilik hampir selalu berkas yang sedang berlaku.
 *
 * Berkasnya hanya dibaca. Mengunduhnya lewat `?arsip=1`, jalur yang terang-
 * terangan mengizinkan berkas lama; unduhannya tetap tercatat di audit.
 */
export function ArchivedDocumentsShelf() {
  const [documents, setDocuments] = useState<DocumentView[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setDocuments(await listArchivedDocuments());
    } catch {
      setFailed(true);
    }
  }, []);

  const open = async (document: DocumentView) => {
    try {
      const result = await createDocumentSignedUrl(document.id, { archived: true });
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      notifyFromError(error, "Berkas arsip belum dapat dibuka.");
    }
  };

  return (
    <details
      className="rounded-2xl border border-umkm-line bg-white shadow-[0_8px_28px_rgba(27,42,58,.04)]"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open && documents === null) void load();
      }}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-umkm-ink md:px-5">
        <Archive size={16} aria-hidden className="text-umkm-muted" /> Dokumen yang diarsipkan
        {documents && <span className="text-xs font-semibold text-umkm-subtle">({documents.length})</span>}
      </summary>
      <div className="border-t border-umkm-line-soft px-4 py-3 md:px-5">
        {failed ? (
          <p role="alert" className="text-xs text-umkm-warning">
            Arsip belum dapat dimuat.{" "}
            <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button>
          </p>
        ) : documents === null ? (
          <p role="status" className="flex items-center gap-2 text-xs text-umkm-subtle"><LoaderCircle size={14} className="animate-spin" aria-hidden /> Memuat arsip…</p>
        ) : documents.length === 0 ? (
          <p className="text-xs text-umkm-subtle">Belum ada dokumen yang diarsipkan. Dokumen lama masuk ke sini saat Anda mengunggah penggantinya atau mengarsipkannya.</p>
        ) : (
          <ul className="divide-y divide-umkm-line-soft">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-umkm-ink">{documentTypeLabels[document.docType] ?? document.name}</p>
                  <p className="truncate text-xs text-umkm-subtle">{document.name} · diarsipkan {formatTanggal(document.updatedAt.slice(0, 10))}</p>
                </div>
                {document.hasFile && (
                  <button type="button" onClick={() => void open(document)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-umkm-brand">
                    <ExternalLink size={13} aria-hidden /> Lihat berkas
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
