"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Building2, Plus, Edit, Trash2, Shield, ShieldAlert, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { runAdminOperation } from "@/modules/admin/operations";

interface Institution {
  id: string;
  name: string;
  type: string;
  programs: number;
  active: boolean;
  contact?: string;
}

function parseInstitutionListId(id: string) {
  if (id.startsWith("institution:")) return { source: "institutions" as const, id: id.slice(12) };
  if (id.startsWith("profile:")) return { source: "profiles" as const, id: id.slice(8) };
  return { source: "institutions" as const, id };
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
      // 1. Fetch master institutions table
      const { data: instData } = await supabase
        .from("institutions")
        .select("*")
        .neq("status", "archived")
        .order("id", { ascending: true });

      // 2. Fetch profiles registered with role = 'institution' or nama_institusi
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .neq("status", "inactive")
        .or("role.eq.institution,nama_institusi.not.is.null");

      const list: Institution[] = [];
      const existingNames = new Set<string>();

      if (instData && instData.length > 0) {
        instData.forEach((item: Record<string, unknown>) => {
          const name = String(item.name ?? "Institusi");
          existingNames.add(name.toLowerCase().trim());
          list.push({
            id: `institution:${String(item.id)}`,
            name: name,
            type: String(item.type ?? "Bank / Koperasi"),
            programs: Number(item.programs_count) || 1,
            active: Boolean(item.active ?? true),
          });
        });
      }

      if (profileData && profileData.length > 0) {
        profileData.forEach((p: Record<string, unknown>, idx: number) => {
          const pName = String(p.nama_institusi ?? p.name ?? `Institusi Terdaftar #${idx + 1}`);
          const normalized = pName.toLowerCase().trim();
          if (!existingNames.has(normalized)) {
            existingNames.add(normalized);
            list.push({
              id: `profile:${String(p.id ?? `missing-${idx}`)}`,
              name: pName,
              type: String(p.jenis_institusi ?? "Bank / Koperasi"),
              programs: 1,
              active: true,
              contact: String(p.nama_contact ?? p.email ?? ""),
            });
          }
        });
      }

      setInstitutions(list);
    } catch (err) {
      console.warn("Failed to fetch institutions:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleActive = async (inst: Institution) => {
    const updatedStatus = !inst.active;
    try {
      const target = parseInstitutionListId(inst.id);
      await runAdminOperation({
        action: "set_institution_active",
        source: target.source,
        id: target.id,
        active: updatedStatus,
      });

      setInstitutions(institutions.map(i => i.id === inst.id ? { ...i, active: updatedStatus } : i));
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const target = parseInstitutionListId(id);
      await runAdminOperation({ action: "deactivate_institution", source: target.source, id: target.id });
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
        const target = parseInstitutionListId(editingInst.id);
        await runAdminOperation({
          action: "save_institution",
          source: target.source,
          id: target.id,
          name: instName,
          type: instType,
          programsCount: progs,
          active: editingInst.active,
        });

        setInstitutions(institutions.map(i => i.id === editingInst.id ? { ...i, name: instName, type: instType, programs: progs } : i));
      } else {
        const result = await runAdminOperation({
          action: "save_institution",
          source: "institutions",
          name: instName,
          type: instType,
          programsCount: progs,
          active: true,
        });
        if (!result.id) throw new Error("Institusi belum tersimpan.");

        const newObj: Institution = {
          id: `institution:${result.id}`,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#1b2a3a]">Data institusi</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data bank, fintech, dan lembaga pemerintah penyedia program KUR</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchInstitutions}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openAddModal}
            className="bg-[#0b5f86] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0f73a3] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
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
          Belum ada data institusi terdaftar. Klik &quot;Tambah Institusi&quot; untuk menambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {institutions.map((inst) => (
            <div key={inst.id} className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  inst.active ? "bg-[#0b5f86]/10 text-[#0b5f86]" : "bg-slate-100 text-slate-400"
                }`}>
                  <Building2 size={24} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[#1b2a3a] text-base truncate">{inst.name}</h3>
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
                  <div className="flex gap-3 text-xs text-slate-500 mt-2 font-medium flex-wrap items-center">
                    <span className="bg-slate-100 px-2 py-0.5 rounded">{inst.type}</span>
                    <span className="text-[#0b5f86] font-semibold">{inst.programs} program aktif</span>
                    {inst.contact && (
                      <span className="text-slate-500 text-[11px] bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Kontak: {inst.contact}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
                <Link
                  href={`/admin/institutions/${inst.id}`}
                  className="text-xs font-bold text-[#0b5f86] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#eef8fd] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit size={12} />
                  Detail / Edit
                </Link>
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

      {/* Add Institution Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingInst ? "Edit Data Institusi" : "Tambah Institusi Baru"}
        subtitle="Kelola bank, fintech, dan penyedia program KUR"
        icon={<Building2 size={22} />}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveForm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nama Institusi / Bank *</label>
            <input
              type="text"
              required
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              placeholder="Contoh: Bank BNI KUR"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jenis Lembaga</label>
              <select
                value={instType}
                onChange={(e) => setInstType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              >
                <option value="Bank BUMN">Bank BUMN</option>
                <option value="Bank Swasta">Bank Swasta</option>
                <option value="Pemerintah">Pemerintah / BUMD</option>
                <option value="Fintech">Fintech / P2P</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jumlah Program</label>
              <input
                type="number"
                min="1"
                value={instPrograms}
                onChange={(e) => setInstPrograms(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Institusi"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
