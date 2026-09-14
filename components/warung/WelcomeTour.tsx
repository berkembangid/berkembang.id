"use client";

/**
 * Perkenalan singkat untuk pemilik yang baru mendaftar.
 *
 * EMPAT KARTU, BUKAN TUR BERTANDA PANAH.
 *
 * Tur yang menyorot tombol satu per satu menuntut orangnya mengikuti sampai
 * habis, dan gagal total di layar sempit -- sorotan bergeser, panahnya
 * menunjuk tempat kosong. Empat kartu yang dibaca sendiri tidak punya masalah
 * itu, bisa ditutup kapan saja, dan tetap terbaca kalau dibuka lagi nanti.
 *
 * "LEWATI" SELALU TERLIHAT, DAN ITU DISENGAJA.
 *
 * Pemilik warung membuka aplikasi ini untuk mencatat, bukan untuk membaca
 * perkenalan. Yang menyembunyikan tombol lewati di balik empat ketukan bukan
 * sedang mengajari; ia sedang menahan orang.
 *
 * Melewati dan menyelesaikan MENANDAI HAL YANG SAMA. Perkenalan yang muncul
 * lagi karena dilewati -- bukan diselesaikan -- adalah perkenalan yang
 * menghukum orang karena tidak membacanya.
 */

import { useState } from "react";
import { ArrowRight, Check, FileText, Mic, Sparkles, TrendingUp, X } from "lucide-react";
import { notifyFromError } from "@/lib/notify";

type Step = {
  icon: typeof Mic;
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    icon: Mic,
    title: "Cukup bicara, tidak perlu mengetik",
    body:
      "Tekan tombol rekam dan ceritakan transaksinya seperti bercerita ke orang: " +
      "“Hari ini jual nasi kotak lima puluh ribu, dibayar tunai.” Catatannya masuk sendiri.",
  },
  {
    icon: TrendingUp,
    title: "Untung dan rugi dihitung untuk Anda",
    body:
      "Tidak ada istilah akuntansi yang perlu Anda hafal. Dari catatan harian itu, " +
      "aplikasi menyusun laporan yang bisa dibaca bank dan dinas.",
  },
  {
    icon: FileText,
    title: "Isi profil dulu, dokumen bisa nanti",
    body:
      "Nama usaha, bidang, dan kota membuat laporan Anda bisa dikenali. " +
      "Foto izin seperti NIB dan PIRT boleh diunggah kapan-kapan — tidak ada yang terhenti karena itu.",
  },
  {
    icon: Sparkles,
    title: "Tidak ada yang bisa melihat data Anda",
    body:
      "Catatan Anda tertutup sampai Anda sendiri memberi izin, per permintaan, " +
      "dan izin itu bisa Anda cabut kapan saja.",
  },
];

export function WelcomeTour({ ownerName, onClose }: { ownerName?: string | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = step === STEPS.length - 1;

  /**
   * Layarnya ditutup lebih dulu, penandanya disimpan sesudah.
   *
   * Kalau urutannya dibalik, jaringan yang lambat membuat pemilik menekan
   * "Lewati" lalu menunggu di depan layar yang tidak bergerak. Dan kalau
   * penyimpanannya gagal, yang terjadi paling buruk adalah perkenalan ini
   * muncul sekali lagi -- bukan pemilik yang terkurung di dalamnya.
   */
  async function finish() {
    setBusy(true);
    onClose();
    try {
      const response = await fetch("/api/v1/onboarding/seen", { method: "POST" });
      if (!response.ok) throw new Error("Penanda perkenalan belum tersimpan.");
    } catch (error) {
      notifyFromError(error, "Perkenalan ini mungkin muncul sekali lagi nanti.");
    } finally {
      setBusy(false);
    }
  }

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sambutan-judul"
    >
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5f86]">
            Selamat datang{ownerName ? `, ${ownerName.split(" ")[0]}` : ""}
          </p>
          {/* Selalu terlihat, di setiap langkah. */}
          <button
            type="button"
            onClick={() => void finish()}
            disabled={busy}
            aria-label="Lewati perkenalan"
            className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-xl text-[#6e859e] hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>

        <span className="mt-3 grid size-11 place-items-center rounded-2xl bg-[#eef8fd] text-[#0f73a3]">
          <Icon size={20} />
        </span>
        <h2 id="sambutan-judul" className="mt-3 text-base font-bold leading-snug text-[#1b2a3a]">
          {current.title}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[#6e859e]">{current.body}</p>

        <div className="mt-4 flex gap-1.5" aria-label={`Langkah ${step + 1} dari ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1.5 rounded-full transition-all ${index <= step ? "w-7 bg-[#1590c7]" : "w-3.5 bg-[#e3e9f0]"}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void finish()}
            disabled={busy}
            className="min-h-11 text-xs font-bold text-[#6e859e] underline underline-offset-2 disabled:opacity-50"
          >
            Lewati
          </button>
          <button
            type="button"
            onClick={() => (last ? void finish() : setStep(step + 1))}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0b5f86] px-5 text-xs font-bold text-white disabled:opacity-50"
          >
            {last ? <><Check size={15} /> Mulai lengkapi profil</> : <>Lanjut <ArrowRight size={15} /></>}
          </button>
        </div>
      </section>
    </div>
  );
}
