"use client";

/**
 * Ringkasan legalitas di halaman Profil — dibaca, tidak pernah ditulis.
 *
 * SATU SUMBER KEBENARAN.
 *
 * Sebelum ini nomor NIB bisa diketik di Profil sementara berkasnya diunggah di
 * halaman Dokumen. Dua tempat menyimpan hal yang sama, dan keduanya bisa
 * berbeda: nomor yang diketik salah satu digit tidak pernah bertabrakan dengan
 * nomor di berkasnya, karena tidak ada yang pernah membandingkannya. Yang
 * berlaku sekarang satu — dokumennya. Blok ini membacanya dan menautkan ke
 * tempat memperbaikinya.
 *
 * Nomor yang telanjur diketik pemilik tidak hilang: migrasi `0045` memindahkannya
 * menjadi dokumen tanpa berkas, dan di sini ia tampil apa adanya sebagai "baru
 * nomornya" — jujur bahwa berkasnya memang belum ada.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, LoaderCircle } from "lucide-react";
import { listDocuments } from "@/modules/documents/document-client";
import { assuranceText } from "@/modules/documents/cabinet-shelves";
import { documentTypeLabels, type DocumentType } from "@/modules/documents/document-schema";

/** Izin yang ditampilkan, dalam urutan yang ditanyakan lembaga. */
const shownTypes: DocumentType[] = ["nib", "pirt", "halal"];

type Row = {
  docType: DocumentType;
  present: boolean;
  docNumber: string | null;
  validUntil: string | null;
  assurance: string;
};

function validUntilText(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

export function LegalitySummary() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const documents = await listDocuments();
        setRows(
          shownTypes.map((docType) => {
            const found = documents.find((document) => document.docType === docType);
            return {
              docType,
              present: Boolean(found),
              docNumber: found?.docNumber ?? null,
              validUntil: found?.validUntil ?? null,
              assurance: found ? assuranceText(found.assuranceLevel, found.hasFile) : "Belum ada",
            };
          }),
        );
      } catch {
        // Ringkasan ini bukan isi utama halaman Profil.
        setRows([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-xs font-bold text-umkm-muted">Ringkasan legalitas</label>
        {/*
          `-mr-2 px-2` + `min-h-11`: area sentuhnya 44px tanpa menggeser
          tulisannya dari tepi kanan. Tautan setinggi 17px di dalam kartu yang
          padat adalah sasaran yang hampir selalu meleset di ponsel.
        */}
        <Link
          href="/umkm/profil/dokumen"
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-bold text-umkm-brand hover:bg-umkm-surface-muted"
        >
          Kelola dokumen
        </Link>
      </div>

      {rows === null ? (
        <p className="flex items-center gap-2 px-1 py-2 text-xs text-umkm-subtle">
          <LoaderCircle size={12} className="animate-spin" /> Memuat…
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.docType}>
              <Link
                href="/umkm/profil/dokumen"
                className="flex items-center gap-3 rounded-xl border border-umkm-line bg-white px-3 py-2.5 transition-colors hover:bg-umkm-surface"
              >
                <FileText
                  size={15}
                  className={`shrink-0 ${row.present ? "text-umkm-success" : "text-umkm-faint"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-umkm-ink">
                    {documentTypeLabels[row.docType]}
                    {row.present && <span className="ml-1.5 text-umkm-success">✓</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-umkm-subtle">
                    {row.docNumber ? `No. ${row.docNumber} · ` : ""}
                    {validUntilText(row.validUntil) ? `berlaku sampai ${validUntilText(row.validUntil)} · ` : ""}
                    {row.assurance}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-umkm-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs leading-relaxed text-umkm-subtle">
        Nomor dan masa berlaku dibaca dari dokumen yang Anda unggah, supaya tidak ada dua angka
        yang berbeda untuk izin yang sama.
      </p>
    </div>
  );
}
