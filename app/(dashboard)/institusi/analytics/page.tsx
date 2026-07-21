"use client";

export default function DashboardAnalyticsPage() {
  const MATCH_DATA = [
    { week: "W1", matches: 12 }, { week: "W2", matches: 18 },
    { week: "W3", matches: 15 }, { week: "W4", matches: 22 },
    { week: "W5", matches: 19 }, { week: "W6", matches: 27 },
    { week: "W7", matches: 31 },
  ];
  const maxMatch = Math.max(...MATCH_DATA.map((d) => d.matches));

  return (
    <div className="p-8">
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-2">Analitik Program</h1>
      <p className="text-sm text-[#444655] mb-6">Performa program pembiayaan Anda</p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Match", value: "144", sub: "UMKM cocok dengan program", color: "#001b85" },
          { label: "Dossier Disetujui", value: "87", sub: "dari 234 permintaan", color: "#166534" },
          { label: "Tingkat Konversi", value: "37.2%", sub: "dossier → pembiayaan", color: "#7c3aed" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-[#e5e7ff] shadow-card">
            <p className="text-xs text-[#444655] font-semibold mb-1">{s.label}</p>
            <p className="text-3xl font-bold font-headline" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-[#444655] mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Match chart */}
      <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
        <h2 className="font-bold text-sm text-[#141a34] mb-4">AI Match per Minggu</h2>
        <div className="flex items-end gap-3 h-32">
          {MATCH_DATA.map((d) => {
            const h = Math.round((d.matches / maxMatch) * 112);
            return (
              <div key={d.week} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-[#444655]">{d.matches}</span>
                <div className="w-full rounded-t-sm" style={{ height: h, background: "linear-gradient(to top, #006a6a, #56f9f9)" }} />
                <span className="text-[9px] text-[#444655]">{d.week}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
