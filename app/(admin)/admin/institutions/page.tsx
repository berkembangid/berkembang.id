"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Building2, Plus, Edit, Trash2, Shield, ShieldAlert, X, RefreshCw, Eye, EyeOff, User, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { runAdminOperation } from "@/modules/admin/operations";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

interface Institution {
  id: string;
  name: string;
  type: string;
  programs: number;
  active: boolean;
  verificationStatus: "pending" | "verified" | "rejected";
  contact?: string;
}

function parseInstitutionListId(id: string) {
  if (id.startsWith("institution:")) return { source: "institutions" as const, id: id.slice(12) };
  if (id.startsWith("profile:")) return { source: "profiles" as const, id: id.slice(8) };
  return { source: "institutions" as const, id };
}

/** Kata yang dibaca admin, bukan kode statusnya. */
const VERIFICATION_LABEL: Record<string, string> = {
  verified: "terverifikasi",
  rejected: "tidak terverifikasi",
  pending: "menunggu peninjauan",
};

export default function AdminInstitutionsPage() {
  const { confirm } = useConfirm();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInst, setEditingInst] = useState<Institution | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [instName, setInstName] = useState("");
  const [instType, setInstType] = useState("Bank BUMN");
  const [instUsername, setInstUsername] = useState("");
  const [instPassword, setInstPassword] = useState("");
  const [instEmail, setInstEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          const name = String(item.name ?? "Lembaga");
          existingNames.add(name.toLowerCase().trim());
          list.push({
            id: `institution:${String(item.id)}`,
            name: name,
            type: String(item.type ?? "Bank / Koperasi"),
            programs: Number(item.programs_count) || 1,
            active: Boolean(item.active ?? true),
            verificationStatus: (item.verification_status === "rejected" ? "rejected" : item.verification_status === "verified" || Boolean(item.active) ? "verified" : "pending"),
          });
        });
      }

      if (profileData && profileData.length > 0) {
        profileData.forEach((p: Record<string, unknown>, idx: number) => {
          const pName = String(p.nama_institusi ?? p.name ?? `Lembaga Terdaftar #${idx + 1}`);
          const normalized = pName.toLowerCase().trim();
          if (!existingNames.has(normalized)) {
            existingNames.add(normalized);
            list.push({
              id: `profile:${String(p.id ?? `missing-${idx}`)}`,
              name: pName,
              type: String(p.jenis_institusi ?? "Bank / Koperasi"),
              programs: 1,
              active: true,
              verificationStatus: "verified",
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

  /**
   * Menonaktifkan sebuah lembaga memutus akses seluruh anggotanya sekaligus,
   * jadi ia ditanyakan. Mengaktifkan kembali tidak: mengembalikan sesuatu ke
   * keadaan semula tidak pernah mengejutkan siapa pun.
   *
   * Kegagalannya juga tidak lagi berhenti di konsol. Sebelumnya barisnya tetap
   * berubah di layar meski permintaannya gagal -- admin melihat "nonaktif",
   * lembaganya tetap bisa masuk, dan tidak ada yang memberi tahu.
   */
  const handleToggleActive = async (inst: Institution) => {
    const updatedStatus = !inst.active;
    if (!updatedStatus) {
      const yes = await confirm({
        title: `Nonaktifkan ${inst.name}?`,
        description: "Seluruh anggota lembaga ini kehilangan akses ke portal seketika. Izin yang sudah diberikan pemilik usaha tidak ikut dicabut, tetapi tidak ada yang bisa membukanya selama lembaga nonaktif.",
        confirmLabel: "Nonaktifkan",
        cancelLabel: "Batal",
        tone: "danger",
      });
      if (!yes) return;
    }
    try {
      const target = parseInstitutionListId(inst.id);
      await runAdminOperation({
        action: "set_institution_active",
        source: target.source,
        id: target.id,
        active: updatedStatus,
      });

      setInstitutions(institutions.map(i => i.id === inst.id ? { ...i, active: updatedStatus } : i));
      notifySuccess(updatedStatus ? `${inst.name} diaktifkan` : `${inst.name} dinonaktifkan`);
    } catch (err) {
      console.error("Error updating status:", err);
      notifyFromError(err, "Status lembaga belum berhasil diubah.");
    }
  };

  const handleVerification = async (inst: Institution, status: Institution["verificationStatus"]) => {
    // Memverifikasi membuka portal untuk lembaga ini; menolak menutupnya.
    // Keduanya mengubah apa yang bisa dilihat orang lain, jadi keduanya
    // ditanyakan -- yang tidak ditanyakan hanya mengembalikannya ke menunggu.
    if (status !== "pending") {
      const yes = await confirm({
        title: status === "verified" ? `Verifikasi ${inst.name}?` : `Tandai ${inst.name} tidak terverifikasi?`,
        description: status === "verified"
          ? "Lembaga ini menjadi aktif dan anggotanya bisa masuk portal. Permintaan akses yang ia ajukan tetap harus Anda tinjau satu per satu."
          : "Lembaga ini berhenti aktif dan anggotanya tidak bisa masuk portal sampai statusnya diubah lagi.",
        confirmLabel: status === "verified" ? "Verifikasi" : "Tandai",
        cancelLabel: "Batal",
        tone: status === "verified" ? "default" : "danger",
      });
      if (!yes) return;
    }
    try {
      await runAdminOperation({ action: "set_institution_verification", id: parseInstitutionListId(inst.id).id, status });
      setInstitutions(institutions.map((item) => item.id === inst.id ? { ...item, verificationStatus: status, active: status === "verified" } : item));
      notifySuccess(`${inst.name} kini ${VERIFICATION_LABEL[status] ?? status}`);
    } catch (err) {
      console.error("Error updating verification:", err);
      notifyFromError(err, "Status verifikasi belum berhasil diubah.");
    }
  };

  const handleDelete = async (id: string) => {
    const target = institutions.find((item) => item.id === id);
    const yes = await confirm({
      title: `Hapus ${target?.name ?? "lembaga ini"} dari daftar?`,
      description: "Datanya tidak dihapus, hanya dinonaktifkan dan hilang dari daftar ini. Jejak akses yang pernah dilakukannya tetap tersimpan di log audit.",
      confirmLabel: "Hapus dari daftar",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;
    try {
      const parsed = parseInstitutionListId(id);
      await runAdminOperation({ action: "deactivate_institution", source: parsed.source, id: parsed.id });
      setInstitutions(institutions.filter(i => i.id !== id));
      notifySuccess(`${target?.name ?? "Lembaga"} dihapus dari daftar`);
    } catch (err) {
      console.error("Error deleting institution:", err);
      notifyFromError(err, "Lembaga belum berhasil dihapus dari daftar.");
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName.trim()) return;
    setSaving(true);

    try {
      if (editingInst) {
        const progs = Number(instPrograms) || 1;
        const target = parseInstitutionListId(editingInst.id);
        await runAdminOperation({
          action: "save_institution",
          source: target.source,
          id: target.id,
          name: instName.trim(),
          type: instType,
          programsCount: progs,
          active: editingInst.active,
        });

        setInstitutions(
          institutions.map((i) =>
            i.id === editingInst.id ? { ...i, name: instName.trim(), type: instType, programs: progs } : i
          )
        );
        notifySuccess("Data lembaga berhasil diperbarui");
      } else {
        if (!instUsername.trim() || !instPassword) {
          throw new Error("Username dan Password wajib diisi.");
        }
        if (instPassword.length < 8) {
          throw new Error("Password minimal 8 karakter.");
        }

        const result = await runAdminOperation({
          action: "create_institution_account",
          name: instName.trim(),
          type: instType,
          username: instUsername.trim(),
          password: instPassword,
          email: instEmail.trim() || undefined,
        });

        if (!result.id) throw new Error("Akun lembaga belum tersimpan.");

        const newObj: Institution = {
          id: `institution:${result.id}`,
          name: instName.trim(),
          type: instType,
          programs: 1,
          active: true,
          verificationStatus: "verified",
          contact: instUsername.trim(),
        };
        setInstitutions([newObj, ...institutions]);
        notifySuccess(`Akun lembaga ${instName.trim()} berhasil dibuat dan terverifikasi`);
      }

      setShowModal(false);
      setEditingInst(null);
      setInstName("");
      setInstUsername("");
      setInstPassword("");
      setInstEmail("");
    } catch (err) {
      console.error("Error saving institution:", err);
      notifyFromError(err, "Gagal menyimpan lembaga");
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setEditingInst(null);
    setInstName("");
    setInstType("Bank BUMN");
    setInstUsername("");
    setInstPassword("");
    setInstEmail("");
    setShowPassword(false);
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
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#1b2a3a]">Data lembaga</h1>
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
            Tambah Lembaga
          </button>
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Memuat data lembaga...
        </div>
      ) : institutions.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Belum ada data lembaga terdaftar. Klik &quot;Tambah Lembaga&quot; untuk menambahkan.
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
                    <span className={`text-[11px] font-bold ${inst.verificationStatus === "verified" ? "text-emerald-700" : inst.verificationStatus === "rejected" ? "text-red-700" : "text-amber-700"}`}>{inst.verificationStatus === "verified" ? "Terverifikasi" : inst.verificationStatus === "rejected" ? "Ditolak" : "Menunggu verifikasi"}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
                {inst.verificationStatus === "pending" && <><button onClick={() => void handleVerification(inst, "rejected")} className="text-xs font-bold text-red-600 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-50">Tolak</button><button onClick={() => void handleVerification(inst, "verified")} className="text-xs font-bold text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl hover:bg-emerald-50">Verifikasi</button></>}
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

      {/* Add / Edit Institution Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingInst ? "Edit Data Lembaga" : "Tambah Lembaga Baru"}
        subtitle={
          editingInst
            ? "Perbarui informasi lembaga"
            : "Buat akun login lembaga baru (otomatis aktif & terverifikasi)"
        }
        icon={<Building2 size={22} />}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveForm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nama Institusi *</label>
            <input
              type="text"
              required
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              placeholder="Contoh: Bank BNI Prioritas / LPDB"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Jenis Lembaga *</label>
            <select
              value={instType}
              onChange={(e) => setInstType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
            >
              <option value="Bank BUMN">Bank BUMN</option>
              <option value="Bank Swasta">Bank Swasta</option>
              <option value="Pemerintah / BUMD">Pemerintah / BUMD</option>
              <option value="Fintech / P2P">Fintech / P2P</option>
              <option value="Koperasi">Koperasi</option>
              <option value="NGO / Yayasan">NGO / Yayasan</option>
            </select>
          </div>

          {editingInst ? (
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
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Username Akun *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoCapitalize="none"
                    value={instUsername}
                    onChange={(e) => setInstUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))}
                    placeholder="Contoh: bni_prioritas"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium font-mono"
                  />
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Gunakan huruf kecil, angka, titik, atau underscore untuk login lembaga.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={instPassword}
                    onChange={(e) => setInstPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                  />
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Email Lembaga <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={instEmail}
                    onChange={(e) => setInstEmail(e.target.value)}
                    placeholder="kontak@lembaga.co.id"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                  />
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Jika dikosongkan, akun login menggunakan username di atas.</p>
              </div>
            </>
          )}

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
              {saving ? "Menyimpan..." : editingInst ? "Simpan Perubahan" : "Buat Akun Lembaga"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
