"use client";

import { useState } from "react";

type DossierStatus = "pending" | "verified" | "declined";

const DOSSIERS = [
  { id: 1, name: "Warung***", lokasi: "Jakarta Selatan", sektor: "Kuliner", score: 87, date: "18 Jul 2026", status: "pending" as DossierStatus, notes: "" },
  { id: 2, name: "Butik***", lokasi: "Bandung", sektor: "Fashion", score: 82, date: "15 Jul 2026", status: "verified" as DossierStatus, notes: "Cocok untuk program KUR Mikro" },
  { id: 3, name: "Tani***", lokasi: "Bogor", sektor: "Pertanian", score: 79, date: "12 Jul 2026", status: "declined" as DossierStatus, notes: "Skor Konsistensi masih rendah" },
  { id: 4, name: "Dapur***", lokasi: "Surabaya", sektor: "Kuliner", score: 71, date: "10 Jul 2026", status: "pending" as DossierStatus, notes: "" },
];

const STATUS_CONFIG = {
  pending: { label: "Menunggu", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  verified: { label: "Terverifikasi", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  declined: { label: "Ditolak", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

export default function DossiersPage() {
  const [activeTab, setActiveTab] = useState<DossierStatus>("pending");

  const filtered = DOSSIERS.filter((d) => d.status === activeTab);

  return (
    <div className="p-8">
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-2">Manajemen Dossier</h1>
      <p className="text-sm text-[#444655] mb-6">UMKM yang menyetujui permintaan dossier Anda</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#e5e7ff] pb-0">
        {(["pending", "verified", "declined"] as DossierStatus[]).map((tab) => {
          const count = DOSSIERS.filter((d) => d.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#001b85] text-[#001b85]"
                  : "border-transparent text-[#444655] hover:text-[#001b85]"
              }`}
            >
              {STATUS_CONFIG[tab].label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab ? "bg-[#001b85] text-white" : "bg-[#e5e7ff] text-[#444655]"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {filtered.map((d) => {
          const sc = STATUS_CONFIG[d.status];
          return (
            <div key={d.id} className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-[#141a34]">{d.name}</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-[#444655]">
                    <span>📍 {d.lokasi}</span>
                    <span>🏪 {d.sektor}</span>
                    <span>⭐ Score: <strong className="text-[#166534]">{d.score}</strong></span>
                    <span>📅 {d.date}</span>
                  </div>
                  {d.notes && (
                    <p className="text-xs text-[#444655] mt-2 italic bg-[#f3f2ff] px-3 py-2 rounded-lg">
                      Catatan: {d.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 ml-4">
                  {d.status === "pending" && (
                    <>
                      <button className="text-xs bg-[#001b85] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[#0e32c2]">
                        Verifikasi
                      </button>
                      <button className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg font-semibold">
                        Tolak
                      </button>
                    </>
                  )}
                  {d.status === "verified" && (
                    <button className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold">
                      Lihat Dossier
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#444655]">
            <span className="material-symbols-outlined text-4xl text-[#c5c5d7]">folder_open</span>
            <p className="mt-2 font-semibold">Tidak ada dossier di status ini</p>
          </div>
        )}
      </div>
    </div>
  );
}
