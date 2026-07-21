"use client";

import Link from "next/link";
import { Check, Circle, Lock, Star, Trophy, Award, Sparkles, CheckCircle2, ArrowLeft } from "lucide-react";

type LevelState = "completed" | "active" | "locked";

const LEVELS = [
  {
    id: 1,
    title: "Level 1: Konsisten Catat",
    subtitle: "Dasar pencatatan keuangan",
    state: "completed" as LevelState,
    badge: "🏆",
    themeColor: "#16a34a",
    bgColor: "bg-emerald-50/70",
    borderColor: "border-emerald-200",
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
    themeColor: "#001b85",
    bgColor: "bg-blue-50/50",
    borderColor: "border-blue-200",
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
    badge: "👑",
    themeColor: "#475569",
    bgColor: "bg-slate-50/40",
    borderColor: "border-slate-200",
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
    <div className="min-h-screen bg-[#fbf8ff] pb-28 animate-fade-in-up">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 h-14 flex items-center justify-between border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <Link href="/umkm" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </Link>
          <h1 className="font-headline text-base font-extrabold text-[#141a34]">Journey Naik Kelas</h1>
        </div>
        <div className="bg-[#001b85]/10 text-[#001b85] text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <Sparkles size={10} className="animate-pulse" />
          Level 2 Aktif
        </div>
      </header>

      {/* Progress overview */}
      <div className="p-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
          <p className="text-[9px] text-slate-400 font-mono-label font-bold uppercase tracking-wider">Total Perjalanan</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span>Level 1 Selesai</span>
                <span className="text-[#001b85] font-bold">Level 2 (45%)</span>
              </div>
              <div className="progress-bar-track bg-slate-100 h-2.5">
                <div className="progress-bar-fill h-full bg-gradient-to-r from-emerald-500 to-[#001b85]" style={{ width: "45%" }} />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-[#001b85] leading-none">45%</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Lengkap</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical Timeline Roadmap */}
      <main className="px-4 relative">
        {/* Central connecting line */}
        <div className="absolute left-9 top-6 bottom-12 w-0.5 border-l-2 border-dashed border-slate-200 -z-10" />

        <div className="space-y-6">
          {LEVELS.map((level) => {
            const isCompleted = level.state === "completed";
            const isActive = level.state === "active";
            const isLocked = level.state === "locked";

            return (
              <div key={level.id} className="relative pl-12">
                {/* Timeline node icon */}
                <div className={`absolute left-2.5 top-1.5 w-7 h-7 rounded-full flex items-center justify-center border-2 z-10 transition-all ${
                  isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20" :
                  isActive ? "bg-white border-[#001b85] text-[#001b85] shadow-md shadow-[#001b85]/10 animate-pulse" :
                  "bg-slate-100 border-slate-200 text-slate-400"
                }`}>
                  {isCompleted ? <Check size={14} strokeWidth={3} /> :
                   isActive ? <Star size={12} fill="currentColor" /> :
                   <Lock size={10} />}
                </div>

                {/* Level Card */}
                <div className={`rounded-2xl border p-5 shadow-sm transition-all ${
                  isLocked ? "bg-slate-50/50 border-slate-100 opacity-70" : `bg-white ${level.borderColor} hover:shadow-md`
                }`}>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                        isCompleted ? "bg-emerald-50 text-emerald-700" :
                        isActive ? "bg-[#001b85]/5 text-[#001b85]" :
                        "bg-slate-100 text-slate-400"
                      }`}>
                        {level.id === 1 ? <Award size={20} /> :
                         level.id === 2 ? <Sparkles size={20} /> :
                         <Trophy size={20} />}
                      </div>
                      <div>
                        <h3 className={`font-headline font-bold text-sm ${isLocked ? "text-slate-400" : "text-slate-800"}`}>
                          {level.title}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{level.subtitle}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      isCompleted ? "bg-emerald-100 text-emerald-700" :
                      isActive ? "bg-[#001b85]/10 text-[#001b85]" :
                      "bg-slate-200/60 text-slate-500"
                    }`}>
                      {isCompleted ? "✓ Selesai" : isActive ? "Aktif" : "Terkunci"}
                    </span>
                  </div>

                  {/* Level Progress (Active/Completed) */}
                  {!isLocked && (
                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1">
                        <span>Progress Level</span>
                        <span>{level.progress}%</span>
                      </div>
                      <div className="progress-bar-track bg-slate-100 h-1.5">
                        <div className={`progress-bar-fill h-full ${
                          isCompleted ? "bg-emerald-500" : "bg-[#001b85]"
                        }`} style={{ width: `${level.progress}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Missions List */}
                  <div className="space-y-2.5">
                    {level.missions.map((mission, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="mt-0.5">
                          {mission.done ? (
                            <CheckCircle2 size={14} className="text-emerald-500" fill="currentColor" color="white" />
                          ) : (
                            <Circle size={14} className="text-slate-300" />
                          )}
                        </div>
                        <p className={`text-xs leading-normal ${
                          mission.done ? "line-through text-slate-400 font-medium" :
                          isLocked ? "text-slate-400" : "text-slate-700"
                        }`}>
                          {mission.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Tips */}
                  {isActive && "tips" in level && level.tips && (
                    <div className="mt-4 bg-amber-50/80 border border-amber-200/60 rounded-xl p-3.5 text-[11px] text-amber-900 leading-normal font-medium">
                      {level.tips}
                    </div>
                  )}

                  {/* Completed date */}
                  {isCompleted && "completedDate" in level && level.completedDate && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-600 font-semibold">
                      <span>Lencana Diserahkan</span>
                      <span>Selesai pada {level.completedDate}</span>
                    </div>
                  )}

                  {/* CTA button */}
                  {isActive && (
                    <Link href="/umkm/profil">
                      <button className="mt-4 w-full bg-[#001b85] text-white font-bold py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors shadow-sm">
                        Lanjutkan Pengisian Profil →
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
