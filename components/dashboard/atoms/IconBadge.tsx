import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "attention" | "neutral";

const tones: Record<Tone, string> = {
  brand: "bg-umkm-brand-soft text-umkm-brand-hover",
  success: "bg-umkm-success-soft text-umkm-success",
  attention: "bg-umkm-warning-soft text-[#8a5300]",
  neutral: "bg-umkm-surface-muted text-umkm-muted",
};

export function IconBadge({ icon: Icon, tone = "brand", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tones[tone], className)}><Icon size={17} /></span>;
}
