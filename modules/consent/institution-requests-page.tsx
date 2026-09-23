"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Ban, CalendarDays, CheckCircle2, Clock3, FolderOpen, Hourglass, RefreshCw, TimerOff, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { usePortal } from "@/modules/consent/portal-copy";
import { BusinessFacts, BusinessHeading, CardSkeleton, Empty, SearchBox, formatDate, relativeDays, type BusinessSummary } from "@/modules/consent/candidate-ui";

type DossierRef = { id: string; request_id: string; status: string; expires_at: string | null };
type GrantRef = { request_id: string; scopes: string[]; status: string; expires_at: string | null; download_allowed: boolean };

type Request = {
  id: string; institution_id: string; candidateCode: string; purpose_description: string; requested_scopes: string[];
  requested_duration_days: number; download_requested?: boolean; status: string; created_at: string; expires_at: string | null;
  programName?: string | null; business?: BusinessSummary | null;
};

type StatusKey = "pending" | "approved" | "rejected" | "expired" | "cancelled";

const STATUS: Record<StatusKey, { label: string; Icon: LucideIcon; badge: string; hint: string }> = {
  pending: { label: "Menunggu tinjauan", Icon: Hourglass, badge: "border-[#f5d58a] bg-[#fff8e6] text-[#6b4700]", hint: "Admin platform sedang memeriksa tujuan permintaan ini." },
  approved: { label: "Disetujui", Icon: CheckCircle2, badge: "border-[#a9ebd0] bg-[#edfbf5] text-[#0a5c42]", hint: "Profilnya bisa dibuka di Dosir selama izinnya berlaku." },
  rejected: { label: "Ditolak", Icon: XCircle, badge: "border-[#f4b0a8] bg-[#feecea] text-[#8a1c12]", hint: "Permintaan ini tidak diteruskan ke pemilik usaha." },
  expired: { label: "Kedaluwarsa", Icon: TimerOff, badge: "border-[#c8d3de] bg-[#f3f6f9] text-[#34496a]", hint: "Masa izinnya habis. Ajukan pembaruan untuk snapshot baru." },
  cancelled: { label: "Dibatalkan", Icon: Ban, badge: "border-[#c8d3de] bg-[#f3f6f9] text-[#34496a]", hint: "Permintaan ini dibatalkan." },
};

const TABS: Array<{ key: "all" | StatusKey; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "expired", label: "Kedaluwarsa" },
  { key: "rejected", label: "Ditolak" },
  { key: "cancelled", label: "Dibatalkan" },
];

function statusOf(value: string) {
  return STATUS[value as StatusKey] ?? { label: value, Icon: Clock3, badge: STATUS.cancelled.badge, hint: "" };
}

export default function InstitutionRequestsPage() {
  const portal = usePortal();
  const portalBase = portal.base;
  const { selectedId } = useInstitution();
  const [requests, setRequests] = useState<Request[]>([]);
  const [dossiers, setDossiers] = useState<DossierRef[]>([]);
  const [grants, setGrants] = useState<GrantRef[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | StatusKey>("all");
  const [query, setQuery] = useState("");

  const load = useCallback((signal?: AbortSignal) => {
    return fetch("/api/v1/profile-access/requests", { cache: "no-store", signal, headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Permintaan belum dapat dimuat.");
        setLoadError("");
        setRequests(body.data?.requests ?? []);
        setDossiers(body.data?.dossiers ?? []);
        setGrants(body.data?.grants ?? []);
      })
      .catch((error) => { if (!(error instanceof Error && error.name === "AbortError")) setLoadError(error instanceof Error ? error.message : "Permintaan belum dapat dimuat."); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // `?id=` dari pemberitahuan: kartu permintaannya disorot dan digulir ke
  // tengah layar, bukan dibiarkan dicari di antara puluhan kartu lain.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const wanted = new URLSearchParams(window.location.search).get("id");
    if (!wanted || !requests.some((item) => item.id === wanted)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sekali, setelah daftar termuat
    setHighlight(wanted);
    window.setTimeout(() => document.getElementById(`permintaan-${wanted}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [loading, requests]);

  /** Dosir aktif milik sebuah permintaan, untuk tombol "Buka dosir" yang langsung ke dialognya. */
  const dossierFor = useCallback((requestId: string) => dossiers.find((item) =>
    item.request_id === requestId && item.status === "ready" && (!item.expires_at || new Date(item.expires_at) > new Date()))?.id ?? null, [dossiers]);

  async function refresh(request: Request) {
    setBusy(request.id);
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          candidateCode: request.candidateCode,
          purposeCode: "dossier_refresh",
          purposeDescription: "Meminta pembaruan dossier dengan data terbaru usaha.",
          // Lingkup, masa, dan izin unduh permintaan asal -- bukan "unduh, 30
          // hari" untuk semua. Pembaruan tidak boleh meminta lebih dari yang
          // dulu disetujui pemiliknya.
          requestedScopes: request.requested_scopes,
          requiredScopes: [],
          requestedDurationDays: request.requested_duration_days,
          downloadRequested: request.download_requested === true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan pembaruan belum dapat dikirim.");
      notifySuccess("Permintaan pembaruan terkirim", {
        description: "Snapshot baru dibuat setelah admin menyetujuinya.",
      });
      void load();
    } catch (error) {
      notifyFromError(error, "Permintaan pembaruan belum dapat dikirim.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Permintaan dibatasi ke organisasi yang sedang dipilih. API-nya
   * mengembalikan permintaan semua organisasi tempat orang ini bernaung, dan
   * petugas yang berpindah organisasi di menu samping tidak boleh melihat
   * permintaan organisasi lain seolah miliknya.
   */
  const scoped = useMemo(
    () => selectedId ? requests.filter((item) => !item.institution_id || item.institution_id === selectedId) : requests,
    [requests, selectedId],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: scoped.length };
    for (const item of scoped) result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, [scoped]);
  const needle = query.trim().toLowerCase();
  const visible = scoped.filter((item) =>
    (tab === "all" || item.status === tab)
    && (!needle || [item.candidateCode, item.business?.sector, item.business?.generalLocation].some((value) => value?.toLowerCase().includes(needle))));

  return <DashboardPage>
    <PageHeader title={portal.requestsTitle} description="Setiap usaha yang pernah Anda minta profilnya, beserta status tinjauan admin dan masa izinnya." icon={Clock3} />
    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Summary label="Menunggu" value={counts.pending ?? 0} Icon={Hourglass} tone="text-[#b7791f] bg-[#fff8e6]" onClick={() => setTab("pending")} />
      <Summary label="Disetujui" value={counts.approved ?? 0} Icon={CheckCircle2} tone="text-[#12906a] bg-[#edfbf5]" onClick={() => setTab("approved")} />
      <Summary label="Kedaluwarsa" value={counts.expired ?? 0} Icon={TimerOff} tone="text-[#4a6280] bg-[#f3f6f9]" onClick={() => setTab("expired")} />
      <Summary label="Ditolak" value={counts.rejected ?? 0} Icon={XCircle} tone="text-[#c0392b] bg-[#feecea]" onClick={() => setTab("rejected")} />
    </div>

    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-3 shadow-[0_1px_2px_rgba(16,40,64,.04)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0" role="tablist" aria-label="Saring berdasarkan status">
          <div className="flex w-max gap-1.5">
            {TABS.filter((item) => item.key === "all" || item.key === tab || (counts[item.key] ?? 0) > 0).map((item) => {
              const active = tab === item.key;
              return <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(item.key)} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-bold transition-colors ${active ? "bg-[#0b5f86] text-white" : "text-[#4a6280] hover:bg-[#f3f6f9]"}`}>
                {item.label}<span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-[#eef2f6] text-[#6e859e]"}`}>{counts[item.key] ?? 0}</span>
              </button>;
            })}
          </div>
        </div>
        <SearchBox value={query} onChange={setQuery} />
      </div>
    </section>

    {loading ? <div className="space-y-3" aria-hidden>{Array.from({ length: 3 }, (_, index) => <CardSkeleton key={index} />)}</div>
      : scoped.length === 0 ? <Empty
        title="Belum ada permintaan"
        description={`Cari usaha yang cocok di ${portal.discoverLabel}, lalu tekan Ajukan ketertarikan. Permintaannya muncul di sini beserta statusnya.`}
        action={{ label: portal.discoverCta, href: portalBase }}
      />
      : visible.length === 0 ? <Empty
        title="Tidak ada yang cocok"
        description="Coba status lain atau kosongkan pencarian."
        onReset={() => { setTab("all"); setQuery(""); }}
      />
      : <div className="space-y-3">{visible.map((request) => <RequestCard
        key={request.id}
        request={request}
        dossierHref={dossierFor(request.id) ? `${portalBase}/dosir?id=${dossierFor(request.id)}` : `${portalBase}/dosir`}
        highlighted={highlight === request.id}
        grant={grants.find((grant) => grant.request_id === request.id) ?? null}
        busy={busy === request.id}
        onRefresh={() => void refresh(request)}
      />)}</div>}
  </DashboardPage>;
}

function RequestCard({ request, dossierHref, highlighted, grant, busy, onRefresh }: { request: Request; dossierHref: string; highlighted: boolean; grant: GrantRef | null; busy: boolean; onRefresh: () => void }) {
  const status = statusOf(request.status);
  const canRefresh = request.status === "approved" || request.status === "expired";
  const title = request.business?.candidateCode ?? request.candidateCode;

  return <article id={`permintaan-${request.id}`} className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)] transition-colors ${highlighted ? "border-[#0b5f86] ring-2 ring-[#0b5f86]/15" : "border-[#e3e9f0]"}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <BusinessHeading title={title} summary={request.business ?? null} />
      <span className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-[11px] font-bold ${status.badge}`}><status.Icon size={13} />{status.label}</span>
    </div>

    {request.business && <div className="mt-4"><BusinessFacts summary={request.business} /></div>}

    {/*
      Yang DISETUJUI, bukan yang diminta. Pemilik bisa menyetujui sebagian
      lingkup saja, dan petugas yang mengira identitas dan kontak ikut terbuka
      akan mencarinya di dosir tanpa pernah menemukannya.
    */}
    {grant && request.status === "approved" && <div className="mt-4 rounded-xl border border-[#a9ebd0] bg-[#f3fcf8] p-3.5 text-xs text-[#0a5c42]">
      <p className="font-bold">Disetujui {grant.scopes.length} dari {request.requested_scopes.length} bagian{grant.download_allowed ? " · boleh diunduh" : " · hanya lihat"}</p>
      <p className="mt-1 leading-relaxed">
        {grant.scopes.includes("business_identity")
          ? "Identitas dan kontak usaha terbuka di dosir. Hubungi pemiliknya lewat kontak di sana."
          : "Identitas usaha tetap tersamar — pemilik tidak menyetujui bagian identitas dan kontak."}
      </p>
      {grant.scopes.length < request.requested_scopes.length && <p className="mt-1 text-[#4a6280]">Tidak disetujui: {request.requested_scopes.filter((scope) => !grant.scopes.includes(scope)).map((scope) => consentScopeLabels[scope as ConsentScope]?.label ?? scope).join(", ")}.</p>}
    </div>}

    <div className="mt-4 rounded-xl border border-[#eef2f6] p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8aa0b6]">Tujuan permintaan</p>
      <p className="mt-1 text-sm leading-relaxed text-[#34496a]">{request.purpose_description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{request.requested_scopes.map((scope) => <span key={scope} className="rounded-full bg-[#f3f6f9] px-2.5 py-1 text-[11px] font-semibold text-[#4a6280]">{consentScopeLabels[scope as ConsentScope]?.label ?? scope}</span>)}</div>
    </div>

    <div className="mt-4 flex flex-col gap-3 border-t border-[#eef2f6] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6e859e]">
        <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Diajukan {relativeDays(request.created_at)} · {formatDate(request.created_at)}</span>
        <span>Masa izin {request.requested_duration_days} hari</span>
        {request.programName && <span>Program {request.programName}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {canRefresh && <button type="button" disabled={busy} onClick={onRefresh} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d5dee8] px-3.5 text-xs font-bold text-[#34496a] hover:bg-[#f6f8fb] disabled:opacity-50">
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />{busy ? "Mengirim…" : "Minta pembaruan"}
        </button>}
        {request.status === "approved" && <Link href={dossierHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white hover:bg-[#094f70]">
          <FolderOpen size={14} />Buka dosir<ArrowRight size={13} />
        </Link>}
      </div>
    </div>
    {status.hint && request.status !== "approved" && <p className="mt-2 text-[11px] text-[#8aa0b6]">{status.hint}</p>}
  </article>;
}

function Summary({ label, value, Icon, tone, onClick }: { label: string; value: number; Icon: LucideIcon; tone: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-[#e3e9f0] bg-white p-3.5 text-left transition-colors hover:border-[#c7e3f2]">
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span>
    <span><span className="block text-xl font-bold leading-none text-[#1b2a3a]">{value}</span><span className="mt-1 block text-[11px] font-semibold text-[#6e859e]">{label}</span></span>
  </button>;
}
