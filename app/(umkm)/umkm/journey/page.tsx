"use client";

import Link from "next/link";

type LevelState = "completed" | "active" | "locked";

const LEVELS = [
  {
    id: 1,
    title: "Level 1: Konsisten Catat",
    subtitle: "Dasar pencatatan keuangan",
    state: "completed" as LevelState,
    badge: "🏅",
    color: "#166534",
    bg: "#dcfce7",
    border: "#86efac",
    progress: 100,
    missions: [
      { label: "Catat transaksi 7 hari berturut-turut", done: true },
      { label: "Tambahkan foto usaha di profil", done: true },
      { label: "Lengkapi nama & jenis usaha", done: true },
    ],
    completedDate: "15 Jul 2026",
  },
  {
    id: 2,
    title: "Level 2: Urus NIB",
    subtitle: "Legalitas usaha resmi",
    state: "active" as LevelState,
    badge: "⭐",
    color: "#1e40af",
    bg: "#dbeafe",
    border: "#93c5fd",
    progress: 45,
    missions: [
      { label: "Isi data NIB di profil", done: false },
      { label: "Upload foto KTP pemilik", done: false },
      { label: "Catat 30 hari dalam sebulan", done: true },
      { label: "Readiness Score ≥ 50", done: false },
    ],
    tips: "💡 NIB bisa diurus gratis di OSS.go.id dalam 1 hari kerja!",
  },
  {
    id: 3,
    title: "Level 3: Siap Dana",
    subtitle: "Siap akses pembiayaan",
    state: "locked" as LevelState,
    badge: "🏆",
    color: "#78350f",
    bg: "#fef3c7",
    border: "#fcd34d",
    progress: 0,
    missions: [
      { label: "Selesaikan Level 2 dahulu", done: false },
      { label: "Readiness Score ≥ 70", done: false },
      { label: "Rekening bank terisi", done: false },
      { label: "Catat konsisten 60 hari", done: false },
    ],
  },
];

export default function JourneyPage() {
  return (
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center border-b border-[#c5c5d7]/30">
        <h1 className="font-headline text-lg font-bold text-[#141a34]">Journey Naik Kelas</h1>
      </header>

      {/* Progress overview */}
      <div className="px-6 py-4">
        <div className="bg-white rounded-2xl p-4 border border-[#e5e7ff] shadow-card">
          <p className="text-xs text-[#444655] font-mono-label font-bold uppercase tracking-wide">Progress Anda</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-[#444655] mb-1">
                <span>Level 1 selesai</span>
                <span>Level 2 aktif</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: "45%" }} />
              </div>
            </div>
            <span className="text-2xl font-bold text-[#001b85]">45%</span>
          </div>
          <p className="text-xs text-[#444655] mt-2">Selesaikan Level 2 untuk bisa akses pembiayaan!</p>
        </div>
      </div>

      <main className="px-6 space-y-4 pb-6">
        {LEVELS.map((level, idx) => (
          <div
            key={level.id}
            className={`rounded-2xl border-2 p-5 shadow-card transition-all ${
              level.state === "locked" ? "opacity-60" : ""
            }`}
            style={{ borderColor: level.border, backgroundColor: level.state === "locked" ? "#f9fafb" : level.bg }}
          >
            {/* Level header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{level.badge}</span>
                <div>
                  <p
                    className="font-headline font-bold text-base"
                    style={{ color: level.state === "locked" ? "#9ca3af" : level.color }}
                  >
                    {level.title}
                  </p>
                  <p className="text-xs text-[#444655]">{level.subtitle}</p>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  level.state === "completed"
                    ? "bg-green-600 text-white"
                    : level.state === "active"
                    ? "bg-[#001b85] text-white"
                    : "bg-gray-300 text-gray-600"
                }`}
              >
                {level.state === "completed" ? "✓ Selesai" : level.state === "active" ? "Aktif" : "Terkunci"}
              </span>
            </div>

            {/* Progress bar */}
            {level.state !== "completed" && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-[#444655] mb-1">
                  <span>Progress</span>
                  <span>{level.progress}%</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${level.progress}%` }} />
                </div>
              </div>
            )}

            {/* Missions */}
            <div className="space-y-2">
              {level.missions.map((mission, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      mission.done ? "bg-green-500" : "bg-gray-200"
                    }`}
                  >
                    {mission.done ? (
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>check</span>
                    ) : (
                      <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 12 }}>circle</span>
                    )}
                  </div>
                  <p className={`text-sm ${mission.done ? "line-through text-[#9ca3af]" : "text-[#141a34]"}`}>
                    {mission.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Tips */}
            {"tips" in level && level.tips && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">{level.tips}</p>
              </div>
            )}

            {/* Completed date */}
            {"completedDate" in level && level.completedDate && (
              <p className="text-xs text-green-700 mt-3 font-semibold">✅ Selesai: {level.completedDate}</p>
            )}

            {/* CTA */}
            {level.state === "active" && (
              <Link href="/umkm/profil">
                <button className="mt-4 w-full bg-[#001b85] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors">
                  Lanjutkan Level 2 →
                </button>
              </Link>
            )}
          </div>
        ))}
      </main>
    </>
  );
}
