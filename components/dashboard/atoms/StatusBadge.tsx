import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "attention" | "neutral" | "alert";

const tones: Record<Tone, string> = {
  success: "border-umkm-success-line bg-umkm-success-soft text-umkm-success",
  info: "border-umkm-brand-line bg-umkm-brand-soft text-umkm-brand-deep",
  attention: "border-[#f5c453] bg-umkm-warning-soft text-umkm-warning-strong",
  neutral: "border-umkm-line-strong bg-umkm-surface-muted text-umkm-ink-soft",
  alert: "border-umkm-danger-line bg-umkm-danger-soft text-umkm-danger-strong",
};

export function StatusBadge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-bold", tones[tone], className)}>{children}</span>;
}
