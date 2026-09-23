import Link from "next/link";
import { BarChart3, CheckCircle2, Eye, FileSearch, LayoutGrid, Percent, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { selectedInstitutionFromCookies } from "@/lib/api/institution";
import {
  ComparisonBarChart, DashboardPage, DashboardPanel, FeedbackBanner, MetricCard, PageHeader, PanelHeader,
} from "@/components/dashboard";

type RequestRow = { status: string; created_at: string; program_id: string | null };
type GrantRow = { status: string; expires_at: string | null };
type AccessRow = { outcome: string };
type ProgramRow = { id: string; name: string; status: string };

type Analytics = {
  candidateCount: number;
  requestCount: number;
  approvedCount: number;
  everApproved: number;
  accessCount: number;
  conversion: string;
  weeklyRequests: { label: string; primary: number }[];
  perProgram: { id: string; name: string; status: string; requests: number }[];
  unassigned: number;
};

const WEEKS = 7;
const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

/**
 * Dulu setiap galat di sini ditelan dan dikembalikan sebagai angka nol --
 * layar yang gagal memuat tampil persis seperti lembaga yang belum pernah
 * bekerja. Kini kegagalan dikembalikan sebagai kegagalan.
 */
async function loadAnalytics(): Promise<{ data: Analytics } | { error: string }> {
  const now = new Date();
  try {
    // Organisasi yang dipilih di menu samping (lewat kuki), bukan keanggotaan
    // pertama. Dulu anggota dua organisasi selalu melihat angka organisasi
    // tertuanya, apa pun yang ia pilih.
    const selected = await selectedInstitutionFromCookies();
    const client = await createServerSupabaseClient({ institutionId: selected });
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return { error: "Sesi berakhir. Silakan masuk kembali." };
    const { data: institutionId } = await client.rpc("resolve_my_institution_id", selected ? { p_institution_id: selected } : {});
    if (typeof institutionId !== "string") return { error: "Organisasi Anda belum aktif, jadi analitiknya belum tersedia." };

    const [candidates, requests, grants, accessEvents, programs] = await Promise.all([
      client.rpc("list_anonymous_business_candidates", { p_institution_id: institutionId, p_limit: 1 }),
      client.from("dossier_requests").select("status,created_at,program_id").eq("institution_id", institutionId),
      client.from("consent_grants").select("status,expires_at").eq("institution_id", institutionId),
      client.from("dossier_access_events").select("outcome").eq("institution_id", institutionId).eq("outcome", "allowed"),
      client.from("programs").select("id,name,status").eq("institution_id", institutionId).order("created_at", { ascending: false }),
    ]);
    const failed = [candidates.error, requests.error, grants.error, accessEvents.error, programs.error].find(Boolean);
    if (failed) return { error: "Sebagian angka belum dapat dimuat. Muat ulang halaman sebentar lagi." };

    const requestRows = (requests.data ?? []) as RequestRow[];
    const grantRows = (grants.data ?? []) as GrantRow[];
    const accessRows = (accessEvents.data ?? []) as AccessRow[];
    const programRows = (programs.data ?? []) as ProgramRow[];
    // Izin yang masih berlaku saja; tingkat persetujuan tetap memakai semua
    // izin yang pernah diberikan, karena yang diukur adalah keputusannya.
    const approvedCount = grantRows.filter((grant) => grant.status === "active" && (!grant.expires_at || new Date(grant.expires_at) > now)).length;
    const everApproved = grantRows.length;
    const conversion = requestRows.length ? `${((everApproved / requestRows.length) * 100).toFixed(0)}%` : "—";

    // Label minggu berupa tanggal awalnya ("15 Sep"), bukan "M-6".
    const weeklyRequests = Array.from({ length: WEEKS }, (_, index) => {
      const start = new Date(now);
      start.setDate(now.getDate() - ((WEEKS - 1 - index) * 7 + 6));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return {
        label: shortDate.format(start),
        primary: requestRows.filter((request) => { const created = new Date(request.created_at); return created >= start && created < end; }).length,
      };
    });

    const perProgram = programRows.map((program) => ({
      ...program,
      requests: requestRows.filter((request) => request.program_id === program.id).length,
    }));

    return {
      data: {
        // RPC ini mengembalikan `{ candidates, total }`, bukan larik. Dulu
        // `Array.isArray` selalu salah, jadi "Kandidat aktif" selalu 0.
        candidateCount: Number((candidates.data as { total?: number } | null)?.total ?? 0),
        requestCount: requestRows.length,
        approvedCount,
        everApproved,
        accessCount: accessRows.length,
        conversion,
        weeklyRequests,
        perProgram,
        unassigned: requestRows.filter((request) => !request.program_id).length,
      },
    };
  } catch {
    return { error: "Analitik belum dapat dimuat. Periksa koneksi, lalu muat ulang halaman." };
  }
}

export default async function LembagaAnalyticsPage() {
  const result = await loadAnalytics();
  const header = <PageHeader
    title="Analitik program"
    description="Permintaan akses dan profil berizin organisasi Anda. Semua angka agregat — tanpa rupiah per usaha."
    icon={BarChart3}
    actions={<Link href="/lembaga/program" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d5dee8] bg-white px-3.5 text-xs font-bold text-[#0b5f86] hover:bg-[#f6f8fb]"><LayoutGrid size={14} />Kelola program</Link>}
  />;

  if ("error" in result) {
    return <DashboardPage>{header}<FeedbackBanner tone="error" title="Analitik belum tampil">{result.error}</FeedbackBanner></DashboardPage>;
  }

  const data = result.data;
  const maxProgram = Math.max(1, ...data.perProgram.map((row) => row.requests));

  return <DashboardPage>
    {header}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Kandidat tersedia" value={data.candidateCount.toLocaleString("id-ID")} helper="Usaha yang bisa Anda temukan hari ini" icon={Users} tone="brand" />
      <MetricCard label="Permintaan akses" value={data.requestCount.toLocaleString("id-ID")} helper="Seluruh status, sejak awal" icon={FileSearch} tone="neutral" />
      <MetricCard label="Izin berlaku" value={data.approvedCount.toLocaleString("id-ID")} helper={`${data.everApproved.toLocaleString("id-ID")} izin pernah diberikan`} icon={CheckCircle2} tone="success" />
      <MetricCard label="Tingkat persetujuan" value={data.conversion} helper="Izin yang diberikan dibanding permintaan" icon={Percent} tone="brand" />
    </section>

    <DashboardPanel>
      <PanelHeader title="Permintaan akses per minggu" description={`Tujuh minggu terakhir. Label adalah tanggal awal minggunya.`} />
      <div className="p-5 pt-0">
        {data.requestCount === 0
          ? <p className="rounded-xl bg-[#f6f8fb] p-6 text-center text-xs text-[#6e859e]">Belum ada permintaan akses. Grafiknya muncul setelah permintaan pertama dikirim dari Temukan.</p>
          : <ComparisonBarChart data={data.weeklyRequests} primaryLabel="Permintaan akses" />}
      </div>
    </DashboardPanel>

    <DashboardPanel>
      <PanelHeader title="Permintaan per program" description="Permintaan yang dikirim lewat program pembinaan. Permintaan dari Temukan tanpa program dihitung terpisah." />
      {data.perProgram.length === 0
        ? <div className="p-5 pt-0"><p className="rounded-xl bg-[#f6f8fb] p-6 text-center text-xs text-[#6e859e]">Belum ada program. <Link href="/lembaga/program" className="font-bold text-[#0b5f86] underline underline-offset-2">Buat program</Link> untuk mengelompokkan peserta.</p></div>
        : <ul className="divide-y divide-[#eef2f6]">
          {data.perProgram.map((row) => <li key={row.id} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-bold text-[#1b2a3a]">{row.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[#34496a]">{row.requests} permintaan</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f6]"><div className="h-full rounded-full bg-[#0b5f86]" style={{ width: `${(row.requests / maxProgram) * 100}%` }} /></div>
          </li>)}
          <li className="flex items-baseline justify-between gap-3 px-5 py-3 text-xs text-[#6e859e]"><span>Tanpa program</span><span className="font-semibold tabular-nums">{data.unassigned} permintaan</span></li>
        </ul>}
    </DashboardPanel>

    <p className="inline-flex items-center gap-1.5 text-xs text-[#6e859e]"><Eye size={13} />Profil berizin dibuka atau diperiksa {data.accessCount.toLocaleString("id-ID")} kali. Setiap pembukaan tercatat di Log audit.</p>
  </DashboardPage>;
}
