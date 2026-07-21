"use client";

import Link from "next/link";

const NOTIFICATIONS = [
  {
    id: 1, icon: "account_balance", color: "#1e40af", bg: "#dbeafe",
    title: "Match Pembiayaan Baru!",
    body: "Bank BRI KUR cocok dengan profil Anda. Readiness Score Anda 58 memenuhi syarat minimum 50.",
    time: "1 jam lalu", unread: true, type: "match",
  },
  {
    id: 2, icon: "notifications_active", color: "#c2410c", bg: "#ffedd5",
    title: "Jangan Lupa Catat Hari Ini!",
    body: "Streak 5 hari berturut-turut hampir terputus. Catat sebelum pukul 23:59!",
    time: "2 jam lalu", unread: true, type: "reminder",
  },
  {
    id: 3, icon: "emoji_events", color: "#854d0e", bg: "#fef3c7",
    title: "Selamat! Milestone Tercapai 🎉",
    body: "Anda telah mencatat selama 7 hari berturut-turut. Badge 'Pencatat Rajin' diperoleh!",
    time: "Kemarin", unread: false, type: "milestone",
  },
  {
    id: 4, icon: "trending_up", color: "#065f46", bg: "#d1fae5",
    title: "Readiness Score Naik!",
    body: "Skor Anda naik dari 45 ke 58. Terus konsisten mencatat untuk naik lebih tinggi!",
    time: "5 hari lalu", unread: false, type: "readiness",
  },
];

export default function NotifikasiPage() {
  return (
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <h1 className="font-headline text-lg font-bold text-[#141a34]">Notifikasi</h1>
        <button className="text-xs text-[#001b85] font-semibold">Tandai Semua Dibaca</button>
      </header>

      <main className="px-6 py-4 space-y-3 pb-8">
        {NOTIFICATIONS.map((n) => (
          <div
            key={n.id}
            className={`flex gap-3 bg-white rounded-xl p-4 shadow-card border transition-colors cursor-pointer ${
              n.unread ? "border-[#bac3ff] bg-[#f3f2ff]" : "border-[#e5e7ff]"
            }`}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: n.bg }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: n.color, fontVariationSettings: "'FILL' 1", fontSize: 20 }}
              >
                {n.icon}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm text-[#141a34]">{n.title}</p>
                {n.unread && <div className="w-2.5 h-2.5 rounded-full bg-[#001b85] flex-shrink-0 mt-1" />}
              </div>
              <p className="text-xs text-[#444655] mt-1 leading-relaxed">{n.body}</p>
              <p className="text-[10px] text-[#757686] mt-1">{n.time}</p>
              {n.type === "match" && (
                <button className="mt-2 text-xs bg-[#001b85] text-white px-3 py-1.5 rounded-lg font-bold">
                  Buka Profil untuk Institusi →
                </button>
              )}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
