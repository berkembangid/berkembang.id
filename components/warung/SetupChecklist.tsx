"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, X } from "lucide-react";
import type { ReadinessLevelPayload } from "@/modules/readiness/level-repository";

type Step = { id: string; title: string; hint: string; href: string; done: boolean };

const HIDE_KEY = "berkembang:setup-checklist-hidden";

/**
 * Daftar persiapan yang bertahan sampai selesai.
 *
 * Perkenalan empat kartu menjelaskan aplikasinya sekali, lalu hilang.
 * Beranda hanya menunjukkan SATU langkah berikutnya. Pemilik baru tidak
 * pernah melihat seluruh pekerjaan persiapannya dalam satu tempat -- profil,
 * dokumen, kondisi awal, rekening, catatan pertama -- apalagi mana yang
 * sudah beres.
 *
 * Statusnya dibaca dari kesiapan yang sama dengan halaman Perjalanan, jadi
 * tidak ada dua jawaban berbeda soal « sudah lengkap belum ». Daftar hilang
 * sendiri ketika semuanya selesai; menyembunyikannya lebih awal disimpan di
 * peramban, karena ini hanya soal tampilan.
 */
export function setupSteps(readiness: ReadinessLevelPayload | null, hasTransactions: boolean): Step[] {
  const status = (id: string) =>
    readiness?.pillars.flatMap((pillar) => pillar.components).find((component) => component.id === id)?.status ?? null;
  const started = (id: string) => status(id) === "TERPENUHI" || status(id) === "SEBAGIAN";
  return [
    { id: "profil", title: "Lengkapi profil usaha", hint: "Tahun mulai, alamat, WhatsApp, dan asal pembeli.", href: "/umkm/profil", done: status("C2") === "TERPENUHI" },
    { id: "catat", title: "Catat transaksi pertama", hint: "Ceritakan satu penjualan atau belanja hari ini.", href: "/umkm/catat", done: hasTransactions },
    { id: "awal", title: "Isi kondisi awal", hint: "Uang di laci, stok, utang, dan alat usaha saat mulai mencatat.", href: "/umkm/profil/kondisi-awal", done: status("D1") === "TERPENUHI" },
    { id: "dokumen", title: "Simpan dokumen izin", hint: "Foto NIB, KTP, atau izin lain yang sudah Anda punya.", href: "/umkm/profil/dokumen", done: started("C1") },
    { id: "rekening", title: "Catat rekening usaha", hint: "Rekening yang khusus dipakai untuk uang usaha.", href: "/umkm/profil/rekening", done: started("B5") },
  ];
}

function readHidden() {
  try { return window.localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}

export function SetupChecklist({ readiness, hasTransactions, loading }: {
  readiness: ReadinessLevelPayload | null;
  hasTransactions: boolean;
  loading: boolean;
}) {
  // Null sampai peramban terbaca: server tidak tahu isi localStorage, dan
  // menebak « tampil » lalu menghilangkannya berarti kartu berkedip.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setHidden(readHidden()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  // Tanpa data kesiapan status tiap langkah tidak diketahui; menampilkan
  // semuanya « belum » akan menyuruh pemilik mengulang pekerjaan yang sudah.
  if (loading || !readiness || hidden !== false) return null;
  const steps = setupSteps(readiness, hasTransactions);
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  const hide = () => {
    try { window.localStorage.setItem(HIDE_KEY, "1"); } catch { /* tetap disembunyikan untuk kunjungan ini */ }
    setHidden(true);
  };

  return (
    <section aria-labelledby="persiapan-judul" className="rounded-2xl border border-umkm-brand-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="persiapan-judul" className="text-sm font-bold text-umkm-ink">Persiapan usaha</h2>
          <p className="mt-0.5 text-xs text-umkm-subtle">{doneCount} dari {steps.length} selesai. Sekali beres, laporan Anda siap dibaca lembaga.</p>
        </div>
        <button type="button" onClick={hide} aria-label="Sembunyikan daftar persiapan" className="grid size-11 shrink-0 place-items-center rounded-lg text-umkm-subtle hover:bg-umkm-surface-muted">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-umkm-line" role="progressbar" aria-label="Kemajuan persiapan" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
        <div className="h-full rounded-full bg-umkm-success" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
      </div>
      <ol className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.id}>
            {step.done ? (
              <p className="flex min-h-11 items-center gap-3 px-1 text-xs text-umkm-subtle">
                <CheckCircle2 size={18} className="shrink-0 text-umkm-success" aria-hidden />
                <span className="line-through">{step.title}</span>
                <span className="sr-only">— selesai</span>
              </p>
            ) : (
              <Link href={step.href} className="flex min-h-11 items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-umkm-brand-soft">
                <Circle size={18} className="shrink-0 text-umkm-line-strong" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-umkm-ink">{step.title}</span>
                  <span className="block text-xs text-umkm-subtle">{step.hint}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-umkm-subtle" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
