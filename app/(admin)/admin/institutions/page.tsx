"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Edit, Trash2, Shield, ShieldAlert, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Institution {
  id: number;
  name: string;
  type: string;
  programs: number;
  active: boolean;
}

export default function AdminInstitutionsPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInst, setEditingInst] = useState<Institution | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [instName, setInstName] = useState("");
  const [instType, setInstType] = useState("Bank BUMN");
  const [instPrograms, setInstPrograms] = useState("1");

  useEffect(() => {
    fetchInstitutions();
  }, []);

  async function fetchInstitutions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("institutions")
        .select("*")
        .order("id", { ascending: true });

      if (!error && data) {
        const mapped: Institution[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          programs: Number(item.programs_count) || 1,
          active: Boolean(item.active),
        }));
        setInstitutions(mapped);
      }
    } catch (err) {
      console.warn("Failed to fetch institutions:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleActive = async (inst: Institution) => {
    const updatedStatus = !inst.active;
    try {
      await supabase
        .from("institutions")
        .update({ active: updatedStatus })
        .eq("id", inst.id);

      await supabase.from("audit_logs").insert({
        user_email: "admin@berkembang.id",
        action: "UPDATE_INSTITUTION_STATUS",
        details: `Status ${inst.name} diubah ke ${updatedStatus ? "Aktif" : "Nonaktif"}`,
        status: "success",
      });

      setInstitutions(institutions.map(i => i.id === inst.id ? { ...i, active: updatedStatus } : i));
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await supabase.from("institutions").delete().eq("id", id);
      setInstitutions(institutions.filter(i => i.id !== id));
    } catch (err) {
      console.error("Error deleting institution:", err);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName) return;
    setSaving(true);

    const progs = Number(instPrograms) || 1;

    try {
      if (editingInst) {
        await supabase
          .from("institutions")
          .update({
            name: instName,
            type: instType,
            programs_count: progs
          })
          .eq("id", editingInst.id);

        setInstitutions(institutions.map(i => i.id === editingInst.id ? { ...i, name: instName, type: instType, programs: progs } : i));
      } else {
        const { data } = await supabase
          .from("institutions")
          .insert({
            name: instName,
            type: instType,
            programs_count: progs,
            active: true
          })
          .select()
          .single();

        const newObj: Institution = {
          id: data?.id || Date.now(),
          name: instName,
          type: instType,
          programs: progs,
          active: true
        };
        setInstitutions([...institutions, newObj]);
      }

      setShowModal(false);
      setEditingInst(null);
      setInstName("");
    } catch (err) {
      console.error("Error saving institution:", err);
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setEditingInst(null);
    setInstName("");
    setInstType("Bank BUMN");
    setInstPrograms("1");
    setShowModal(true);
  };

  const openEditModal = (inst: Institution) => {
    setEditingInst(inst);
    setInstName(inst.name);
    setInstType(inst.type);
    setInstPrograms(inst.programs.toString());
    setShowModal(true);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Manajemen Institusi</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data bank, fintech, dan lembaga pemerintah penyedia program KUR</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchInstitutions}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openAddModal}
            className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            Tambah Institusi
          </button>
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Memuat data institusi...
        </div>
      ) : institutions.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Belum ada data institusi terdaftar. Klik "Tambah Institusi" untuk menambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {institutions.map((inst) => (
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
                    <button
                      onClick={() => handleToggleActive(inst)}
                      className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors ${
                        inst.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100"
                      }`}
                      title="Klik untuk mengubah status aktif"
                    >
                      {inst.active ? (
                        <>
                          <Shield size={10} /> Aktif
                        </>
                      ) : (
                        <>
                          <ShieldAlert size={10} /> Nonaktif
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-500 mt-2 font-medium">
                    <span className="bg-slate-100 px-2 py-0.5 rounded">{inst.type}</span>
                    <span className="text-[#001b85] font-semibold">{inst.programs} program aktif</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
                <button
                  onClick={() => openEditModal(inst)}
                  className="text-xs font-bold text-[#001b85] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#ececff] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit size={12} />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(inst.id)}
                  className="text-xs font-bold text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Institution Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#141a34] text-base font-headline">
                {editingInst ? "Edit Data Institusi" : "Tambah Institusi Baru"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nama Institusi / Bank</label>
                <input
                  type="text"
                  required
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                  placeholder="Contoh: Bank BNI KUR"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Jenis Lembaga</label>
                  <select
                    value={instType}
                    onChange={(e) => setInstType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none bg-white"
                  >
                    <option value="Bank BUMN">Bank BUMN</option>
                    <option value="Bank Swasta">Bank Swasta</option>
                    <option value="Pemerintah">Pemerintah / BUMD</option>
                    <option value="Fintech">Fintech / P2P</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Jumlah Program</label>
                  <input
                    type="number"
                    min="1"
                    value={instPrograms}
                    onChange={(e) => setInstPrograms(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-xs hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? "Menyimpan..." : "Simpan Institusi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
