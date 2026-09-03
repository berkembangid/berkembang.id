import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "attention" | "neutral" | "alert";

const tones: Record<Tone, string> = {
  success: "border-[#a9ebd0] bg-[#edfbf5] text-[#0a5c42]",
  info: "border-[#addcf4] bg-[#eef8fd] text-[#0a4763]",
  attention: "border-[#f5c453] bg-[#fff4dc] text-[#5c3700]",
  neutral: "border-[#c8d3de] bg-[#f3f6f9] text-[#34496a]",
  alert: "border-[#f4b0a8] bg-[#feecea] text-[#8a1c12]",
};

export function StatusBadge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 text-[10px] font-bold", tones[tone], className)}>{children}</span>;
}
