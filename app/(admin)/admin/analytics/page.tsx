"use client";

const ANALYTICS = {
  weeklyUMKM: [120, 135, 148, 162, 155, 178, 195],
  retention: [100, 78, 65, 58, 52, 47, 43],
  funnel: [
    { label: "Onboarded", value: 1247, color: "#001b85" },
    { label: "Konsisten 14d", value: 823, color: "#006a6a" },
    { label: "Urus NIB", value: 412, color: "#15803d" },
    { label: "Score ≥ 70", value: 203, color: "#0ea5e9" },
    { label: "Dapat Dana", value: 87, color: "#eab308" },
  ],
  topInstitutions: [
    { name: "Bank BRI KUR", requests: 234, conversions: 45, rate: "19.2%" },
    { name: "Mandiri Wirausaha", requests: 156, conversions: 32, rate: "20.5%" },
    { name: "OJK UMKM Program", requests: 98, conversions: 28, rate: "28.6%" },
    { name: "Grab Merchant Loan", requests: 67, conversions: 12, rate: "17.9%" },
  ],
};

const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7"];
const MAX_WEEKLY = Math.max(...ANALYTICS.weeklyUMKM);
const FUNNEL_MAX = ANALYTICS.funnel[0].value;

export default function AdminAnalyticsPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-[#141a34]">Analytics Platform</h1>
        <p className="text-sm text-[#444655]">Performa platform 12 minggu terakhir</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* UMKM Onboarded per Week */}
        <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
          <h2 className="font-bold text-sm text-[#141a34] mb-4">UMKM Onboarded per Minggu</h2>
          <div className="flex items-end gap-2 h-32">
            {ANALYTICS.weeklyUMKM.map((v, i) => {
              const h = Math.round((v / MAX_WEEKLY) * 112);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-[#444655]">{v}</span>
                  <div className="w-full rounded-t-sm" style={{ height: h, background: "linear-gradient(to top, #001b85, #334ed9)" }} />
                  <span className="text-[9px] text-[#444655]">{WEEKS[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retention D7 vs D30 */}
        <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
          <h2 className="font-bold text-sm text-[#141a34] mb-4">Retensi Pengguna (%)</h2>
          <div className="flex items-end gap-2 h-32">
            {ANALYTICS.retention.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-[#444655]">{v}%</span>
                <div className="w-full rounded-t-sm bg-[#006a6a]" style={{ height: Math.round((v / 100) * 112) }} />
                <span className="text-[9px] text-[#444655]">D{i * 5 || 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
        <h2 className="font-bold text-sm text-[#141a34] mb-4">Konversi Journey</h2>
        <div className="space-y-3">
          {ANALYTICS.funnel.map((f) => {
            const pct = Math.round((f.value / FUNNEL_MAX) * 100);
            return (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-[#141a34]">{f.label}</span>
                  <span className="font-bold text-[#444655]">{f.value.toLocaleString("id-ID")} ({pct}%)</span>
                </div>
                <div className="h-6 bg-[#f3f2ff] rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: f.color }}
                  >
                    <span className="text-[10px] text-white font-bold">{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Institutions */}
      <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e5e7ff]">
          <h2 className="font-bold text-sm text-[#141a34]">Top Institusi — Tingkat Konversi</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f3f2ff]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase">Institusi</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase">Request</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase">Konversi</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase">Tingkat</th>
            </tr>
          </thead>
          <tbody>
            {ANALYTICS.topInstitutions.map((inst) => (
              <tr key={inst.name} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff]">
                <td className="px-4 py-3 font-semibold text-[#141a34]">{inst.name}</td>
                <td className="px-4 py-3 text-[#444655]">{inst.requests}</td>
                <td className="px-4 py-3 text-[#444655]">{inst.conversions}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{inst.rate}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
