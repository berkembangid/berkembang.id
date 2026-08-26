"use client";

import { useState } from "react";
import { Users, BarChart2, Handshake, Trophy, Search, X, RefreshCw } from "lucide-react";
import DemoBanner from "@/components/DemoBanner";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi"];

const MOCK_UMKM = [
  { id: 1, rank: 1, name: "Warung***", lokasi: "Jakarta Selatan", sektor: "Kuliner", score: 87, konsistensi: 45, badge: "🥇" },
  { id: 2, rank: 2, name: "Butik***", lokasi: "Bandung", sektor: "Fashion", score: 82, konsistensi: 38, badge: "🥈" },
  { id: 3, rank: 3, name: "Tani***", lokasi: "Bogor", sektor: "Pertanian", score: 79, konsistensi: 52, badge: "🥉" },
  { id: 4, rank: 4, name: "Servis***", lokasi: "Jakarta Utara", sektor: "Jasa", score: 74, konsistensi: 29 },
  { id: 5, rank: 5, name: "Kerajinan***", lokasi: "Yogyakarta", sektor: "Kerajinan", score: 72, konsistensi: 33 },
  { id: 6, rank: 6, name: "Dapur***", lokasi: "Surabaya", sektor: "Kuliner", score: 71, konsistensi: 41 },
  { id: 7, rank: 7, name: "Bordir***", lokasi: "Solo", sektor: "Fashion", score: 70, konsistensi: 27 },
  { id: 8, rank: 8, name: "Sayur***", lokasi: "Depok", sektor: "Pertanian", score: 68, konsistensi: 35 },
  { id: 9, rank: 9, name: "Laundry***", lokasi: "Bekasi", sektor: "Jasa", score: 65, konsistensi: 22 },
  { id: 10, rank: 10, name: "Tech***", lokasi: "Tangerang", sektor: "Teknologi", score: 61, konsistensi: 18 },
];

function scoreColor(score: number) {
  if (score < 50) return { text: "text-red-600", bg: "bg-red-50 border-red-200" };
  if (score < 70) return { text: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" };
  if (score < 85) return { text: "text-green-600", bg: "bg-green-50 border-green-200" };
  return { text: "text-emerald-700 font-bold", bg: "bg-emerald-50 border-emerald-300" };
}

export default function DashboardPage() {
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(70);
  const [showData, setShowData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestModal, setRequestModal] = useState<number | null>(null);

  const toggleSector = (s: string) => {
    const next = selectedSectors.includes(s)
      ? selectedSectors.filter((x) => x !== s)
      : [...selectedSectors, s];
    setSelectedSectors(next);

    if (next.length > 0 && !showData) {
      setLoading(true);
      setTimeout(() => { setLoading(false); setShowData(true); }, 1200);
    } else if (next.length === 0) {
      setShowData(false);
    }
  };

  const filtered = MOCK_UMKM.filter(
    (u) => selectedSectors.includes(u.sektor) && u.score >= minScore
  );

  const avgScore = filtered.length ? Math.round(filtered.reduce((s, u) => s + u.score, 0) / filtered.length) : 0;
  const topPerformer = filtered[0];

  const STAT_ICONS = [Users, BarChart2, Handshake, Trophy];

  return (
    <div className="p-8">
      <DemoBanner>Daftar kandidat dan tombol permintaan dossier pada halaman ini masih berupa simulasi.</DemoBanner>
      <div className="mb-8">
        <h1 className="font-headline text-2xl font-bold text-[#141a34]">Portofolio UMKM Terbaik</h1>
        <p className="text-sm text-[#444655] mt-1">
          Temukan UMKM dengan kesiapan tertinggi sesuai sektor program Anda
        </p>
      </div>

      {/* Sector Gate */}
      {!showData && (
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-20 h-20 rounded-full bg-[#ececff] flex items-center justify-center mx-auto mb-4">
            <Users size={40} className="text-[#001b85]" />
          </div>
          <h2 className="font-headline text-xl font-bold text-[#141a34]">
            Pilih sektor usaha untuk melihat UMKM terbaik
          </h2>
          <p className="text-sm text-[#444655] mt-2 mb-6">
            Pilih minimal 1 sektor untuk memulai
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {SECTORS.map((s) => (
              <button
                key={s}
                onClick={() => toggleSector(s)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-all ${
                  selectedSectors.includes(s)
                    ? "bg-[#001b85] text-white border-[#001b85]"
                    : "bg-white text-[#444655] border-[#c5c5d7] hover:border-[#001b85] hover:text-[#001b85]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-16 gap-3">
          <RefreshCw size={32} className="text-[#001b85] animate-spin" />
          <p className="text-sm text-[#444655]">Memuat data UMKM...</p>
        </div>
      )}

      {/* Data view */}
      {showData && !loading && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedSectors.map((s) => (
              <button key={s} onClick={() => toggleSector(s)} className="flex items-center gap-1.5 bg-[#001b85] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                {s} <X size={12} />
              </button>
            ))}
            {SECTORS.filter((s) => !selectedSectors.includes(s)).map((s) => (
              <button key={s} onClick={() => toggleSector(s)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#c5c5d7] text-[#444655] hover:border-[#001b85]">
                + {s}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#e5e7ff] mb-6 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3 min-w-[280px]">
              <label className="text-sm font-semibold text-[#141a34] whitespace-nowrap">
                Readiness Score ≥ {minScore}
              </label>
              <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="flex-1" />
            </div>
            <button onClick={() => setMinScore(70)} className="text-xs text-[#444655] hover:text-[#001b85] font-semibold">Reset Filter</button>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: `UMKM di Sektor`, value: filtered.length, sub: selectedSectors.join(", "), Icon: STAT_ICONS[0] },
              { label: "Rata-rata Readiness", value: avgScore, sub: "dari semua hasil", Icon: STAT_ICONS[1] },
              { label: "Match Program", value: filtered.filter((u) => u.score >= minScore).length, sub: "cocok ≥ threshold", Icon: STAT_ICONS[2] },
              { label: "Top Performer", value: topPerformer?.name || "-", sub: topPerformer ? `Score ${topPerformer.score}` : "Belum ada", Icon: STAT_ICONS[3] },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 border border-[#e5e7ff] shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <card.Icon size={16} className="text-[#001b85]" />
                  <p className="text-xs text-[#444655] font-semibold">{card.label}</p>
                </div>
                <p className="text-2xl font-bold text-[#141a34] font-headline">{card.value}</p>
                <p className="text-xs text-[#444655] mt-0.5 truncate">{card.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#001b85] text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Rank</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Nama (Anonim)</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Lokasi</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Sektor</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Readiness Score</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Konsistensi</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((umkm) => {
                  const sc = scoreColor(umkm.score);
                  return (
                    <tr key={umkm.id} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff] transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-lg">{umkm.badge ?? `#${umkm.rank}`}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#141a34]">{umkm.name}</td>
                      <td className="px-4 py-3 text-[#444655]">{umkm.lokasi}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ececff] text-[#001b85]">{umkm.sektor}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${sc.bg} ${sc.text}`}>
                          {umkm.score}{umkm.score >= 85 ? " ⭐" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#444655]">{umkm.konsistensi} hari</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRequestModal(umkm.id)}
                            disabled={umkm.score < minScore}
                            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                              umkm.score >= minScore ? "bg-[#001b85] text-white hover:bg-[#0e32c2]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            }`}
                          >
                            Request Dossier
                          </button>
                          <button className="text-xs font-semibold text-[#444655] border border-[#c5c5d7] px-2.5 py-1.5 rounded-lg hover:border-[#001b85]">
                            Preview
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Search size={40} className="text-[#c5c5d7] mx-auto" />
                <p className="mt-2 font-semibold text-[#444655]">Tidak ada UMKM yang memenuhi filter</p>
                <p className="text-xs mt-1 text-[#444655]">Coba turunkan threshold Readiness Score</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 mt-4">
            <button className="px-3 py-1.5 rounded-lg border border-[#c5c5d7] text-sm text-[#444655] hover:bg-[#f3f2ff]">← Prev</button>
            <button className="px-3 py-1.5 rounded-lg bg-[#001b85] text-white text-sm font-bold">1</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#c5c5d7] text-sm text-[#444655] hover:bg-[#f3f2ff]">2</button>
            <button className="px-3 py-1.5 rounded-lg border border-[#c5c5d7] text-sm text-[#444655] hover:bg-[#f3f2ff]">Next →</button>
          </div>
        </>
      )}

      {requestModal !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-fade-in-up">
            <h3 className="font-headline font-bold text-lg text-[#141a34]">Request Dossier</h3>
            <p className="text-sm text-[#444655] mt-1">UMKM akan mendapat notifikasi dan dapat menyetujui atau menolak permintaan ini.</p>
            <div className="mt-4 bg-[#f3f2ff] rounded-xl p-3 text-xs text-[#444655]">
              <strong>Program:</strong> KUR Mikro Bank BRI<br />
              <strong>Catatan:</strong> Data terungkap hanya setelah UMKM menyetujui.
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setRequestModal(null)} className="flex-1 py-3 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-sm">Batal</button>
              <button onClick={() => setRequestModal(null)} className="flex-1 py-3 rounded-xl bg-[#001b85] text-white font-bold text-sm hover:bg-[#0e32c2]">Kirim Permintaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
