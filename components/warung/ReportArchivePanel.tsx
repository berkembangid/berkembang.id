"use client";

/**
 * "Laporan yang pernah dibuat" — rak kelima lemari usaha.
 *
 * KENAPA RAK INI ADA.
 *
 * Laporan yang dibuat ulang bulan depan tidak akan sama dengan yang dikirim
 * bulan ini: transaksi baru masuk, penyusutan bertambah, hitungan stok
 * mengoreksi periode sebelumnya. Jadi begitu sebuah berkas terkirim ke
 * koperasi, satu-satunya cara mengetahui angka apa yang ada di dalamnya adalah
 * menyimpan berkasnya. Yang diunduh ulang dari sini adalah bita yang sama
 * persis dengan yang dulu dikirim, bukan hasil hitungan hari ini.
 *
 * Karena itu tidak ada tombol "buat ulang" di rak ini. Membuat ulang adalah
 * pekerjaan halaman laporan, dan hasilnya menjadi baris baru — bukan
 * menimpa yang lama.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, LoaderCircle } from "lucide-react";
import {
  reportKindLabels,
  reportPeriodText,
  type ReportIssueView,
} from "@/modules/accounting/report-issue";
import { createDocumentSignedUrl } from "@/modules/documents/document-client";
import { EmptyState } from "@/components/dashboard";

function issuedAtText(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function ReportArchivePanel() {
  const [issues, setIssues] = useState<ReportIssueView[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/reports/issues");
      const payload = (await response.json().catch(() => null)) as {
        data?: { issues: ReportIssueView[] };
      } | null;
      setIssues(payload?.data?.issues ?? []);
    } catch {
      // Arsip bukan isi utama layar dokumen. Kalau gagal dimuat, sisanya
      // tetap berguna.
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function download(issue: ReportIssueView) {
    if (!issue.documentId) return;
    setDownloading(issue.id);
    setProblem("");
    try {
      const { signedUrl } = await createDocumentSignedUrl(issue.documentId);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setProblem("Berkasnya belum bisa dibuka. Coba lagi sebentar lagi.");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 px-1 py-3 text-[11px] text-[#6e859e]">
        <LoaderCircle size={13} className="animate-spin" /> Memuat arsip laporan…
      </p>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada laporan yang dibuat"
        description="Setiap berkas laporan yang Anda unduh akan tersimpan di sini, persis seperti saat dikirim."
        action={{ label: "Buat laporan", href: "/umkm/laporan" }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {problem && (
        <p className="rounded-xl border border-[#f0d9a8] bg-[#fdf8ee] px-3 py-2 text-[11px] text-[#8a6412]">
          {problem}
        </p>
      )}
      <ul className="space-y-2">
        {issues.map((issue) => (
          <li
            key={issue.id}
            className="flex items-start gap-3 rounded-2xl border border-[#e3e9f0] bg-white px-3.5 py-3"
          >
            <FileText size={16} className="mt-0.5 shrink-0 text-[#0b5f86]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#1b2a3a]">
                {reportKindLabels[issue.reportKind]}
              </p>
              <p className="mt-0.5 text-[11px] text-[#4a6280]">
                {reportPeriodText(issue.periodFrom, issue.periodTo)}
              </p>
              <p className="mt-0.5 text-[10px] text-[#6e859e]">
                Dibuat {issuedAtText(issue.createdAt)} · No. {issue.documentUid}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void download(issue)}
              disabled={downloading === issue.id || !issue.documentId}
              aria-label={`Unduh ulang laporan ${issue.documentUid}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#0b5f86] transition-colors hover:bg-[#eef8fd] disabled:opacity-40"
            >
              {downloading === issue.id ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
