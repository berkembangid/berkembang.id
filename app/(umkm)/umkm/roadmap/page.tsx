"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, Award, Sparkles, Trophy, ShieldCheck } from "lucide-react";
import DemoBanner from "@/components/DemoBanner";

export default function RoadmapPage() {
  const steps = [
    {
      stage: "Fase 1",
      title: "Legalitas & Fondasi Usaha",
      desc: "Menyelesaikan dokumen wajib dan legalitas dasar usaha",
      completed: true,
      items: [
        { label: "Upload KTP Pemilik", done: true },
        { label: "Upload NPWP Usaha", done: true },
        { label: "Daftarkan NIB di OSS.go.id", done: false },
      ],
    },
    {
      stage: "Fase 2",
      title: "Konsistensi Transaksi Harian",
      desc: "Perbanyak riwayat transaksi untuk membuktikan cashflow sehat",
      completed: false,
      active: true,
      items: [
        { label: "Catat minimal 10 transaksi pertama", done: true },
        { label: "Catat transaksi 7 hari berturut-turut", done: false },
        { label: "Unggah Rekening Koran 3 Bulan", done: false },
      ],
    },
    {
      stage: "Fase 3",
      title: "Pengajuan KUR & Pendanaan",
      desc: "Terhubung langsung dengan bank mitra dan ketersediaan kuota KUR",
      completed: false,
      items: [
        { label: "Skor Kesiapan Usaha ≥ 75", done: false },
        { label: "Generate Laporan Keuangan Standar Bank", done: false },
        { label: "Kirim Berkas ke Mitra Pembiayaan", done: false },
      ],
    },
  ];

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-6 max-w-5xl mx-auto">
      <DemoBanner>Progress perjalanan di halaman ini masih berupa contoh dan belum dihitung dari evidence usaha.</DemoBanner>
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-800">Roadmap Naik Kelas</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Panduan langkah demi langkah untuk mempersiapkan usahamu menuju pendanaan bank.
        </p>
      </div>

      {/* Progress Card */}
      <div className="bg-gradient-to-r from-[#0f2d6b] to-blue-700 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Status Perjalanan</span>
          <h2 className="text-xl font-bold mt-1">Fase 2: Konsistensi Transaksi Harian</h2>
          <p className="text-xs text-blue-100 mt-1">Selesaikan 2 tugas lagi untuk membuka pengajuan KUR.</p>
        </div>
        <div className="flex items-center gap-3 bg-white/10 border border-white/20 px-4 py-2.5 rounded-xl">
          <Sparkles className="text-cyan-300" size={20} />
          <div>
            <p className="text-[10px] text-blue-200 font-bold uppercase">Estimasi Waktu</p>
            <p className="text-xs font-bold text-white">~3 Hari Lagi</p>
          </div>
        </div>
      </div>

      {/* Timeline steps */}
      <div className="space-y-6 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
        {steps.map((step, idx) => (
          <div key={idx} className="relative flex items-start gap-4 pl-12">
            {/* Circle Node */}
            <div
              className={`absolute left-3 top-1 w-6 h-6 rounded-full flex items-center justify-center -translate-x-1/2 font-bold text-xs shadow-sm ${
                step.completed
                  ? "bg-emerald-500 text-white"
                  : step.active
                  ? "bg-blue-600 text-white ring-4 ring-blue-100"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {step.completed ? "✓" : idx + 1}
            </div>

            {/* Card */}
            <div
              className={`flex-1 rounded-2xl p-5 border transition-all ${
                step.active
                  ? "bg-white border-blue-300 shadow-md"
                  : step.completed
                  ? "bg-white border-slate-200"
                  : "bg-slate-50/70 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{step.stage}</span>
                  <h3 className="font-bold text-base text-slate-800 mt-0.5">{step.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                </div>
                {step.active && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Sedang Berjalan
                  </span>
                )}
              </div>

              {/* Tasks list */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
                {step.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      {item.done ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <Circle size={16} className="text-slate-300" />
                      )}
                      <span className={item.done ? "line-through text-slate-400" : "text-slate-700 font-medium"}>
                        {item.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
