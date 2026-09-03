"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Bookmark, Building2, Check, FileSearch, MapPin, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { consentScopeLabels, durationTemplates, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader, StatusBadge } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type Candidate = {
  candidateCode: string; sector: string; generalLocation: string; readinessLevel: string;
  recordingAgeBand: string; recordingActivity: string; legalComplete: boolean; legalEvidenceCount: number;
  evidenceAvailability: string[]; requestStatus?: string | null; dossierStatus?: string | null;
};

const defaultScopes: ConsentScope[] = ["business_identity", "readiness", "financial_summary"];

export default function InstitutionCandidatesPage() {
  const { selectedId } = useInstitution();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [scopes, setScopes] = useState<ConsentScope[]>(defaultScopes);
  const [purpose, setPurpose] = useState("Menilai kecocokan usaha untuk program pendampingan dan pembiayaan.");
  const [duration, setDuration] = useState(30);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [sector, setSector] = useState("Semua");
  const [readinessFilter, setReadinessFilter] = useState("Semua");
  const [recordingFilter, setRecordingFilter] = useState("Semua");
  const [region, setRegion] = useState("Semua");
  const [legalFilter, setLegalFilter] = useState("Semua");
  const [sortBy, setSortBy] = useState("newest");
  const [shortlist, setShortlist] = useState<string[]>([]);

  const load = useCallback((signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (sector !== "Semua") params.set("sector", sector);
    if (region !== "Semua") params.set("region", region);
    if (readinessFilter !== "Semua") params.set("minLevel", readinessFilter);
    if (recordingFilter !== "Semua") params.set("ageBand", recordingFilter);
    if (legalFilter === "Lengkap") params.set("legalComplete", "true");
    if (legalFilter === "Belum") params.set("legalComplete", "false");
    params.set("sort", sortBy === "region" ? "region" : "newest");
    params.set("limit", "50");
    fetch(`/api/v1/candidates?${params.toString()}`, { cache: "no-store", signal, headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Daftar usaha belum dapat dimuat.");
        setCandidates((body.data.candidates ?? []) as Candidate[]);
        setTotal(Number(body.data.total ?? 0));
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "CANDIDATE_LIST" }),
        }).catch(() => undefined);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [legalFilter, readinessFilter, recordingFilter, region, sector, selectedId, sortBy]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    fetch("/api/v1/institution/shortlist", { cache: "no-store", headers: institutionHeaders(selectedId) })
      .then((response) => response.json())
      .then((body) => { if (Array.isArray(body.data)) setShortlist(body.data as string[]); })
      .catch(() => undefined);
  }, [selectedId]);

  function apply(patch: { sector?: string; region?: string; readiness?: string; recording?: string; legal?: string; sort?: string }) {
    setLoading(true);
    if (patch.sector !== undefined) setSector(patch.sector);
    if (patch.region !== undefined) setRegion(patch.region);
    if (patch.readiness !== undefined) setReadinessFilter(patch.readiness);
    if (patch.recording !== undefined) setRecordingFilter(patch.recording);
    if (patch.legal !== undefined) setLegalFilter(patch.legal);
    if (patch.sort !== undefined) setSortBy(patch.sort);
  }
  const sectors = useMemo(() => ["Semua", ...new Set(candidates.map((item) => item.sector))], [candidates]);
  const regions = useMemo(() => ["Semua", ...new Set(candidates.map((item) => item.generalLocation))], [candidates]);
  const readinessBands = ["Semua", "Mulai", "Tembaga", "Perak", "Emas"];
  const recordingLevels = ["Semua", "< 3 bulan", "3-6 bulan", "6-12 bulan", "> 12 bulan", "Belum ada catatan"];

  const visible = candidates
    .sort((left, right) => sortBy === "region" ? left.generalLocation.localeCompare(right.generalLocation) : left.candidateCode.localeCompare(right.candidateCode));

  function toggleScope(scope: ConsentScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  async function toggleShortlist(candidateCode: string) {
    try {
      const response = await fetch("/api/v1/institution/shortlist", { method: "POST", headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) }, body: JSON.stringify({ candidateCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Shortlist belum dapat diperbarui.");
      setShortlist((current) => body.data.shortlisted ? [...new Set([...current, candidateCode])] : current.filter((item) => item !== candidateCode));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Shortlist belum dapat diperbarui."); }
  }

  async function submitRequest() {
    if (!selected || scopes.length === 0) return;
    setSending(true); setMessage("");
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({ candidateCode: selected.candidateCode, purposeCode: "program_review", purposeDescription: purpose,
          requestedScopes: scopes, requiredScopes: ["financial_summary"].filter((item) => scopes.includes(item as ConsentScope)),
          requestedDurationDays: duration, downloadRequested }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan belum dapat dikirim.");
      setCandidates((current) => current.map((item) => item.candidateCode === selected.candidateCode ? { ...item, requestStatus: "pending" } : item));
      setSelected(null); setMessage("Ketertarikan berhasil dikirim. Admin akan meninjau permintaan dan menghubungkan Anda jika disetujui.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan belum dapat dikirim."); }
    finally { setSending(false); }
  }

  return <DashboardPage>
    <PageHeader title="Kandidat pendanaan" description="Bandingkan kesiapan data usaha secara anonim. Filter dihitung di server; tanpa skor, tanpa ranking, tanpa rupiah." icon={Building2} actions={<StatusBadge tone="success"><ShieldCheck size={13} className="mr-1.5" />Identitas tersamar</StatusBadge>} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Saring berdasarkan bidang usaha">{sectors.map((item) => <button key={item} onClick={() => apply({ sector: item })} className={`min-h-10 rounded-full px-4 text-xs font-bold ${sector === item ? "bg-[#0b5f86] text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{item}</button>)}</div>
    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[auto_1fr_1fr_1fr_1fr_auto] md:items-end">
      <div className="flex items-center gap-2 text-xs font-black text-slate-700"><SlidersHorizontal size={15} className="text-[#0b5f86]" />Saring kandidat</div>
      <label className="text-xs font-bold text-slate-600">Wilayah<select value={region} onChange={(event) => apply({ region: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="Semua">Semua wilayah</option>{regions.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Kesiapan min.<select value={readinessFilter} onChange={(event) => apply({ readiness: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="Semua">Semua tingkat</option>{readinessBands.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Umur catatan<select value={recordingFilter} onChange={(event) => apply({ recording: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="Semua">Semua</option>{recordingLevels.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Legalitas<select value={legalFilter} onChange={(event) => apply({ legal: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option>Semua</option><option>Lengkap</option><option>Belum</option></select></label>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><ArrowDownUp size={14} /><select aria-label="Urutkan kandidat" value={sortBy} onChange={(event) => apply({ sort: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="newest">Terbaru bergabung</option><option value="region">Wilayah</option></select></label>
    </div>
    <div className="mb-4 flex items-center justify-between text-xs text-slate-500"><span>{visible.length} dari {total} kandidat tampil</span><span className="flex items-center gap-1 font-semibold text-[#0b5f86]"><Bookmark size={13} />{shortlist.length} tersimpan</span></div>
    {loading ? <p className="py-16 text-center text-sm text-slate-500">Memuat daftar usaha...</p> : <div className="grid gap-4 lg:grid-cols-2">{visible.map((candidate) => <article key={candidate.candidateCode} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0b5f86]"><Building2 size={21} /></span><div><h2 className="font-bold text-slate-900">{candidate.candidateCode}</h2><p className="text-xs text-slate-500">{candidate.sector} · Wilayah {candidate.generalLocation}</p></div></div><div className="flex items-center gap-2"><button type="button" aria-label={shortlist.includes(candidate.candidateCode) ? "Hapus dari shortlist" : "Simpan ke shortlist"} onClick={() => void toggleShortlist(candidate.candidateCode)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${shortlist.includes(candidate.candidateCode) ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400 hover:text-[#0b5f86]"}`} title={shortlist.includes(candidate.candidateCode) ? "Tersimpan" : "Simpan kandidat"}>{shortlist.includes(candidate.candidateCode) ? <Check size={16} /> : <Bookmark size={16} />}</button><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{candidate.readinessLevel}</span></div></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><Info label="Umur catatan" value={candidate.recordingAgeBand} /><Info label="Kebiasaan mencatat" value={candidate.recordingActivity} /><Info label="Fondasi legalitas" value={candidate.legalComplete ? "Lengkap" : `${candidate.legalEvidenceCount} jenis tersedia`} /><Info label="Bukti tersedia" value={candidate.evidenceAvailability.length ? `${candidate.evidenceAvailability.length} jenis` : "Belum ada"} /></div>
      <button disabled={candidate.requestStatus === "pending" || candidate.dossierStatus === "ready"} onClick={() => { setSelected(candidate); setScopes(defaultScopes); }} className="mt-5 min-h-11 w-full rounded-xl bg-[#0b5f86] px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">{candidate.dossierStatus === "ready" ? "Profil sudah dibuka" : candidate.requestStatus === "pending" ? "Menunggu review admin" : "Ajukan ketertarikan"}</button>
    </article>)}</div>}
    {!loading && visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><FileSearch className="mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold text-slate-700">Belum ada usaha pada saringan ini</p></div>}

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="request-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><h2 id="request-title" className="text-lg font-black text-slate-900">Ajukan ketertarikan pada {selected.candidateCode}</h2><p className="mt-1 text-sm text-slate-600">Admin akan meninjau permintaan dan memediasi pembukaan identitas serta kontak.</p></div><button aria-label="Tutup" onClick={() => setSelected(null)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button></div>
      <label className="mt-5 block text-xs font-bold text-slate-700">Tujuan penggunaan data (maks 300 karakter)<textarea value={purpose} onChange={(event) => setPurpose(event.target.value.slice(0, 300))} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal" /></label>
      <fieldset className="mt-5"><legend className="text-xs font-bold text-slate-700">Bagian data yang diminta</legend><div className="mt-2 space-y-2">{(Object.keys(consentScopeLabels) as ConsentScope[]).map((scope) => { const item = consentScopeLabels[scope]; const checked = scopes.includes(scope); return <label key={scope} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={checked} onChange={() => toggleScope(scope)} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-bold text-slate-800">{item.label}</span><span className="block text-xs leading-5 text-slate-500">{item.description}</span></span></label>; })}</div></fieldset>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Masa izin (template SPEC)<select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal">{durationTemplates.map((template) => <option key={template.days} value={template.days}>{template.label}</option>)}</select></label><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={downloadRequested} onChange={(event) => setDownloadRequested(event.target.checked)} />Minta izin menyimpan ringkasan</label></div>
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Maksimal 20 permintaan per organisasi per hari. Admin platform memeriksa tujuan permintaan.</p>
      <div className="mt-5 flex gap-3"><button onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">Batal</button><button disabled={sending || scopes.length === 0 || purpose.trim().length < 10} onClick={() => void submitRequest()} className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] text-sm font-bold text-white disabled:opacity-50">{sending ? "Mengirim..." : "Kirim permintaan"}</button></div>
    </section></div>}
  </DashboardPage>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 flex items-center gap-1 font-bold text-slate-800"><MapPin size={12} className="text-slate-400" />{value}</p></div>; }
