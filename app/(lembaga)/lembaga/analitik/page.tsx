import { BarChart3, CheckCircle2, FileSearch, Percent, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { selectedInstitutionFromCookies } from "@/lib/api/institution";
import { ComparisonBarChart, DashboardPage, DashboardPanel, MetricCard, PageHeader, PanelHeader } from "@/components/dashboard";

type RequestRow = { status: string; created_at: string };
type GrantRow = { status: string; expires_at: string | null };
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
  const now = new Date();
  try {
    // Organisasi yang dipilih di menu samping (lewat kuki), bukan keanggotaan
    // pertama. Dulu anggota dua organisasi selalu melihat angka organisasi
    // tertuanya, apa pun yang ia pilih.
    const selected = await selectedInstitutionFromCookies();
    const client = await createServerSupabaseClient({ institutionId: selected });
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return empty;
    const { data: institutionId } = await client.rpc("resolve_my_institution_id", selected ? { p_institution_id: selected } : {});
    if (typeof institutionId !== "string") return empty;
    const [candidates, requests, grants, accessEvents] = await Promise.all([
      client.rpc("list_anonymous_business_candidates", { p_institution_id: institutionId, p_limit: 1 }),
      client.from("dossier_requests").select("status,created_at").eq("institution_id", institutionId),
      client.from("consent_grants").select("status,expires_at").eq("institution_id", institutionId),
      client.from("dossier_access_events").select("outcome,action,occurred_at").eq("institution_id", institutionId),
    ]);
    const requestRows = (requests.data ?? []) as RequestRow[];
    const grantRows = (grants.data ?? []) as GrantRow[];
    const accessRows = (accessEvents.data ?? []) as AccessRow[];
    // Izin yang masih berlaku saja. Dulu setiap izin dihitung, termasuk yang
    // sudah dicabut atau kedaluwarsa.
    const approvedCount = grantRows.filter((grant) => grant.status === "active" && (!grant.expires_at || new Date(grant.expires_at) > now)).length;
    const everApproved = grantRows.length;
    const conversion = requestRows.length ? `${((everApproved / requestRows.length) * 100).toFixed(1).replace(".", ",")}%` : "0%";
    const weeklyRequests = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(now);
      start.setDate(now.getDate() - ((6 - index) * 7 + 6));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { label: `M-${6 - index}`, primary: requestRows.filter((request) => { const created = new Date(request.created_at); return created >= start && created < end; }).length };
    });
    return {
      // RPC ini mengembalikan `{ candidates, total }`, bukan larik. Dulu
      // `Array.isArray` selalu salah, jadi "Kandidat aktif" selalu 0.
      candidateCount: Number((candidates.data as { total?: number } | null)?.total ?? 0),
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
      <MetricCard label="Profil disetujui" value={String(data.approvedCount)} helper="Izin yang masih berlaku" icon={CheckCircle2} tone="success" />
      <MetricCard label="Tingkat persetujuan" value={data.conversion} helper="Persetujuan dibanding permintaan" icon={Percent} tone="attention" />
    </section>
    <DashboardPanel>
      <PanelHeader title="Permintaan akses per minggu" description="Jumlah permintaan yang dibuat lembaga dalam tujuh minggu terakhir." />
      <div className="p-5"><ComparisonBarChart data={data.weeklyRequests} primaryLabel="Permintaan akses" /></div>
    </DashboardPanel>
    <p className="text-xs text-slate-500">Akses profil tercatat: {data.accessCount} kali. Angka ini menghitung pembukaan atau pemeriksaan yang diizinkan.</p>
  </DashboardPage>;
}
