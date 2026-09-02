import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "attention" | "error";

const presentation = {
  success: { Icon: CheckCircle2, className: "border-[#a9ebd0] bg-[#edfbf5] text-[#0a5c42]" },
  info: { Icon: Info, className: "border-[#addcf4] bg-[#eef8fd] text-[#0a4763]" },
  attention: { Icon: TriangleAlert, className: "border-[#f5c453] bg-[#fff4dc] text-[#5c3700]" },
  error: { Icon: AlertCircle, className: "border-[#f4b0a8] bg-[#feecea] text-[#8a1c12]" },
} satisfies Record<Tone, { Icon: typeof Info; className: string }>;

export function FeedbackBanner({ children, tone = "info", title, className, live = false }: { children: React.ReactNode; tone?: Tone; title?: string; className?: string; live?: boolean }) {
  const { Icon, className: toneClass } = presentation[tone];
  return (
    <div role={tone === "error" ? "alert" : live ? "status" : undefined} aria-live={live ? "polite" : undefined} className={cn("flex items-start gap-3 rounded-2xl border p-4 text-xs leading-relaxed", toneClass, className)}>
      <Icon className="mt-0.5 shrink-0" size={17} />
      <div>{title && <p className="mb-1 font-bold">{title}</p>}<div>{children}</div></div>
    </div>
  );
}
