"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type LogRow = { id: string; institution_id: string; member_id: string | null; business_id: string | null; artifact: string; artifact_id: string | null; action: string; occurred_at: string };

const artifactLabels: Record<string, string> = {
  CANDIDATE_LIST: "Daftar kandidat",
  SHORTLIST: "Shortlist",
  ORGANIZATION: "Organisasi",
  PROGRAM_DASH: "Dashboard program",
  DOSSIER: "Dossier",
  PDF: "PDF dossier",
};

export default function InstitutionAuditPage() {
  const { selectedId } = useInstitution();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/audit", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Log audit belum dapat dimuat.");
        setLogs(body.data ?? []);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, [selectedId]);

  return <DashboardPage>
    <PageHeader title="Log audit organisasi" description="Setiap tatapan tercatat: siapa membuka apa, kapan. Terlihat oleh admin institusi dan pemilik data." icon={ScrollText} />
    {message && <FeedbackBanner tone="attention" live>{message}</FeedbackBanner>}
    {logs.length === 0
      ? <EmptyState icon={ScrollText} title="Belum ada aktivitas tercatat" description="Pembukaan dossier, PDF, daftar kandidat, dan halaman organisasi akan muncul di sini." />
      : <div className="mt-4 space-y-2">{logs.map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <div>
          <p className="font-bold text-slate-800">{log.action === "download" ? "Mengunduh" : "Membuka"} {artifactLabels[log.artifact] ?? log.artifact.toLowerCase()}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">anggota {log.member_id?.slice(0, 8) ?? "—"}{log.business_id ? ` · usaha ${log.business_id.slice(0, 8)}` : ""}</p>
        </div>
        <time className="text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.occurred_at))}</time>
      </div>)}</div>}
  </DashboardPage>;
}
