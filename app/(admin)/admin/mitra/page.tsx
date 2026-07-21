"use client";

import { Handshake, Plus, Edit, Users, MapPin, Eye } from "lucide-react";

const MITRA = [
  { id: 1, name: "SMESCO Indonesia", type: "Pemerintah", coverage: "Nasional", umkmManaged: 234, active: true },
  { id: 2, name: "Komunitas UMKM Jaya", type: "LSM", coverage: "Jakarta", umkmManaged: 87, active: true },
  { id: 3, name: "GoUMKM Foundation", type: "NGO", coverage: "Multi-Kota", umkmManaged: 156, active: true },
];

export default function AdminMitraPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Mitra Komunitas</h1>
          <p className="text-sm text-slate-500 mt-1">Pendamping, LSM, dan komunitas penggerak UMKM mikro daerah</p>
        </div>
        <button className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2">
          <Plus size={16} />
          Tambah Mitra
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {MITRA.map((m) => (
          <div key={m.id} className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <Handshake size={24} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[#141a34] text-base truncate">{m.name}</h3>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {m.type}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 mt-3 font-medium flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" />
                    {m.coverage}
                  </span>
                  <span className="flex items-center gap-1 text-[#001b85]">
                    <Users size={12} className="text-[#001b85]/70" />
                    {m.umkmManaged} UMKM Dampingan
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
              <button className="text-xs font-bold text-[#001b85] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#ececff] transition-colors flex items-center gap-1.5">
                <Edit size={12} />
                Edit
              </button>
              <button className="text-xs font-bold text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                <Eye size={12} />
                Lihat UMKM
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
