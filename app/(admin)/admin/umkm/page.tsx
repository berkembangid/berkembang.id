"use client";

import { useState } from "react";

import { Search } from "lucide-react";

const UMKM_DATA = [
  { id: 1, name: "Ibu Sari", usaha: "Warung Makan", sektor: "Kuliner", lokasi: "Jakarta Selatan", score: 87, konsistensi: 45, status: "active" },
  { id: 2, name: "Pak Budi", usaha: "Konveksi Budi", sektor: "Fashion", lokasi: "Bandung", score: 79, konsistensi: 38, status: "active" },
  { id: 3, name: "Bu Ani", usaha: "Dapur Bu Ani", sektor: "Kuliner", lokasi: "Surabaya", score: 71, konsistensi: 41, status: "active" },
  { id: 4, name: "Pak Joko", usaha: "Pertanian Joko", sektor: "Pertanian", lokasi: "Bogor", score: 58, konsistensi: 25, status: "active" },
  { id: 5, name: "Bu Wati", usaha: "Kerajinan Wati", sektor: "Kerajinan", lokasi: "Yogyakarta", score: 45, konsistensi: 12, status: "inactive" },
];

function scoreColor(s: number) {
  if (s < 50) return "text-red-600 bg-red-50 border-red-200";
  if (s < 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (s < 85) return "text-green-600 bg-green-50 border-green-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-300";
}

export default function AdminUMKMPage() {
  const [search, setSearch] = useState("");
  const [editScore, setEditScore] = useState<{ id: number; score: number } | null>(null);

  const filtered = UMKM_DATA.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.usaha.toLowerCase().includes(search.toLowerCase()) ||
      u.sektor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Manajemen UMKM</h1>
          <p className="text-sm text-slate-500 mt-1">Data lengkap dan override skor kesiapan bagi seluruh ekosistem UMKM</p>
        </div>
        <button className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors">
          + Tambah UMKM
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-slate-200/60">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, usaha, atau sektor..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200/80 text-sm focus:border-[#001b85] focus:outline-none"
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-[#f3f2ff] border-b border-[#e5e7ff]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Nama</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Usaha</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Sektor</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Lokasi</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Score</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Konsistensi</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const sc = scoreColor(u.score);
              return (
                <tr key={u.id} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff] transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#141a34]">{u.name}</td>
                  <td className="px-4 py-3 text-[#444655]">{u.usaha}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ececff] text-[#001b85]">{u.sektor}</span>
                  </td>
                  <td className="px-4 py-3 text-[#444655] text-xs">{u.lokasi}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${sc}`}>{u.score}</span>
                  </td>
                  <td className="px-4 py-3 text-[#444655]">{u.konsistensi} hari</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      u.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {u.status === "active" ? "Aktif" : "Tidak Aktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditScore({ id: u.id, score: u.score })}
                        className="text-[10px] text-[#001b85] border border-[#bac3ff] px-2 py-1 rounded-lg hover:bg-[#ececff]"
                      >
                        Edit Score
                      </button>
                      <button className="text-[10px] text-[#444655] border border-[#e5e7ff] px-2 py-1 rounded-lg hover:bg-[#f3f2ff]">
                        Detail
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Score Modal */}
      {editScore && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-fade-in-up">
            <h3 className="font-bold text-[#141a34] text-base">Override Readiness Score</h3>
            <p className="text-xs text-[#444655] mt-1 mb-4">Perubahan akan dicatat di audit log dengan alasan.</p>
            <input
              type="number"
              min={0}
              max={100}
              value={editScore.score}
              onChange={(e) => setEditScore({ ...editScore, score: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none mb-3"
            />
            <textarea
              rows={2}
              placeholder="Alasan override (wajib)..."
              className="w-full px-3 py-2 rounded-lg border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none mb-4 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setEditScore(null)} className="flex-1 py-2.5 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-sm">Batal</button>
              <button onClick={() => setEditScore(null)} className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-sm hover:bg-[#0e32c2]">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
