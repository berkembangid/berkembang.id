"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, History, LoaderCircle, ToggleLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

type FlagRow = {
  flag_key: string;
  description: string;
  enabled: boolean;
  updated_at: string;
};

type LogRow = {
  id: string;
  action: string;
  target_id: string | null;
  reason: string;
  occurred_at: string;
  acting_role: string;
};

/** Sakelar yang mematikan cara mencatat; menutupnya berdampak ke layar pemilik. */
const CAPTURE_FLAGS = new Set(["capture_voice", "capture_camera", "caption_live"]);

function whenText(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * Sakelar fitur — pemutus arus Ruang Mesin.
 *
 * Halaman ini tidak punya rute API sendiri, dan itu disengaja. Penjaganya ada
 * di basis data: `admin_set_feature_flag` menuntut peran, menuntut alasan, dan
 * menulis catatannya dalam transaksi yang sama. Rute API di antaranya hanya
 * akan menjadi lapisan yang bisa dilewati, atau lapisan kedua yang harus ikut
 * diubah setiap kali aturannya berubah.
 *
 * Asimetri yang perlu dipahami sebelum memakai layar ini: MEMATIKAN cukup OPS,
 * MENYALAKAN KEMBALI menuntut SUPER_ADMIN. Sakelar darurat ada untuk dipakai
 * saat ada yang jebol, sering oleh siapa pun yang kebetulan sedang berjaga.
 */
export default function AdminFlagsPage() {
  const { confirmWithReason } = useConfirm();
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const [flagResult, logResult] = await Promise.all([
      supabase.from("feature_flags").select("flag_key,description,enabled,updated_at").order("flag_key"),
      supabase
        .from("admin_action_logs")
        .select("id,action,target_id,reason,occurred_at,acting_role")
        .in("action", ["FEATURE_FLAG_ENABLED", "FEATURE_FLAG_DISABLED", "FEATURE_FLAG_OVERRIDE_SET"])
        .order("occurred_at", { ascending: false })
        .limit(8),
    ]);

    if (flagResult.error) {
      setLoadError("Daftar sakelar belum dapat dimuat. Muat ulang halaman ini.");
    } else {
      setLoadError("");
      setFlags(flagResult.data ?? []);
    }
    setLogs(logResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggle(flag: FlagRow) {
    const turningOff = flag.enabled;
    const reason = await confirmWithReason({
      title: turningOff ? `Matikan ${flag.flag_key}?` : `Nyalakan ${flag.flag_key}?`,
      description: turningOff
        ? CAPTURE_FLAGS.has(flag.flag_key)
          ? `${flag.description}. Layar Catat pemilik usaha akan berhenti menampilkan cara ini dan berpindah sendiri ke menulis, tanpa pesan galat. Draf yang belum dikonfirmasi tidak hilang.`
          : `${flag.description}. Fitur ini berhenti tersedia untuk semua akun sampai dinyalakan kembali.`
        : `${flag.description}. Fitur ini kembali tersedia untuk semua akun yang tidak punya pengecualian sendiri.`,
      reasonLabel: turningOff ? "Kenapa dimatikan?" : "Apa yang sudah diperbaiki?",
      reasonPlaceholder: turningOff
        ? "Contoh: pembacaan suara gagal berulang sejak pukul 14.00"
        : "Contoh: penyebabnya sudah diperbaiki dan diuji di pratayang",
      confirmLabel: turningOff ? "Matikan sekarang" : "Nyalakan",
      cancelLabel: "Batal",
      tone: turningOff ? "danger" : "default",
    });
    if (reason === null) return;

    setBusyKey(flag.flag_key);
    try {
      const { error } = await supabase.rpc("admin_set_feature_flag", {
        p_flag_key: flag.flag_key,
        p_enabled: !flag.enabled,
        p_reason: reason,
      });
      if (error) throw new Error(readableError(error.message));
      notifySuccess(turningOff ? `${flag.flag_key} dimatikan` : `${flag.flag_key} dinyalakan`, {
        description: turningOff
          ? "Perubahannya berlaku pada pemuatan layar berikutnya di sisi pemilik."
          : "Fitur kembali tersedia untuk semua akun.",
      });
      await load();
    } catch (cause) {
      notifyFromError(cause, "Sakelar belum berhasil diubah.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-extrabold text-[#1b2a3a] md:text-3xl">Sakelar fitur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pemutus arus per fitur. Mematikan cukup peran OPS; menyalakan kembali menuntut SUPER_ADMIN.
        </p>
      </div>

      {loadError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-[#e3e9f0] bg-white p-12 text-sm text-slate-500">
          <LoaderCircle size={18} className="animate-spin" /> Memuat sakelar…
        </div>
      ) : (
        <div className="grid gap-3">
          {flags.map((flag) => (
            <article
              key={flag.flag_key}
              className="flex flex-col gap-3 rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-sm font-bold text-[#1b2a3a]">{flag.flag_key}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      flag.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {flag.enabled ? "Menyala" : "Mati"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{flag.description}</p>
                <p className="mt-1 text-[11px] text-slate-400">Terakhir berubah {whenText(flag.updated_at)}</p>
              </div>

              <button
                type="button"
                onClick={() => void toggle(flag)}
                disabled={busyKey !== null}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors disabled:opacity-50 ${
                  flag.enabled
                    ? "border border-[#f0c8c8] bg-[#fdf1f3] text-[#b4304a] hover:bg-[#fbe6ea]"
                    : "bg-[#0b5f86] text-white hover:bg-[#0f73a3]"
                }`}
              >
                {busyKey === flag.flag_key ? <LoaderCircle size={14} className="animate-spin" /> : <ToggleLeft size={15} />}
                {flag.enabled ? "Matikan" : "Nyalakan"}
              </button>
            </article>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[#1b2a3a]">
          <History size={15} className="text-slate-400" /> Perubahan terakhir
        </h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">Belum ada sakelar yang pernah diubah.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eef2f6]">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1b2a3a]">
                    <span className="font-mono">{log.target_id}</span>{" "}
                    {log.action === "FEATURE_FLAG_ENABLED" ? "dinyalakan" : log.action === "FEATURE_FLAG_DISABLED" ? "dimatikan" : "diberi pengecualian"}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{log.reason}</p>
                </div>
                <p className="shrink-0 text-[11px] text-slate-400">
                  {log.acting_role} · {whenText(log.occurred_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Kode galat dari basis data bukan kalimat.
 *
 * Yang sampai ke sini berbentuk `BUTUH_PERAN_OPS`; dibiarkan apa adanya, ia
 * tampil sebagai kegagalan sistem padahal isinya adalah aturan yang memang
 * sengaja dibuat.
 */
function readableError(message: string): string {
  if (message.includes("MENYALAKAN_BUTUH_SUPER_ADMIN")) {
    return "Menyalakan kembali sakelar hanya bisa dilakukan SUPER_ADMIN.";
  }
  if (message.includes("BUTUH_PERAN_OPS")) return "Akun Anda belum diberi peran OPS atau SUPER_ADMIN.";
  if (message.includes("BUKAN_ADMIN")) return "Sesi Anda bukan sesi admin platform.";
  if (message.includes("SAKELAR_TIDAK_DIKENAL")) return "Sakelar ini tidak terdaftar.";
  if (message.includes("ALASAN_WAJIB")) return "Alasannya terlalu pendek untuk berguna di riwayat nanti.";
  return message;
}
