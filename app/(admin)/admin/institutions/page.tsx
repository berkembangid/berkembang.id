"use client";

import { Building2, Plus, Edit, Trash2, Shield, ShieldAlert } from "lucide-react";

const INSTITUTIONS = [
  { id: 1, name: "Bank BRI KUR", type: "Bank BUMN", programs: 3, active: true },
  { id: 2, name: "Mandiri Wirausaha", type: "Bank BUMN", programs: 2, active: true },
  { id: 3, name: "OJK UMKM Program", type: "Pemerintah", programs: 5, active: true },
  { id: 4, name: "Grab Merchant Loan", type: "Fintech", programs: 1, active: false },
];

export default function AdminInstitutionsPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Manajemen Institusi</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data bank, fintech, dan lembaga pemerintah penyedia program KUR</p>
        </div>
        <button className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2">
          <Plus size={16} />
          Tambah Institusi
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {INSTITUTIONS.map((inst) => (
          <div key={inst.id} className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                inst.active ? "bg-[#001b85]/10 text-[#001b85]" : "bg-slate-100 text-slate-400"
              }`}>
                <Building2 size={24} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[#141a34] text-base truncate">{inst.name}</h3>
                  <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                    inst.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-50 text-slate-400 border border-slate-200"
                  }`}>
                    {inst.active ? (
                      <>
                        <Shield size={10} /> Aktif
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={10} /> Nonaktif
                      </>
                    )}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 mt-2 font-medium">
                  <span className="bg-slate-100 px-2 py-0.5 rounded">{inst.type}</span>
                  <span className="text-[#001b85] font-semibold">{inst.programs} program aktif</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
              <button className="text-xs font-bold text-[#001b85] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#ececff] transition-colors flex items-center gap-1.5">
                <Edit size={12} />
                Edit
              </button>
              <button className="text-xs font-bold text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-1.5">
                <Trash2 size={12} />
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
