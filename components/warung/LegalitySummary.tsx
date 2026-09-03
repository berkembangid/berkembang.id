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

/** Izin yang ditampilkan, dalam urutan yang ditanyakan institusi. */
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
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label className="block text-xs font-bold text-[#4a6280]">Ringkasan legalitas</label>
        <Link href="/umkm/upload" className="text-[11px] font-bold text-[#0b5f86]">
          Kelola dokumen
        </Link>
      </div>

      {rows === null ? (
        <p className="flex items-center gap-2 px-1 py-2 text-[11px] text-[#6e859e]">
          <LoaderCircle size={12} className="animate-spin" /> Memuat…
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.docType}>
              <Link
                href="/umkm/upload"
                className="flex items-center gap-3 rounded-xl border border-[#e3e9f0] bg-white px-3 py-2.5 transition-colors hover:bg-[#f7f9fb]"
              >
                <FileText
                  size={15}
                  className={`shrink-0 ${row.present ? "text-[#1d6b39]" : "text-[#9fb0c2]"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#1b2a3a]">
                    {documentTypeLabels[row.docType]}
                    {row.present && <span className="ml-1.5 text-[#1d6b39]">✓</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#6e859e]">
                    {row.docNumber ? `No. ${row.docNumber} · ` : ""}
                    {validUntilText(row.validUntil) ? `berlaku sampai ${validUntilText(row.validUntil)} · ` : ""}
                    {row.assurance}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-[#9fb0c2]" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[#6e859e]">
        Nomor dan masa berlaku dibaca dari dokumen yang Anda unggah, supaya tidak ada dua angka
        yang berbeda untuk izin yang sama.
      </p>
    </div>
  );
}
