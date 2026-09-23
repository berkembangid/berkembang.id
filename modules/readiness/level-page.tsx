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
    <ol aria-label="Tangga tingkat kesiapan" className="flex items-start gap-2">
      {readinessLevels.map((rung, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li key={rung} aria-current={now ? "step" : undefined} className="relative flex-1 pt-7 text-center">
            {index > 0 && (
              <span
                aria-hidden
                className={`absolute left-[calc(-50%+10px)] top-[9px] z-0 h-0.5 w-[calc(100%-20px)] ${
                  done || now ? "bg-[#1fcb8f]" : "bg-umkm-line-strong"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`absolute left-1/2 top-0 z-10 h-5 w-5 -translate-x-1/2 rounded-full border-2 ${
                now
                  ? "border-umkm-ink bg-umkm-ink shadow-[0_0_0_4px_rgba(27,42,58,.12)]"
                  : done
                    ? "border-[#1fcb8f] bg-[#1fcb8f]"
                    : "border-umkm-line-strong bg-white"
              }`}
            />
            <span
              className={`block text-xs font-bold ${
                now ? "text-umkm-ink" : done ? "text-umkm-success" : "text-umkm-subtle"
              }`}
            >
              {levelNames[rung]}
              {/* Warna titik tidak terbaca pembaca layar; keadaannya disebut. */}
              <span className="sr-only">{now ? " — tingkat Anda sekarang" : done ? " — sudah dilewati" : " — belum"}</span>
            </span>
            {rungMeaning[rung] && (
              <span className="mt-0.5 block text-xs font-normal leading-tight text-umkm-subtle">
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
        <circle cx="26" cy="26" r="22" fill="none" className="stroke-umkm-line" strokeWidth="6" />
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
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-umkm-ink">
        {value}/{target}
      </span>
    </div>
  );
}

const dotClass = {
  success: "bg-[#1fcb8f] text-white",
  attention: "bg-[#f5c453] text-umkm-warning-strong",
  neutral: "bg-umkm-line-strong text-white",
} as const;

const barClass = { A: "bg-[#1fcb8f]", B: "bg-[#74e3b9]", C: "bg-umkm-sky", D: "bg-umkm-brand-line" } as const;
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
        <PageHeader title="Langkah usaha saya" description="Semua dinilai otomatis dari catatan dan dokumen Anda." icon={ShieldCheck} />
        <p className="rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft px-4 py-3 text-xs text-umkm-warning">
          {problem}{" "}
          <button type="button" onClick={() => void load()} className="-mx-1.5 inline-flex min-h-11 items-center rounded-lg px-1.5 font-bold underline">
            Coba lagi
          </button>
        </p>
      </DashboardPage>
    );
  }

  if (!data) {
    return (
      <DashboardPage width="compact">
        <PageHeader title="Langkah usaha saya" description="Semua dinilai otomatis dari catatan dan dokumen Anda." icon={ShieldCheck} />
        <p className="flex items-center gap-2 px-1 py-6 text-xs text-umkm-subtle">
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
        description="Semua dinilai otomatis dari catatan dan dokumen Anda — tidak ada yang perlu diklaim."
        icon={ShieldCheck}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-umkm-line bg-white px-3 text-xs font-bold text-umkm-muted hover:bg-umkm-surface-muted"
          >
            <RefreshCcw size={14} /> Muat ulang
          </button>
        }
      />

      {/* ── Kartu tingkat ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="tingkat-judul"
        className="rounded-2xl bg-gradient-to-br from-[#d3f5e7] to-umkm-brand-tint p-5"
      >
        <h2 id="tingkat-judul" className="text-[11px] font-bold uppercase tracking-[.04em] text-umkm-muted">
          Tingkat kesiapan usaha Anda
        </h2>
        <p className="mt-0.5 text-[34px] font-bold leading-tight tracking-tight text-umkm-ink">
          {data.levelName}
        </p>
        <p className="mb-4 text-sm text-umkm-ink-soft">{data.levelMeaning}</p>

        <Ladder level={data.level} />

        {data.step && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-umkm-ink">
                Langkah paling berdampak: {data.step.title}
              </p>
              <p className="mt-0.5 text-xs text-umkm-muted">{data.step.headline}</p>
            </div>
            {data.step.action && (
              <Link
                href={data.step.action.href}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#3ee6a8] px-4 text-xs font-bold text-umkm-ink"
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
            className="rounded-2xl border border-umkm-line-strong bg-white p-5"
          >
            <h3 id={`pilar-${pillar.id}`} className="flex flex-wrap items-center gap-x-2 text-[15px] font-bold text-umkm-ink">
              <span aria-hidden>{pillarIcon[pillar.id]}</span> {pillar.title}
              <span className="text-[11.5px] font-normal text-umkm-muted">— {pillar.tag}</span>
            </h3>
            <div
              role="progressbar"
              aria-labelledby={`pilar-${pillar.id}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pillar.progress * 100)}
              className="my-3 h-2 overflow-hidden rounded-full bg-umkm-line"
            >
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
                    className="flex items-start gap-2.5 border-t border-umkm-line py-2.5 text-[13.5px] first:border-t-0"
                  >
                    {isHabit ? (
                      <HabitRing
                        value={Number(component.displayValue) || 0}
                        target={component.targetNext ?? 0}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-xs ${dotClass[component.tone]}`}
                      >
                        {component.tone === "success" ? "✓" : component.tone === "attention" ? "!" : ""}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <b className="font-bold text-umkm-ink">{component.title}</b>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-umkm-muted">
                        {component.hint}
                      </span>
                    </span>
                    {component.action && (
                      <Link
                        href={component.action.href}
                        className="-my-2.5 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-[12.5px] font-bold text-umkm-brand hover:bg-umkm-brand-soft"
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
      <section className="rounded-xl border border-umkm-line bg-umkm-surface-muted px-4 py-3 text-[12.5px] leading-relaxed text-umkm-muted">
        <b className="text-umkm-ink-soft">Tentang penilaian ini.</b> {data.disclaimer} Aturannya terbuka
        (versi {data.formulaVersion}).
        <span className="mt-2 block">
          <Link href="/umkm/kesiapan/metodologi" className="inline-flex min-h-11 items-center font-bold text-umkm-brand">
            Lihat cara kami menghitung →
          </Link>
        </span>
      </section>
    </DashboardPage>
  );
}
