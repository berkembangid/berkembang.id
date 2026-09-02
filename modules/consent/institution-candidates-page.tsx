"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, FileSearch, MapPin, ShieldCheck, X } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader, StatusBadge } from "@/components/dashboard";

type Candidate = {
  businessId: string; candidateCode: string; sector: string; generalLocation: string;
  businessAge: string; readinessScore: number | null; readinessBand: string;
  recordingActivity: string; evidenceAvailability: string[]; requestStatus?: string | null; dossierStatus?: string | null;
};

const defaultScopes: ConsentScope[] = ["business_identity", "readiness", "financial_summary"];

export default function InstitutionCandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [scopes, setScopes] = useState<ConsentScope[]>(defaultScopes);
  const [purpose, setPurpose] = useState("Menilai kecocokan usaha untuk program pendampingan dan pembiayaan.");
  const [duration, setDuration] = useState(14);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [sector, setSector] = useState("Semua");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/candidates", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (!response.ok) throw new Error(body.error?.message ?? "Daftar usaha belum dapat dimuat."); setCandidates(body.data.candidates as Candidate[]); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const sectors = useMemo(() => ["Semua", ...new Set(candidates.map((item) => item.sector))], [candidates]);
  const visible = sector === "Semua" ? candidates : candidates.filter((item) => item.sector === sector);

  function toggleScope(scope: ConsentScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  async function submitRequest() {
    if (!selected || scopes.length === 0) return;
    setSending(true); setMessage("");
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ businessId: selected.businessId, purposeCode: "program_review", purposeDescription: purpose,
          requestedScopes: scopes, requiredScopes: ["financial_summary"].filter((item) => scopes.includes(item as ConsentScope)),
          requestedDurationDays: duration, downloadRequested }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan belum dapat dikirim.");
      setCandidates((current) => current.map((item) => item.businessId === selected.businessId ? { ...item, requestStatus: "pending" } : item));
      setSelected(null); setMessage("Permintaan berhasil dikirim. Pemilik usaha akan memilih bagian data yang boleh dilihat.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum dapat dikirim."); }
    finally { setSending(false); }
  }

  return <DashboardPage>
    <PageHeader title="Cari usaha yang sesuai" description="Informasi awal tetap anonim. Identitas dan ringkasan usaha baru terlihat setelah pemilik memberi izin." icon={Building2} actions={<StatusBadge tone="success"><ShieldCheck size={13} className="mr-1.5" />Privasi terjaga</StatusBadge>} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Saring berdasarkan bidang usaha">{sectors.map((item) => <button key={item} onClick={() => setSector(item)} className={`min-h-10 rounded-full px-4 text-xs font-bold ${sector === item ? "bg-[#0b5f86] text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{item}</button>)}</div>
    {loading ? <p className="py-16 text-center text-sm text-slate-500">Memuat daftar usaha...</p> : <div className="grid gap-4 lg:grid-cols-2">{visible.map((candidate) => <article key={candidate.businessId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0b5f86]"><Building2 size={21}/></span><div><h2 className="font-bold text-slate-900">{candidate.candidateCode}</h2><p className="text-xs text-slate-500">{candidate.sector} · Usaha {candidate.businessAge}</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{candidate.readinessBand}</span></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><Info label="Wilayah umum" value={candidate.generalLocation}/><Info label="Kebiasaan mencatat" value={candidate.recordingActivity}/><Info label="Nilai kesiapan" value={candidate.readinessScore == null ? "Belum dihitung" : `${candidate.readinessScore}/100`}/><Info label="Bukti tersedia" value={candidate.evidenceAvailability.length ? `${candidate.evidenceAvailability.length} jenis` : "Belum ada"}/></div>
      <button disabled={candidate.requestStatus === "pending" || candidate.dossierStatus === "ready"} onClick={() => { setSelected(candidate); setScopes(defaultScopes); }} className="mt-5 min-h-11 w-full rounded-xl bg-[#0b5f86] px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">{candidate.dossierStatus === "ready" ? "Izin masih aktif" : candidate.requestStatus === "pending" ? "Menunggu jawaban pemilik" : "Minta izin melihat profil"}</button>
    </article>)}</div>}
    {!loading && visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><FileSearch className="mx-auto text-slate-400"/><p className="mt-2 text-sm font-bold text-slate-700">Belum ada usaha pada bidang ini</p></div>}

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="request-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><h2 id="request-title" className="text-lg font-black text-slate-900">Minta izin kepada {selected.candidateCode}</h2><p className="mt-1 text-sm text-slate-600">Pemilik dapat menolak atau memilih bagian yang dibagikan.</p></div><button aria-label="Tutup" onClick={() => setSelected(null)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18}/></button></div>
      <label className="mt-5 block text-xs font-bold text-slate-700">Tujuan penggunaan data<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal"/></label>
      <fieldset className="mt-5"><legend className="text-xs font-bold text-slate-700">Bagian data yang diminta</legend><div className="mt-2 space-y-2">{(Object.keys(consentScopeLabels) as ConsentScope[]).map((scope) => { const item = consentScopeLabels[scope]; const checked = scopes.includes(scope); return <label key={scope} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={checked} onChange={() => toggleScope(scope)} className="mt-1 h-4 w-4"/><span><span className="block text-sm font-bold text-slate-800">{item.label}</span><span className="block text-xs leading-5 text-slate-500">{item.description}</span></span></label>; })}</div></fieldset>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Masa izin<select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal"><option value={7}>7 hari</option><option value={14}>14 hari</option><option value={30}>30 hari</option></select></label><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={downloadRequested} onChange={(event) => setDownloadRequested(event.target.checked)}/>Minta izin menyimpan ringkasan</label></div>
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Pemilik tetap bebas menolak. Keputusan ini tidak memengaruhi biaya atau pembayaran apa pun.</p>
      <div className="mt-5 flex gap-3"><button onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Batal</button><button disabled={sending || scopes.length === 0 || purpose.trim().length < 10} onClick={() => void submitRequest()} className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] text-sm font-bold text-white disabled:opacity-50">{sending ? "Mengirim..." : "Kirim permintaan"}</button></div>
    </section></div>}
  </DashboardPage>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 flex items-center gap-1 font-bold text-slate-800"><MapPin size={12} className="text-slate-400"/>{value}</p></div>; }
