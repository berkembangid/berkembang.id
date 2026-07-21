"use client";

import Link from "next/link";

const ACTIVITIES = [
  { icon: "check_circle", color: "#15803d", bg: "#dcfce7", title: "Catatan tersimpan: Ayam geprek 47 porsi", time: "2 jam lalu", type: "transaction_recorded" },
  { icon: "emoji_events", color: "#854d0e", bg: "#fef3c7", title: "Level naik! Anda sekarang Level 2: Urus NIB", time: "Kemarin", type: "level_up" },
  { icon: "business", color: "#1e40af", bg: "#dbeafe", title: "Ada institusi yang tertarik melihat profil Anda", time: "3 hari lalu", type: "dossier_requested" },
  { icon: "trending_up", color: "#065f46", bg: "#d1fae5", title: "Readiness Score naik dari 45 ke 58", time: "5 hari lalu", type: "readiness_increased" },
  { icon: "check_circle", color: "#15803d", bg: "#dcfce7", title: "Catatan tersimpan: Nasi goreng spesial", time: "6 hari lalu", type: "transaction_recorded" },
  { icon: "local_fire_department", color: "#c2410c", bg: "#ffedd5", title: "Streak 7 hari! Badge diperoleh 🎉", time: "1 minggu lalu", type: "streak_milestone" },
  { icon: "check_circle", color: "#15803d", bg: "#dcfce7", title: "Profil diperbarui: Foto usaha ditambahkan", time: "1 minggu lalu", type: "profile_updated" },
];

const TYPE_LABELS: Record<string, string> = {
  transaction_recorded: "Catatan",
  level_up: "Level",
  dossier_requested: "Institusi",
  readiness_increased: "Readiness",
  streak_milestone: "Streak",
  profile_updated: "Profil",
};

export default function AktivitasPage() {
  return (
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#ececff]">
          <span className="material-symbols-outlined text-[#444655]">arrow_back</span>
        </Link>
        <h1 className="font-headline text-lg font-bold text-[#141a34]">Semua Aktivitas</h1>
        <div className="w-10" />
      </header>

      <div className="px-6 py-4 flex gap-2 overflow-x-auto hide-scrollbar">
        {["Semua", "Catatan", "Level", "Readiness", "Streak", "Institusi"].map((f) => (
          <button
            key={f}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-[#c5c5d7] text-[#444655] hover:border-[#001b85] hover:text-[#001b85] transition-colors"
          >
            {f}
          </button>
        ))}
      </div>

      <main className="px-6 space-y-3 pb-8">
        {ACTIVITIES.map((act, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] animate-fade-in-up"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: act.bg }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: act.color, fontVariationSettings: "'FILL' 1", fontSize: 20 }}
              >
                {act.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#141a34] font-medium leading-snug">{act.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] bg-[#ececff] text-[#001b85] px-1.5 py-0.5 rounded-full font-semibold">
                  {TYPE_LABELS[act.type]}
                </span>
                <p className="text-xs text-[#444655]">{act.time}</p>
              </div>
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
