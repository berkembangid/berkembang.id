"use client";

const AUDIT_LOGS = [
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
  UPDATE_RULES_CONFIG: "bg-purple-100 text-purple-700",
  REQUEST_DOSSIER: "bg-blue-100 text-blue-700",
  OVERRIDE_SCORE: "bg-orange-100 text-orange-700",
  RECALCULATE_READINESS: "bg-green-100 text-green-700",
  CHECK_STREAK: "bg-teal-100 text-teal-700",
  CONFIRM_TRANSACTION: "bg-emerald-100 text-emerald-700",
  VERIFY_DOSSIER: "bg-indigo-100 text-indigo-700",
  CREATE_INSTITUTION: "bg-sky-100 text-sky-700",
};

export default function AuditPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">Lacak jejak audit dan riwayat aksi administrator sistem</p>
        </div>
        <button className="border border-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors">
          Ekspor CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-4">
        <input
          placeholder="Cari action, user..."
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-[#001b85] focus:outline-none flex-1 max-w-xs"
        />
        <select className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-[#001b85] focus:outline-none bg-white">
          <option>Semua Action</option>
          <option>UPDATE_RULES_CONFIG</option>
          <option>REQUEST_DOSSIER</option>
          <option>OVERRIDE_SCORE</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
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
            {AUDIT_LOGS.map((log) => (
              <tr key={log.id} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff] transition-colors">
                <td className="px-4 py-3 text-[#444655] text-xs font-mono">{log.timestamp}</td>
                <td className="px-4 py-3 text-[#141a34] text-xs">{log.user}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-600"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#444655] text-xs max-w-xs">{log.details}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ {log.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
