"use client";

import { useEffect, useState } from "react";
import { Clock3, FileCheck2, RefreshCw } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type Request = {
  id: string; candidateCode: string; purpose_description: string; requested_scopes: string[];
  requested_duration_days: number; status: string; created_at: string; expires_at: string | null;
};

export default function InstitutionRequestsPage() {
  const { selectedId } = useInstitution();
  const [requests, setRequests] = useState<Request[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/profile-access/requests", { cache: "no-store", headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Permintaan belum dapat dimuat.");
        setRequests(body.data?.requests ?? []);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Permintaan belum dapat dimuat."));
  }, [selectedId]);

  const status = (value: string) =>
    value === "pending" ? "Menunggu review admin"
    : value === "approved" ? "Disetujui"
    : value === "rejected" ? "Ditolak"
    : value === "expired" ? "Kedaluwarsa"
    : value === "cancelled" ? "Dibatalkan"
    : value;

  async function refresh(request: Request) {
    setBusy(request.id);
    setMessage("");
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          candidateCode: request.candidateCode,
          purposeCode: "dossier_refresh",
          purposeDescription: "Meminta pembaruan dossier dengan data terbaru usaha.",
          requestedScopes: request.requested_scopes,
          requiredScopes: [],
          requestedDurationDays: 30,
          downloadRequested: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan pembaruan belum dapat dikirim.");
      setMessage("Permintaan pembaruan terkirim. Snapshot baru dibuat setelah admin menyetujui.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permintaan pembaruan belum dapat dikirim.");
    } finally {
      setBusy(null);
    }
  }

  const expired = requests.filter((item) => item.status === "expired");
  const rest = requests.filter((item) => item.status !== "expired");

  return <DashboardPage>
    <PageHeader title="Permintaan akses" description="Pantau permintaan profil anonim: menunggu, disetujui, ditolak, kedaluwarsa, dan ajukan pembaruan." icon={Clock3} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}
    {requests.length === 0
      ? <EmptyState icon={FileCheck2} title="Belum ada permintaan" description="Ajukan ketertarikan dari halaman Kandidat pendanaan." />
      : <div className="space-y-3">
        {rest.map((request) => <RequestCard key={request.id} request={request} status={status(request.status)} busy={busy === request.id} onRefresh={() => void refresh(request)} />)}
        {expired.length > 0 && <section className="pt-4"><h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Kedaluwarsa ({expired.length}) — ajukan pembaruan untuk snapshot baru</h2><div className="mt-2 space-y-3">{expired.map((request) => <RequestCard key={request.id} request={request} status={status(request.status)} busy={busy === request.id} onRefresh={() => void refresh(request)} />)}</div></section>}
      </div>}
  </DashboardPage>;
}

function RequestCard({ request, status, busy, onRefresh }: { request: Request; status: string; busy: boolean; onRefresh: () => void }) {
  const canRefresh = request.status === "approved" || request.status === "expired";
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold text-slate-900">{request.candidateCode}</h2>
        <p className="mt-1 text-sm text-slate-600">{request.purpose_description}</p>
        <p className="mt-1 text-[11px] text-slate-500">Masa akses {request.requested_duration_days} hari</p>
      </div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{status}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">{request.requested_scopes.map((scope) => <span key={scope} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{consentScopeLabels[scope as ConsentScope]?.label ?? scope}</span>)}</div>
    {canRefresh && <button disabled={busy} onClick={onRefresh} className="mt-3 flex min-h-10 items-center gap-1 text-xs font-bold text-[#0b5f86] underline disabled:opacity-50"><RefreshCw size={13} />{busy ? "Mengirim..." : "Minta pembaruan (snapshot baru)"}</button>}
  </article>;
}
