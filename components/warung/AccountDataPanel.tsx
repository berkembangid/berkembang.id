"use client";

/**
 * Unduh semua data, dan hapus akun.
 *
 * Data usaha ini milik pemiliknya, bukan milik kami. Hak itu hanya berarti
 * kalau ada tombolnya, dan tombolnya hanya berarti kalau bisa ditekan tanpa
 * meminta izin siapa pun.
 *
 * Penghapusan dikonfirmasi dua langkah — bukan untuk mempersulit, tapi karena
 * tombol yang menghapus seluruh pembukuan usaha dalam satu ketukan akan ditekan
 * seseorang secara tidak sengaja. Yang berhenti seketika adalah akses institusi;
 * datanya menunggu 30 hari supaya kesalahan masih bisa dibatalkan sendiri.
 */

import { useState } from "react";
import { AlertCircle, Download, LoaderCircle, Trash2 } from "lucide-react";

type Stage = "idle" | "confirming" | "working" | "scheduled" | "failed";

export function AccountDataPanel({ scheduledFor }: { scheduledFor?: string | null }) {
  const [exporting, setExporting] = useState(false);
  const [stage, setStage] = useState<Stage>(scheduledFor ? "scheduled" : "idle");
  const [scheduled, setScheduled] = useState(scheduledFor ?? "");
  const [problem, setProblem] = useState("");

  async function exportData() {
    setExporting(true);
    setProblem("");
    try {
      const response = await fetch("/api/v1/account/export", { method: "POST" });
      if (!response.ok) throw new Error("gagal");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `data-usaha-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setProblem("Berkasnya belum berhasil dibuat. Coba lagi sebentar lagi.");
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setStage("working");
    setProblem("");
    try {
      const response = await fetch("/api/v1/account/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { data?: { scheduledFor?: string } };
      if (!response.ok) throw new Error("gagal");
      setScheduled(payload.data?.scheduledFor ?? "");
      setStage("scheduled");
    } catch {
      setStage("failed");
      setProblem("Permintaan belum terkirim. Coba lagi sebentar lagi.");
    }
  }

  async function cancelDeletion() {
    setStage("working");
    try {
      await fetch("/api/v1/account/deletion", { method: "DELETE" });
      setScheduled("");
      setStage("idle");
    } catch {
      setStage("failed");
      setProblem("Pembatalan belum terkirim. Coba lagi sebentar lagi.");
    }
  }

  const scheduledText = scheduled
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(`${scheduled}T12:00:00+07:00`))
    : "";

  return (
    <div className="space-y-3">
      {problem && (
        <p className="flex items-start gap-2 rounded-xl border border-[#f0d9a8] bg-[#fdf8ee] px-3 py-2 text-[11px] leading-relaxed text-[#8a6412]">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {problem}
        </p>
      )}

      <button
        type="button"
        onClick={() => void exportData()}
        disabled={exporting}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c8d3de] bg-white px-4 py-3 text-xs font-bold text-[#4a6280] transition-colors hover:bg-[#f7f9fb] disabled:opacity-60"
      >
        {exporting ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
        {exporting ? "Menyiapkan berkas…" : "Unduh semua data saya"}
      </button>
      <p className="px-1 text-[10px] leading-relaxed text-[#6e859e]">
        Berisi profil, seluruh catatan uang sebagai berkas tabel, dan dokumen yang pernah Anda
        unggah. Boleh diberikan ke siapa pun yang Anda mau.
      </p>

      {stage === "scheduled" ? (
        <div className="rounded-xl border border-[#f0d9a8] bg-[#fdf8ee] px-3.5 py-3">
          <p className="text-xs font-bold text-[#8a6412]">Akun dijadwalkan dihapus</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#8a6412]">
            Izin akses institusi sudah dicabut sekarang juga. Data Anda dihapus pada{" "}
            <strong>{scheduledText || "30 hari lagi"}</strong>. Sebelum tanggal itu Anda masih bisa
            membatalkannya sendiri, dan semuanya kembali seperti semula — kecuali izin akses, yang
            perlu Anda berikan ulang bila memang diinginkan.
          </p>
          <button
            type="button"
            onClick={() => void cancelDeletion()}
            className="mt-2.5 min-h-10 w-full rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white"
          >
            Batalkan penghapusan
          </button>
        </div>
      ) : stage === "confirming" ? (
        <div className="rounded-xl border border-[#e3e9f0] bg-white px-3.5 py-3">
          <p className="text-xs font-bold text-[#1b2a3a]">Yakin mau menghapus akun?</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-[#4a6280]">
            <li>· Izin akses institusi dicabut sekarang juga.</li>
            <li>· Data Anda dihapus 30 hari lagi.</li>
            <li>· Sebelum tanggal itu Anda bisa membatalkannya sendiri.</li>
          </ul>
          <p className="mt-1.5 text-[11px] font-bold text-[#4a6280]">
            Sebaiknya unduh dulu data Anda sebelum melanjutkan.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="min-h-10 flex-1 rounded-xl border border-[#c8d3de] bg-white text-xs font-bold text-[#4a6280]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void requestDeletion()}
              className="min-h-10 flex-1 rounded-xl bg-[#b4304a] text-xs font-bold text-white"
            >
              Ya, hapus akun saya
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setStage("confirming")}
          disabled={stage === "working"}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c8d3de] bg-white px-4 py-3 text-xs font-bold text-[#b4304a] transition-colors hover:bg-[#fdf1f3] disabled:opacity-60"
        >
          <Trash2 size={14} /> Hapus akun
        </button>
      )}
    </div>
  );
}
