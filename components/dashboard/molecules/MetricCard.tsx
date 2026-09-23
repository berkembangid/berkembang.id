import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconBadge } from "../atoms/IconBadge";

export function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: "brand" | "success" | "attention" | "neutral";
  className?: string;
}) {
  return (
    <article className={cn("flex min-h-32 flex-col rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]", className)}>
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-umkm-subtle">{label}</p><IconBadge icon={icon} tone={tone} className="size-8 rounded-lg" /></div>
      <p className="mt-auto pt-4 text-xl font-semibold tracking-[-0.035em] text-umkm-ink tabular-nums md:text-2xl">{value}</p>
      {helper && <p className="mt-1 text-xs text-umkm-subtle">{helper}</p>}
    </article>
  );
}
