import Link from "next/link";
import { Activity, ArrowRight, Building2, CalendarClock, FileCheck2, MapPin, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Potongan tampilan yang dipakai bersama oleh Temukan, Permintaan, dan Dosir.
 *
 * Ketiganya membicarakan usaha yang sama dari tiga sisi -- sebelum diminta,
 * sedang diminta, sudah dibuka -- jadi kode, tingkat, dan wilayahnya harus
 * terbaca sama persis. Petugas yang melihat "UMKM-65DEC6BF · Tembaga" di
 * Temukan harus mengenali kartu yang sama di Permintaan tanpa berpikir.
 */

export type BusinessSummary = {
  candidateCode: string;
  sector: string;
  generalLocation: string;
  readinessLevel: string;
  recordingAgeBand: string;
  recordingActivity: string;
};

/**
 * Warna tingkat mengikuti logam yang dinamainya, bukan hijau untuk semua.
 * Dulu "Tembaga" dan "Emas" tampil sebagai lencana hijau yang sama, jadi
 * perbedaan tingkat -- satu-satunya pembeda antarkartu -- harus dibaca huruf
 * demi huruf.
 */
const tierStyles: Record<string, string> = {
  mulai: "border-[#c8d3de] bg-[#f3f6f9] text-[#34496a]",
  tembaga: "border-[#f0c3a2] bg-[#fdf1e8] text-[#8a3f10]",
  perak: "border-[#c3cedb] bg-[#eef2f6] text-[#3b4d63]",
  emas: "border-[#f5c453] bg-[#fff6dc] text-[#6b4700]",
};
const unknownTier = "border-dashed border-[#c8d3de] bg-white text-[#6e859e]";

export function TierBadge({ level }: { level: string }) {
  const style = tierStyles[level.trim().toLowerCase()] ?? unknownTier;
  return <span title="Tingkat kesiapan" className={`inline-flex min-h-6 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-bold ${style}`}>{level}</span>;
}

/** Kepala kartu: ikon, kode, lencana tingkat, dan bidang. Wilayah ada di `BusinessFacts`. */
export function BusinessHeading({ title, code, summary, as: Heading = "h2" }: {
  title: string; code?: string; summary: BusinessSummary | null; as?: "h2" | "h3";
}) {
  return <div className="flex min-w-0 items-start gap-3">
    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><Building2 size={20} /></span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="truncate text-base font-bold tracking-[-0.01em] text-[#1b2a3a]">{title}</Heading>
        {summary && <TierBadge level={summary.readinessLevel} />}
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[#6e859e]">
        <span>{summary ? summary.sector : "Ringkasan usaha belum tersedia"}</span>
        {code && code !== title && <span className="font-mono text-[11px] text-[#8aa0b6]">{code}</span>}
      </p>
    </div>
  </div>;
}

const factTones = {
  neutral: "text-[#8aa0b6]",
  good: "text-[#12906a]",
  warn: "text-[#c27c0e]",
} as const;

export type FactTone = keyof typeof factTones;

export function Fact({ Icon, label, value, tone = "neutral" }: { Icon: LucideIcon; label: string; value: string; tone?: FactTone }) {
  return <div className="rounded-xl bg-[#f6f8fb] px-3 py-2.5">
    <dt className="text-[11px] text-[#6e859e]">{label}</dt>
    <dd className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#1b2a3a]"><Icon size={13} className={`shrink-0 ${factTones[tone]}`} aria-hidden />{value}</dd>
  </div>;
}

export function activityTone(activity: string): FactTone {
  if (/^rutin/i.test(activity)) return "good";
  if (/mulai rutin/i.test(activity)) return "good";
  if (/jarang|belum/i.test(activity)) return "warn";
  return "neutral";
}

/** Wilayah, umur catatan, dan kebiasaan mencatat. Tingkat kesiapan ada di lencana kepala kartu. */
export function BusinessFacts({ summary }: { summary: BusinessSummary }) {
  return <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
    <div className="col-span-2 sm:col-span-1"><Fact Icon={MapPin} label="Wilayah" value={summary.generalLocation} /></div>
    <Fact Icon={CalendarClock} label="Umur catatan" value={summary.recordingAgeBand} tone={summary.recordingAgeBand === "Belum ada catatan" ? "warn" : "neutral"} />
    <Fact Icon={Activity} label="Kebiasaan mencatat" value={summary.recordingActivity} tone={activityTone(summary.recordingActivity)} />
  </dl>;
}

export const DAY_MS = 86_400_000;

export function formatDate(value: string | null, fallback = "Tanpa batas") {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : fallback;
}

/** "3 hari lalu", "hari ini" -- untuk kapan diajukan. */
export function relativeDays(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS);
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

export function SearchBox({ value, onChange, placeholder = "Cari kode, bidang, atau wilayah" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="relative block lg:w-72">
    <span className="sr-only">Cari</span>
    <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8aa0b6]" />
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-10 w-full rounded-xl border border-[#d5dee8] bg-[#f8fafc] pl-10 pr-9 text-sm text-[#1b2a3a] outline-none placeholder:text-[#8aa0b6] focus:border-[#0b5f86] focus:bg-white focus:ring-2 focus:ring-[#0b5f86]/15" />
    {value && <button type="button" aria-label="Kosongkan pencarian" onClick={() => onChange("")} className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-[#6e859e] hover:bg-[#eef2f6]"><X size={13} /></button>}
  </label>;
}

export function CardSkeleton() {
  return <div className="animate-pulse rounded-2xl border border-[#e3e9f0] bg-white p-5">
    <div className="flex items-center gap-3"><div className="size-11 rounded-xl bg-[#eef2f6]" /><div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-[#eef2f6]" /><div className="h-3 w-24 rounded bg-[#f3f6f9]" /></div></div>
    <div className="mt-4 grid grid-cols-3 gap-2.5">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-14 rounded-xl bg-[#f6f8fb]" />)}</div>
    <div className="mt-4 h-16 rounded-xl bg-[#f6f8fb]" />
  </div>;
}

export function Empty({ title, description, action, onReset }: { title: string; description: string; action?: { label: string; href: string }; onReset?: () => void }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#c8d3de] bg-white px-6 py-14 text-center">
    <span className="grid size-12 place-items-center rounded-2xl bg-[#eef8fd] text-[#0f73a3]"><FileCheck2 size={20} /></span>
    <h2 className="mt-3 text-sm font-bold text-[#1b2a3a]">{title}</h2>
    <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#6e859e]">{description}</p>
    {action && <Link href={action.href} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white">{action.label}<ArrowRight size={13} /></Link>}
    {onReset && <button type="button" onClick={onReset} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#d5dee8] px-4 text-xs font-bold text-[#0b5f86]">Tampilkan semua</button>}
  </div>;
}
