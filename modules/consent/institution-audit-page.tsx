"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, PencilLine, Plus, ScrollText, Trash2 } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { Empty } from "@/modules/consent/candidate-ui";
import { usePortal } from "@/modules/consent/portal-copy";

type LogRow = {
  id: string;
  member_id: string | null;
  business_id: string | null;
  artifact: string;
  action: string;
  occurred_at: string;
  memberName: string | null;
  businessCode: string | null;
};

const artifactLabels: Record<string, string> = {
  CANDIDATE_LIST: "daftar kandidat",
  SHORTLIST: "daftar tersimpan",
  ORGANIZATION: "halaman organisasi",
  PROGRAM_DASH: "ringkasan program",
  DOSSIER: "dosir",
  PDF: "PDF dosir",
  REQUEST: "permintaan izin",
  PROGRAM: "program",
  MEMBER: "anggota",
  API_KEY: "kunci API dosir",
};

/** Kata kerja per tindakan. SHORTLIST punya kata sendiri: menyimpan, bukan membuat. */
function verb(artifact: string, action: string) {
  if (artifact === "SHORTLIST" && action === "create") return "menyimpan kandidat ke";
  if (artifact === "SHORTLIST" && action === "delete") return "melepas kandidat dari";
  if (artifact === "REQUEST" && action === "create") return "mengirim";
  if (artifact === "MEMBER" && action === "create") return "menambah";
  if (artifact === "MEMBER" && action === "update") return "mengubah status";
  if (artifact === "MEMBER" && action === "delete") return "mengeluarkan";
  if (artifact === "API_KEY" && action === "create") return "menerbitkan";
  return { download: "mengunduh", create: "membuat", update: "menyunting", delete: "menghapus" }[action] ?? "membuka";
}

const actionStyle: Record<string, { Icon: typeof Eye; tone: string }> = {
  view: { Icon: Eye, tone: "bg-[#eef8fd] text-[#0f73a3]" },
  download: { Icon: Download, tone: "bg-[#fff8e6] text-[#b7791f]" },
  create: { Icon: Plus, tone: "bg-[#edfbf5] text-[#12906a]" },
  update: { Icon: PencilLine, tone: "bg-[#f3f6f9] text-[#4a6280]" },
  delete: { Icon: Trash2, tone: "bg-[#feecea] text-[#b4304a]" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "Semua" },
  { key: "DOSSIER", label: "Dosir" },
  { key: "PDF", label: "Unduhan PDF" },
  { key: "REQUEST", label: "Permintaan" },
  { key: "CANDIDATE_LIST", label: "Daftar kandidat" },
  { key: "SHORTLIST", label: "Tersimpan" },
  { key: "PROGRAM_DASH", label: "Program" },
  { key: "ORGANIZATION", label: "Organisasi" },
  { key: "MEMBER", label: "Anggota" },
];

const dayFormat = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function InstitutionAuditPage() {
  const portal = usePortal();
  const { selectedId } = useInstitution();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");

  const fetchPage = useCallback(async (before: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (filter) params.set("jenis", filter);
    if (before) params.set("sebelum", before);
    const response = await fetch(`/api/v1/institution/audit?${params.toString()}`, { cache: "no-store", signal, headers: institutionHeaders(selectedId) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Log audit belum dapat dimuat.");
    return { rows: (body.data ?? []) as LogRow[], hasMore: Boolean(body.hasMore) };
  }, [filter, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(null, controller.signal)
      .then((page) => { setLogs(page.rows); setHasMore(page.hasMore); setLoadError(""); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fetchPage]);

  async function loadMore() {
    const last = logs[logs.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(last.occurred_at);
      setLogs((current) => [...current, ...page.rows.filter((row) => !current.some((item) => item.id === row.id))]);
      setHasMore(page.hasMore);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Log audit belum dapat dimuat.");
    } finally {
      setLoadingMore(false);
    }
  }

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; rows: LogRow[] }> = [];
    for (const row of logs) {
      const key = dayKey(row.occurred_at);
      const group = result[result.length - 1];
      if (group?.key === key) group.rows.push(row);
      else result.push({ key, label: dayFormat.format(new Date(row.occurred_at)), rows: [row] });
    }
    return result;
  }, [logs]);

  return <DashboardPage>
    <PageHeader title={portal.auditTitle} description="Setiap pembukaan dan unduhan tercatat: siapa, membuka apa, kapan. Terlihat oleh pengelola organisasi dan pemilik usaha." icon={ScrollText} />
    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Saring jenis aktivitas">
      <div className="flex w-max gap-1.5">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return <button key={item.key || "all"} type="button" aria-pressed={active} onClick={() => { setLoading(true); setFilter(item.key); }} className={`min-h-10 rounded-full px-4 text-xs font-bold transition-colors ${active ? "bg-[#0b5f86] text-white" : "border border-[#d5dee8] bg-white text-[#4a6280] hover:border-[#0b5f86]/40"}`}>{item.label}</button>;
        })}
      </div>
    </div>

    {loading ? <div className="space-y-2" aria-hidden>{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-white" />)}</div>
      : loadError && logs.length === 0 ? null
      : logs.length === 0 ? <Empty title="Belum ada aktivitas tercatat" description={filter ? "Belum ada aktivitas jenis ini. Pilih Semua untuk melihat yang lain." : "Pembukaan dosir, unduhan PDF, daftar kandidat, dan halaman organisasi akan muncul di sini."} onReset={filter ? () => { setLoading(true); setFilter(""); } : undefined} />
      : <div className="space-y-5">
        {groups.map((group) => <section key={group.key}>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6e859e]">{group.label}</h2>
          <ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e3e9f0] bg-white">
            {group.rows.map((log) => {
              const style = actionStyle[log.action] ?? actionStyle.view;
              return <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${style.tone}`}><style.Icon size={14} /></span>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="text-[#34496a]">
                    <span className="font-bold text-[#1b2a3a]">{log.memberName ?? "Sistem"}</span>
                    {" "}{verb(log.artifact, log.action)} {artifactLabels[log.artifact] ?? "halaman"}
                    {log.businessCode && <> <span className="font-mono font-bold text-[#1b2a3a]">{log.businessCode}</span></>}
                  </p>
                </div>
                <time dateTime={log.occurred_at} className="shrink-0 text-[11px] tabular-nums text-[#8aa0b6]">{timeFormat.format(new Date(log.occurred_at))}</time>
              </li>;
            })}
          </ul>
        </section>)}
        {hasMore && <div className="flex justify-center">
          <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-[#d5dee8] bg-white px-5 text-sm font-bold text-[#0b5f86] hover:border-[#0b5f86]/40 disabled:opacity-60">{loadingMore ? "Memuat…" : "Muat aktivitas sebelumnya"}</button>
        </div>}
      </div>}
  </DashboardPage>;
}
