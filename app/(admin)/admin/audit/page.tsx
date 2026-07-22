"use client";

import { useState, useEffect } from "react";
import { Download, Search, History, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AuditLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  status: string;
}

const DEFAULT_AUDIT_LOGS: AuditLog[] = [
  { id: 1, timestamp: "2026-07-21 09:15:32", user: "admin@berkembang.id", action: "UPDATE_RULES_CONFIG", details: "Bobot konsistensi: 30→35, legalitas: 30→25", status: "success" },
  { id: 2, timestamp: "2026-07-21 08:30:11", user: "institution@bri.co.id", action: "REQUEST_DOSSIER", details: "UMKM ID #1247, program: KUR Mikro", status: "success" },
  { id: 3, timestamp: "2026-07-20 16:45:00", user: "admin@berkembang.id", action: "OVERRIDE_SCORE", details: "UMKM ID #892, skor: 45→58, alasan: Data diperbarui", status: "success" },
  { id: 4, timestamp: "2026-07-20 14:22:18", user: "system", action: "RECALCULATE_READINESS", details: "Batch recalculation: 1,247 UMKM diproses", status: "success" },
  { id: 5, timestamp: "2026-07-20 12:00:00", user: "system", action: "CHECK_STREAK", details: "287 streak diperbarui, 23 peringatan dikirim", status: "success" },
  { id: 6, timestamp: "2026-07-19 20:30:45", user: "umkm@example.com", action: "CONFIRM_TRANSACTION", details: "Transaksi Rp470.000 dikonfirmasi", status: "success" },
  { id: 7, timestamp: "2026-07-19 18:05:12", user: "institution@mandiri.co.id", action: "VERIFY_DOSSIER", details: "Dossier UMKM #1102 disetujui", status: "success" },
  { id: 8, timestamp: "2026-07-18 10:00:00", user: "admin@berkembang.id", action: "CREATE_INSTITUTION", details: "Institusi baru: Bank BNI KUR", status: "success" },
];

const ACTION_COLORS: Record<string, string> = {
  UPDATE_RULES_CONFIG: "bg-purple-100 text-purple-700 border-purple-200",
  REQUEST_DOSSIER: "bg-blue-100 text-blue-700 border-blue-200",
  OVERRIDE_SCORE: "bg-orange-100 text-orange-700 border-orange-200",
  RECALCULATE_READINESS: "bg-green-100 text-green-700 border-green-200",
  CHECK_STREAK: "bg-teal-100 text-teal-700 border-teal-200",
  CONFIRM_TRANSACTION: "bg-emerald-100 text-emerald-700 border-emerald-200",
  VERIFY_DOSSIER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  CREATE_INSTITUTION: "bg-sky-100 text-sky-700 border-sky-200",
  CREATE_UMKM: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>(DEFAULT_AUDIT_LOGS);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("Semua Action");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAuditLogsFromSupabase();
  }, []);

  async function fetchAuditLogsFromSupabase() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: AuditLog[] = data.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp ? new Date(item.timestamp).toLocaleString("id-ID") : new Date(item.created_at).toLocaleString("id-ID"),
          user: item.user_email || "system",
          action: item.action || "LOG_EVENT",
          details: item.details || "-",
          status: item.status || "success",
        }));
        setLogs(mapped);
      }
    } catch (err) {
      console.warn("Failed to fetch audit logs from Supabase:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase());

    const matchesAction =
      actionFilter === "Semua Action" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const exportCSV = () => {
    const headers = ["ID", "Waktu", "User", "Action", "Detail", "Status"];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.user}"`,
      `"${l.action}"`,
      `"${l.details.replace(/"/g, '""')}"`,
      `"${l.status}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Audit_Log_BERKEMBANG.ID_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">Lacak jejak audit dan riwayat aksi administrator sistem</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditLogsFromSupabase}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Log"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={exportCSV}
            className="border border-slate-300 text-[#001b85] px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-[#ececff] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari action, user, detail..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200/80 text-xs font-medium focus:border-[#001b85] focus:outline-none bg-white"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200/80 text-xs font-bold text-[#141a34] focus:border-[#001b85] focus:outline-none bg-white cursor-pointer"
        >
          <option value="Semua Action">Semua Action</option>
          <option value="UPDATE_RULES_CONFIG">UPDATE_RULES_CONFIG</option>
          <option value="OVERRIDE_SCORE">OVERRIDE_SCORE</option>
          <option value="REQUEST_DOSSIER">REQUEST_DOSSIER</option>
          <option value="CREATE_UMKM">CREATE_UMKM</option>
          <option value="CREATE_INSTITUTION">CREATE_INSTITUTION</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f2ff] border-b border-[#e5e7ff]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Waktu</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Detail</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-slate-400 font-medium">
                    Tidak ada data log yang sesuai.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff] transition-colors">
                    <td className="px-4 py-3 text-[#444655] text-xs font-mono">{log.timestamp}</td>
                    <td className="px-4 py-3 text-[#141a34] text-xs font-semibold">{log.user}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#444655] text-xs max-w-xs leading-snug">{log.details}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full">
                        ✓ {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
