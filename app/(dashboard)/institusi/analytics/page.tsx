import { BarChart3, CheckCircle2, FileSearch, Percent, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ComparisonBarChart, DashboardPage, DashboardPanel, MetricCard, PageHeader, PanelHeader } from "@/components/dashboard";

type RequestRow = { status: string; created_at: string };
type GrantRow = { status: string };
type AccessRow = { outcome: string; action: string; occurred_at: string };

type Analytics = {
  candidateCount: number;
  requestCount: number;
  approvedCount: number;
  accessCount: number;
  conversion: string;
  weeklyRequests: { label: string; primary: number }[];
};

async function loadAnalytics(): Promise<Analytics> {
  const empty = { candidateCount: 0, requestCount: 0, approvedCount: 0, accessCount: 0, conversion: "0%", weeklyRequests: [] };
  try {
    const client = await createServerSupabaseClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return empty;
    const { data: member } = await client.from("institution_members").select("institution_id").eq("user_id", auth.user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
    if (!member) return empty;
    const [candidates, requests, grants, accessEvents] = await Promise.all([
      client.rpc("list_anonymous_business_candidates", {}),
      client.from("dossier_requests").select("status,created_at").eq("institution_id", member.institution_id),
      client.from("consent_grants").select("status").eq("institution_id", member.institution_id),
      client.from("dossier_access_events").select("outcome,action,occurred_at").eq("institution_id", member.institution_id),
    ]);
    const requestRows = (requests.data ?? []) as RequestRow[];
    const grantRows = (grants.data ?? []) as GrantRow[];
    const accessRows = (accessEvents.data ?? []) as AccessRow[];
    const approvedCount = grantRows.length;
    const conversion = requestRows.length ? `${((approvedCount / requestRows.length) * 100).toFixed(1).replace(".", ",")}%` : "0%";
    const now = new Date();
    const weeklyRequests = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(now);
      start.setDate(now.getDate() - ((6 - index) * 7 + 6));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { label: `M-${6 - index}`, primary: requestRows.filter((request) => { const created = new Date(request.created_at); return created >= start && created < end; }).length };
    });
    return {
      candidateCount: Array.isArray(candidates.data) ? candidates.data.length : 0,
      requestCount: requestRows.length,
      approvedCount,
      accessCount: accessRows.filter((event) => event.outcome === "allowed").length,
      conversion,
      weeklyRequests,
    };
  } catch {
    return empty;
  }
}

export default async function DashboardAnalyticsPage() {
  const data = await loadAnalytics();
  return <DashboardPage>
    <PageHeader title="Analitik program" description="Pantau pencocokan kandidat dan aktivitas profil berizin berdasarkan data operasional." icon={BarChart3} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Kandidat aktif" value={String(data.candidateCount)} helper="Usaha anonim yang tersedia" icon={Users} tone="brand" />
      <MetricCard label="Permintaan akses" value={String(data.requestCount)} helper="Seluruh status permintaan" icon={FileSearch} tone="attention" />
      <MetricCard label="Profil disetujui" value={String(data.approvedCount)} helper="Snapshot yang pernah dibuat" icon={CheckCircle2} tone="success" />
      <MetricCard label="Tingkat persetujuan" value={data.conversion} helper="Persetujuan dibanding permintaan" icon={Percent} tone="attention" />
    </section>
    <DashboardPanel>
      <PanelHeader title="Permintaan akses per minggu" description="Jumlah permintaan yang dibuat institusi dalam tujuh minggu terakhir." />
      <div className="p-5"><ComparisonBarChart data={data.weeklyRequests} primaryLabel="Permintaan akses" /></div>
    </DashboardPanel>
    <p className="text-xs text-slate-500">Akses profil tercatat: {data.accessCount} kali. Angka ini menghitung pembukaan atau pemeriksaan yang diizinkan.</p>
  </DashboardPage>;
}
