"use client";

import { useState, useEffect } from "react";
import { UserPlus, ShieldCheck, Mail, Lock, User, Trash2, RefreshCw, X, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Form states
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  async function fetchAdminUsers() {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "admin")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching admins:", error.message);
      }

      if (data && data.length > 0) {
        const mapped: AdminUser[] = data.map((item: any, idx: number) => ({
          id: item.id || `admin-${idx}`,
          name: item.name || item.email?.split("@")[0] || "Administrator",
          email: item.email || "admin@berkembang.id",
          role: "Super Admin",
          created_at: item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID") : "Terdaftar",
        }));
        setAdminList(mapped);
      } else {
        // Fallback default admin if profiles is empty
        setAdminList([
          {
            id: "default-admin-1",
            name: "Super Administrator",
            email: "admin@berkembang.id",
            role: "Super Admin",
            created_at: "21 Juli 2026",
          },
        ]);
      }
    } catch (err: any) {
      console.warn("Failed to fetch admin users:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword || !adminName.trim()) return;

    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      // 1. Sign up user with Supabase auth with metadata role: 'admin'
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: adminEmail.trim(),
        password: adminPassword,
        options: {
          data: {
            name: adminName.trim(),
            role: "admin",
          },
        },
      });

      if (authError) {
        let msg = authError.message;
        if (msg.includes("User already registered")) {
          msg = "Email admin tersebut sudah terdaftar di sistem.";
        } else if (msg.includes("Password should be")) {
          msg = "Kata sandi minimal 8 karakter.";
        }
        setErrorMsg(msg);
        setSaving(false);
        return;
      }

      const newUserId = authData?.user?.id || `admin-${Date.now()}`;

      // 2. Insert into profiles table with role: 'admin'
      await supabase.from("profiles").insert({
        id: newUserId,
        email: adminEmail.trim(),
        name: adminName.trim(),
        role: "admin",
      });

      // 3. Log into audit logs
      await supabase.from("audit_logs").insert({
        user_email: "admin@berkembang.id",
        action: "CREATE_ADMIN_ACCOUNT",
        details: `Pembuatan Akun Admin Baru: ${adminName.trim()} (${adminEmail.trim()})`,
        status: "success",
      });

      const newAdminObj: AdminUser = {
        id: newUserId,
        name: adminName.trim(),
        email: adminEmail.trim(),
        role: "Super Admin",
        created_at: new Date().toLocaleDateString("id-ID"),
      };

      setAdminList([newAdminObj, ...adminList]);
      setSuccessMsg(`Akun Admin ${adminName.trim()} berhasil dibuat!`);
      setShowAddModal(false);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error creating admin account:", err);
      setErrorMsg(err.message || "Gagal membuat akun admin.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async (id: string, email: string) => {
    if (adminList.length <= 1) {
      alert("Tidak dapat menghapus akun admin utama.");
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus akun admin (${email})?`)) return;

    try {
      await supabase.from("profiles").delete().eq("id", id);
      
      await supabase.from("audit_logs").insert({
        user_email: "admin@berkembang.id",
        action: "DELETE_ADMIN_ACCOUNT",
        details: `Penghapusan Akun Admin ID #${id} (${email})`,
        status: "success",
      });

      setAdminList(adminList.filter((a) => a.id !== id));
      setSuccessMsg(`Akun Admin (${email}) berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error("Error deleting admin:", err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">
            Kelola Akun Administrator
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tambah dan atur hak akses akun administrator platform Berkembang.id
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAdminUsers}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => {
              setErrorMsg("");
              setShowAddModal(true);
            }}
            className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <UserPlus size={16} />
            Buat Akun Admin Baru
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* Admin List Cards */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Memuat daftar akun administrator...
        </div>
      ) : adminList.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Belum ada akun admin lain terdaftar. Klik "Buat Akun Admin Baru" untuk menambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminList.map((admin) => (
            <div
              key={admin.id}
              className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#001b85] to-[#0ea5e9] flex items-center justify-center font-bold text-white shadow-sm flex-shrink-0 text-base">
                  {admin.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[#141a34] text-base truncate">{admin.name}</h3>
                    <span className="text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-blue-50 text-[#001b85] border border-blue-200 flex items-center gap-1">
                      <ShieldCheck size={10} /> {admin.role}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1 truncate">{admin.email}</p>
                  <p className="text-[11px] text-slate-400 mt-2 font-medium">Terdaftar: {admin.created_at}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                  disabled={adminList.length <= 1}
                  className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Hapus Akun Admin"
                >
                  <Trash2 size={12} />
                  Hapus Akun
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Buat Akun Admin Baru */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Buat Akun Administrator Baru"
        subtitle="Registrasikan pengelola hak akses admin platform"
        icon={<ShieldCheck size={22} />}
        maxWidth="max-w-md"
      >
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Nama Lengkap Administrator *
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Contoh: Budi Pratama"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Email Admin *
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin2@berkembang.id"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Kata Sandi (Password) *
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                minLength={8}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saving ? "Membuat..." : "Buat Akun Admin"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
