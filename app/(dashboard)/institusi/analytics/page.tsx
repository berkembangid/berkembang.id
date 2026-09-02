import { BarChart3, CheckCircle2, Percent, Users } from "lucide-react";
import DemoBanner from "@/components/DemoBanner";
import { ComparisonBarChart, DashboardPage, DashboardPanel, MetricCard, PageHeader, PanelHeader } from "@/components/dashboard";

const MATCH_DATA = [
  { label: "M1", primary: 12 }, { label: "M2", primary: 18 },
  { label: "M3", primary: 15 }, { label: "M4", primary: 22 },
  { label: "M5", primary: 19 }, { label: "M6", primary: 27 },
  { label: "M7", primary: 31 },
];

export default function DashboardAnalyticsPage() {
  return (
    <DashboardPage>
      <DemoBanner>Seluruh metrik analitik di halaman ini adalah data simulasi.</DemoBanner>
      <PageHeader title="Analitik program" description="Pantau aktivitas pencocokan dan penggunaan profil berizin pada program berjalan." icon={BarChart3} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Total kecocokan" value="144" helper="Usaha yang sesuai dengan program" icon={Users} tone="brand" />
        <MetricCard label="Profil berizin" value="87" helper="Dari 234 permintaan akses" icon={CheckCircle2} tone="success" />
        <MetricCard label="Tingkat konversi" value="37,2%" helper="Profil berizin yang dilanjutkan" icon={Percent} tone="attention" />
      </section>
      <DashboardPanel>
        <PanelHeader title="Kecocokan per minggu" description="Jumlah usaha yang sesuai dengan kriteria program pada tujuh minggu terakhir." />
        <div className="p-5"><ComparisonBarChart data={MATCH_DATA} primaryLabel="Usaha cocok" /></div>
      </DashboardPanel>
    </DashboardPage>
  );
}
