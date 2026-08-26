"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, TrendingUp, CheckCircle, ArrowRight, ShieldAlert, FileText, ChevronRight, Upload, Mic, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { detectUserGaps, GapItem, REQUIRED_DOCS } from "@/lib/score";

export default function GapsPage() {
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profRes, txsRes, docsRes, analysisRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("transactions").select("*").eq("user_id", user.id),
          supabase.from("documents").select("doc_type").eq("user_id", user.id),
          supabase.from("readiness_analyses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        const dbProfile = profRes.data;
        const txs = txsRes.data || [];
        const docs = docsRes.data || [];
        const docTypes = new Set(docs.flatMap((document: { doc_type?: string }) => document.doc_type ? [document.doc_type] : []));

        const detectedGaps = detectUserGaps(dbProfile, txs, docTypes, user.user_metadata, analysisRes.data?.gaps);
        setGaps(detectedGaps);
      } catch (err) {
        console.error("Error loading gaps:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const criticalCount = gaps.filter((g) => g.severity === "kritis").length;
  const importantCount = gaps.filter((g) => g.severity === "penting").length;
  const minorCount = gaps.filter((g) => g.severity === "minor").length;

  const totalGain = gaps.reduce((acc: number, g) => acc + (g.gain || g.potential_gain || 0), 0);

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-800">Gap Analysis</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Temuan prioritas yang perlu diperbaiki untuk mempercepat approval dan meningkatkan skor kesiapan usahamu.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center">
          <span className="text-2xl font-black text-slate-800">{gaps.length}</span>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Temuan</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm text-center">
          <span className="text-2xl font-black text-red-600">{criticalCount}</span>
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">Kritis</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm text-center">
          <span className="text-2xl font-black text-amber-600">{importantCount}</span>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-1">Penting</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-blue-200 shadow-sm text-center">
          <span className="text-2xl font-black text-blue-600">{minorCount}</span>
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">Minor</p>
        </div>
      </div>

      {/* Potential Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-900">
              Potensi kenaikan skor jika semua diperbaiki: <span className="text-emerald-600 font-extrabold">+{totalGain} poin</span>
            </p>
          </div>
        </div>
        <Link href="/umkm/roadmap" className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1">
          Lihat Roadmap <ArrowRight size={13} />
        </Link>
      </div>

      {/* List of Gaps */}
      <div className="space-y-4">
        {gaps.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2 shadow-sm">
            <CheckCircle size={36} className="mx-auto text-emerald-500" />
            <h3 className="text-base font-bold text-slate-800">Tidak Ada Gap Ditemukan!</h3>
            <p className="text-xs text-slate-500">Seluruh dokumen dan riwayat transaksi usahamu sudah dalam kondisi prima untuk pengajuan perbankan.</p>
          </div>
        ) : (
          gaps.map((gap, i) => {
            const isKritis = gap.severity === "kritis";
            const isPenting = gap.severity === "penting";

            return (
              <div
                key={gap.id || i}
                className={`bg-white rounded-2xl p-5 border shadow-sm space-y-3 ${
                  isKritis ? "border-red-200" : isPenting ? "border-amber-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isKritis ? "bg-red-50 text-red-600" : isPenting ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800">{gap.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isKritis
                              ? "bg-red-100 text-red-700"
                              : isPenting
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {gap.severity}
                        </span>
                        <span className="text-xs text-slate-400">• {gap.category}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex-shrink-0">
                    +{gap.gain || gap.potential_gain || 0} poin
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-11">{gap.desc}</p>

                {/* Explanations */}
                <div className="pl-11 space-y-2 pt-1">
                  {gap.why && (
                    <div className="bg-amber-50/60 border border-amber-200/50 rounded-xl p-3 text-xs text-amber-900 leading-normal">
                      <span className="font-bold text-amber-950">Kenapa ini penting?</span> {gap.why}
                    </div>
                  )}
                  {gap.fix && (
                    <div className="bg-blue-50/60 border border-blue-200/50 rounded-xl p-3 text-xs text-blue-900 leading-normal">
                      <span className="font-bold text-blue-950">Cara memperbaiki:</span> {gap.fix}
                    </div>
                  )}
                  {gap.linkHref && (
                    <div className="pt-1">
                      <Link href={gap.linkHref}>
                        <button className="text-xs font-bold text-[#0f2d6b] bg-blue-50 hover:bg-blue-100 px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5">
                          Selesaikan Sekarang <ChevronRight size={13} />
                        </button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
