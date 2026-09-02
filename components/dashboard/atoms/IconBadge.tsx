import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "attention" | "neutral";

const tones: Record<Tone, string> = {
  brand: "bg-[#eef8fd] text-[#0f73a3]",
  success: "bg-[#edfbf5] text-[#0b7a55]",
  attention: "bg-[#fff4dc] text-[#8a5300]",
  neutral: "bg-[#f3f6f9] text-[#4a6280]",
};

export function IconBadge({ icon: Icon, tone = "brand", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tones[tone], className)}><Icon size={17} /></span>;
}
