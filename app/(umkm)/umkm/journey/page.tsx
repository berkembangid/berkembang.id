"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Check, Circle, Lock, Star, Trophy, Award, Sparkles, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

type LevelState = "completed" | "active" | "locked";

export default function JourneyPage() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [txCount, setTxCount] = useState(0);

  useEffect(() => {
    async function loadJourneyData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUserData(user);

        if (user) {
          const { count } = await supabase
            .from("transactions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);

          setTxCount(count || 0);
        }
      } catch (err) {
        console.error("Error loading journey data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadJourneyData();
  }, []);

  const businessName = userData?.user_metadata?.nama_usaha || "Warung Anda";
  const hasLokasi = Boolean(userData?.user_metadata?.lokasi);
  const hasSektor = Boolean(userData?.user_metadata?.sektor_usaha);

  // Dynamic Level Missions based on live Supabase user data
  const level1Missions = [
    { label: "Catat minimal 1 transaksi pertama", done: txCount > 0 },
    { label: "Lengkapi Nama Usaha di profil", done: Boolean(businessName) },
    { label: "Lengkapi Lokasi & Kota Usaha", done: hasLokasi },
  ];

  const level1DoneCount = level1Missions.filter(m => m.done).length;
  const level1Progress = Math.round((level1DoneCount / level1Missions.length) * 100);
  const isLevel1Complete = level1Progress === 100;

  const level2Missions = [
    { label: "Catat minimal 5 transaksi", done: txCount >= 5 },
    { label: "Sektor usaha terisi di profil", done: hasSektor },
    { label: "Readiness Score ≥ 50", done: true },
  ];

  const level2DoneCount = level2Missions.filter(m => m.done).length;
  const level2Progress = Math.round((level2DoneCount / level2Missions.length) * 100);

  const levels = [
    {
      id: 1,
      title: "Level 1: Konsisten Catat",
      subtitle: "Dasar pencatatan keuangan digital",
      state: (isLevel1Complete ? "completed" : "active") as LevelState,
      progress: level1Progress,
      missions: level1Missions,
      completedDate: isLevel1Complete ? "Hari Ini" : undefined,
    },
    {
      id: 2,
      title: "Level 2: Urus NIB & Kesiapan Legalitas",
      subtitle: "Legalitas resmi usaha & integrasi profil",
      state: (!isLevel1Complete ? "locked" : level2Progress === 100 ? "completed" : "active") as LevelState,
      progress: isLevel1Complete ? level2Progress : 0,
      missions: level2Missions,
      tips: "💡 NIB dapat diurus secara gratis di OSS.go.id!",
    },
    {
      id: 3,
      title: "Level 3: Siap Akses Permodalan",
      subtitle: "Siap terhubung ke Lembaga Keuangan & Bank",
      state: "locked" as LevelState,
      progress: 0,
      missions: [
        { label: "Selesaikan Level 2 terlebih dahulu", done: false },
        { label: "Readiness Score ≥ 70", done: false },
        { label: "Catat transaksi 60 hari", done: false },
      ],
    },
  ];

  const totalProgress = Math.round((level1Progress + (isLevel1Complete ? level2Progress : 0)) / 2);

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
          {isLevel1Complete ? "Level 2 Aktif" : "Level 1 Aktif"}
        </div>
      </header>

      {/* Progress overview */}
      <div className="p-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
          <p className="text-[9px] text-slate-400 font-mono-label font-bold uppercase tracking-wider">Total Perjalanan Usaha ({businessName})</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span>{isLevel1Complete ? "Level 1 Selesai ✓" : "Level 1 Berjalan"}</span>
                <span className="text-[#001b85] font-bold">Total: {totalProgress}%</span>
              </div>
              <div className="progress-bar-track bg-slate-100 h-2.5">
                <div className="progress-bar-fill h-full bg-gradient-to-r from-emerald-500 to-[#001b85]" style={{ width: `${totalProgress}%` }} />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-[#001b85] leading-none">{totalProgress}%</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Lengkap</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical Timeline Roadmap */}
      <main className="px-4 relative">
        <div className="absolute left-9 top-6 bottom-12 w-0.5 border-l-2 border-dashed border-slate-200 -z-10" />

        <div className="space-y-6">
          {levels.map((level) => {
            const isCompleted = level.state === "completed";
            const isActive = level.state === "active";
            const isLocked = level.state === "locked";

            return (
              <div key={level.id} className="relative pl-12">
                <div className={`absolute left-2.5 top-1.5 w-7 h-7 rounded-full flex items-center justify-center border-2 z-10 transition-all ${
                  isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20" :
                  isActive ? "bg-white border-[#001b85] text-[#001b85] shadow-md shadow-[#001b85]/10 animate-pulse" :
                  "bg-slate-100 border-slate-200 text-slate-400"
                }`}>
                  {isCompleted ? <Check size={14} strokeWidth={3} /> :
                   isActive ? <Star size={12} fill="currentColor" /> :
                   <Lock size={10} />}
                </div>

                <div className={`rounded-2xl border p-5 shadow-sm transition-all ${
                  isLocked ? "bg-slate-50/50 border-slate-100 opacity-70" : "bg-white border-blue-200 hover:shadow-md"
                }`}>
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

                  {isActive && level.tips && (
                    <div className="mt-4 bg-amber-50/80 border border-amber-200/60 rounded-xl p-3.5 text-[11px] text-amber-900 leading-normal font-medium">
                      {level.tips}
                    </div>
                  )}

                  {isCompleted && level.completedDate && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-600 font-semibold">
                      <span>Lencana Diserahkan</span>
                      <span>Selesai pada {level.completedDate}</span>
                    </div>
                  )}

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
