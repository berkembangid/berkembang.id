"use client";

import { useEffect, useState } from "react";
import { Bookmark, Building2, FileSearch } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type Candidate = { candidateCode: string; sector: string; generalLocation: string; readinessLevel: string; recordingAgeBand: string; legalComplete: boolean };

export default function InstitutionShortlistPage() {
  const { selectedId } = useInstitution();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/v1/candidates", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) }).then(async (response) => ({ ok: response.ok, body: await response.json() })),
      fetch("/api/v1/institution/shortlist", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) }).then(async (response) => ({ ok: response.ok, body: await response.json() })),
    ])
      .then(([candidateResult, shortlistResult]) => {
        if (!candidateResult.ok || !shortlistResult.ok) throw new Error("Shortlist belum dapat dimuat.");
        const saved: string[] = Array.isArray(shortlistResult.body.data) ? shortlistResult.body.data : [];
        setCandidates(((candidateResult.body.data?.candidates ?? candidateResult.body.data ?? []) as Candidate[]).filter((item) => saved.includes(item.candidateCode)));
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "SHORTLIST" }),
        }).catch(() => undefined);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  async function remove(candidateCode: string) {
    const response = await fetch("/api/v1/institution/shortlist", { method: "POST", headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) }, body: JSON.stringify({ candidateCode }) });
    if (!response.ok) { setMessage("Kandidat belum dapat dihapus dari shortlist."); return; }
    setCandidates((current) => current.filter((candidate) => candidate.candidateCode !== candidateCode));
  }

  return <DashboardPage><PageHeader title="Shortlist saya" description="Kandidat anonim yang Anda simpan untuk ditinjau kembali." icon={Bookmark} />{message && <FeedbackBanner tone="attention" live>{message}</FeedbackBanner>}{loading ? <p className="py-16 text-center text-sm text-slate-500">Memuat shortlist...</p> : candidates.length === 0 ? <EmptyState icon={FileSearch} title="Belum ada kandidat tersimpan" description="Simpan kandidat dari halaman Temukan untuk membangun daftar tinjauan." /> : <div className="grid gap-4 lg:grid-cols-2">{candidates.map((candidate) => <article key={candidate.candidateCode} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-[#0b5f86]"><Building2 size={21} /></span><div><h2 className="font-bold text-slate-900">{candidate.candidateCode}</h2><p className="text-xs text-slate-500">{candidate.sector} · {candidate.generalLocation}</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{candidate.readinessLevel}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><Info label="Umur catatan" value={candidate.recordingAgeBand} /><Info label="Legalitas" value={candidate.legalComplete ? "Lengkap" : "Belum lengkap"} /></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void remove(candidate.candidateCode)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700">Hapus</button></div></article>)}</div>}</DashboardPage>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>; }
