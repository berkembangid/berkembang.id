"use client";

/**
 * Halaman Tingkat Kesiapan.
 *
 * Menggantikan tiga halaman lama (`/umkm/score`, `/umkm/gaps`, `/umkm/roadmap`)
 * yang menampilkan konsep yang sama dengan tiga angka berbeda: "17 dari 100",
 * "6/7", dan nilai per komponen. Semuanya kini satu tangga, dan seluruh isinya
 * datang dari `GET /api/v1/readiness` — halaman ini tidak menghitung apa pun.
 *
 * Angka mentah tidak pernah muncul. Yang ditampilkan adalah tingkat, apa yang
 * ia buka, dan satu langkah berikutnya. Sebuah angka tunggal yang menilai usaha
 * seseorang terlalu mudah disalahartikan sebagai penilaian kelayakan — dan
 * angka yang mustahil naik cepat hanya membuat orang berhenti membukanya.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, RefreshCcw } from "lucide-react";
import { DashboardPage, PageHeader } from "@/components/dashboard";
import { ShieldCheck } from "lucide-react";
import type { ReadinessLevelPayload } from "@/modules/readiness/level-repository";
import { readinessLevels } from "@/modules/readiness/evaluator";
import { levelNames } from "@/modules/readiness/level-copy";

/** Arti singkat yang ditulis di anak tangga, bukan di kartu terpisah. */
const rungMeaning: Record<string, string> = {
  MULAI: "",
  TEMBAGA: "catatan hidup",
  PERAK: "laporan siap cetak",
  EMAS: "siap dilihat lembaga",
};

function Ladder({ level }: { level: ReadinessLevelPayload["level"] }) {
  const current = readinessLevels.indexOf(level);
  return (
    <ol className="flex items-start gap-2">
      {readinessLevels.map((rung, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li key={rung} className="relative flex-1 pt-7 text-center">
            {index > 0 && (
              <span
                aria-hidden
                className={`absolute left-[calc(-50%+10px)] top-[9px] z-0 h-0.5 w-[calc(100%-20px)] ${
                  done || now ? "bg-[#1fcb8f]" : "bg-[#c8d3de]"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`absolute left-1/2 top-0 z-10 h-5 w-5 -translate-x-1/2 rounded-full border-2 ${
                now
                  ? "border-[#1b2a3a] bg-[#1b2a3a] shadow-[0_0_0_4px_rgba(27,42,58,.12)]"
                  : done
                    ? "border-[#1fcb8f] bg-[#1fcb8f]"
                    : "border-[#c8d3de] bg-white"
              }`}
            />
            <span
              className={`block text-xs font-bold ${
                now ? "text-[#1b2a3a]" : done ? "text-[#0a5c42]" : "text-[#6e859e]"
              }`}
            >
              {levelNames[rung]}
            </span>
            {rungMeaning[rung] && (
              <span className="mt-0.5 block text-[10px] font-normal leading-tight text-[#6e859e]">
                {rungMeaning[rung]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function HabitRing({ value, target }: { value: number; target: number }) {
  const circumference = 2 * Math.PI * 22;
  const ratio = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  return (
    <div className="relative h-[52px] w-[52px] shrink-0">
      <svg width="52" height="52" className="-rotate-90" aria-hidden>
        <circle cx="26" cy="26" r="22" fill="none" stroke="#e3e9f0" strokeWidth="6" />
        <circle
          cx="26"
          cy="26"
          r="22"
          fill="none"
          stroke="#1fcb8f"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#1b2a3a]">
        {value}/{target}
      </span>
    </div>
  );
}

const dotClass = {
  success: "bg-[#1fcb8f] text-white",
  attention: "bg-[#f5c453] text-[#5c3700]",
  neutral: "bg-[#c8d3de] text-white",
} as const;

const barClass = { A: "bg-[#1fcb8f]", B: "bg-[#74e3b9]", C: "bg-[#29abe2]", D: "bg-[#7cc8ec]" } as const;
const pillarIcon = { A: "🔥", B: "🪙", C: "📄", D: "📊" } as const;

export default function ReadinessLevelPage() {
  const [data, setData] = useState<ReadinessLevelPayload | null>(null);
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/readiness");
      const payload = (await response.json()) as { data?: ReadinessLevelPayload };
      if (!response.ok || !payload.data) throw new Error("gagal");
      setData(payload.data);
      setProblem("");
    } catch {
      setProblem("Tingkat kesiapan belum bisa dimuat. Coba muat ulang sebentar lagi.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (problem) {
    return (
      <DashboardPage width="compact">
        <PageHeader title="Langkah usaha saya" description="Semua dinilai otomatis dari catatan dan dokumenmu." icon={ShieldCheck} />
        <p className="rounded-2xl border border-[#f0d9a8] bg-[#fdf8ee] px-4 py-3 text-xs text-[#8a6412]">
          {problem}{" "}
          <button type="button" onClick={() => void load()} className="font-bold underline">
            Coba lagi
          </button>
        </p>
      </DashboardPage>
    );
  }

  if (!data) {
    return (
      <DashboardPage width="compact">
        <PageHeader title="Langkah usaha saya" description="Semua dinilai otomatis dari catatan dan dokumenmu." icon={ShieldCheck} />
        <p className="flex items-center gap-2 px-1 py-6 text-xs text-[#6e859e]">
          <LoaderCircle size={14} className="animate-spin" /> Memuat tingkat kesiapan…
        </p>
      </DashboardPage>
    );
  }

  const habit = data.pillars
    .find((pillar) => pillar.id === "A")
    ?.components.find((component) => component.id === "A1");

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Langkah usaha saya"
        description="Semua dinilai otomatis dari catatan dan dokumenmu — tidak ada yang perlu diklaim."
        icon={ShieldCheck}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9]"
          >
            <RefreshCcw size={14} /> Muat ulang
          </button>
        }
      />

      {/* ── Kartu tingkat ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="tingkat-judul"
        className="rounded-2xl bg-gradient-to-br from-[#d3f5e7] to-[#d6eefa] p-5"
      >
        <h2 id="tingkat-judul" className="text-[11px] font-bold uppercase tracking-[.04em] text-[#4a6280]">
          Tingkat kesiapan usahamu
        </h2>
        <p className="mt-0.5 text-[34px] font-bold leading-tight tracking-tight text-[#1b2a3a]">
          {data.levelName}
        </p>
        <p className="mb-4 text-sm text-[#243b55]">{data.levelMeaning}</p>

        <Ladder level={data.level} />

        {data.step && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1b2a3a]">
                Langkah paling berdampak: {data.step.title}
              </p>
              <p className="mt-0.5 text-xs text-[#4a6280]">{data.step.headline}</p>
            </div>
            {data.step.action && (
              <Link
                href={data.step.action.href}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#3ee6a8] px-4 text-xs font-bold text-[#1b2a3a]"
              >
                Kerjakan <ArrowRight size={14} />
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ── Empat pilar ───────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.pillars.map((pillar) => (
          <section
            key={pillar.id}
            aria-labelledby={`pilar-${pillar.id}`}
            className="rounded-2xl border border-[#c8d3de] bg-white p-5"
          >
            <h3 id={`pilar-${pillar.id}`} className="flex flex-wrap items-center gap-x-2 text-[15px] font-bold text-[#1b2a3a]">
              <span aria-hidden>{pillarIcon[pillar.id]}</span> {pillar.title}
              <span className="text-[11.5px] font-normal text-[#4a6280]">— {pillar.tag}</span>
            </h3>
            <div className="my-3 h-2 overflow-hidden rounded-full bg-[#e3e9f0]">
              <i
                className={`block h-full rounded-full ${barClass[pillar.id]}`}
                style={{ width: `${Math.round(pillar.progress * 100)}%` }}
              />
            </div>

            <ul>
              {pillar.components.map((component) => {
                const isHabit = component.id === "A1" && habit?.targetNext;
                return (
                  <li
                    key={component.id}
                    className="flex items-start gap-2.5 border-t border-[#e3e9f0] py-2.5 text-[13.5px] first:border-t-0"
                  >
                    {isHabit ? (
                      <HabitRing
                        value={Number(component.displayValue) || 0}
                        target={component.targetNext ?? 0}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${dotClass[component.tone]}`}
                      >
                        {component.tone === "success" ? "✓" : component.tone === "attention" ? "!" : ""}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <b className="font-bold text-[#1b2a3a]">{component.title}</b>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[#4a6280]">
                        {component.hint}
                      </span>
                    </span>
                    {component.action && (
                      <Link
                        href={component.action.href}
                        className="shrink-0 pt-0.5 text-[12.5px] font-bold text-[#0b5f86]"
                      >
                        {component.action.label} →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* ── Tentang penilaian ini ─────────────────────────────────────── */}
      <section className="rounded-xl border border-[#e3e9f0] bg-[#f3f6f9] px-4 py-3 text-[12.5px] leading-relaxed text-[#4a6280]">
        <b className="text-[#243b55]">Tentang penilaian ini.</b> {data.disclaimer} Aturannya terbuka
        (versi {data.formulaVersion}).
        <span className="mt-2 block">
          <Link href="/umkm/kesiapan/metodologi" className="font-bold text-[#0b5f86]">
            Lihat cara kami menghitung →
          </Link>
        </span>
      </section>
    </DashboardPage>
  );
}
