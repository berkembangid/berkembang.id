import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "attention" | "error";

const presentation = {
  success: { Icon: CheckCircle2, className: "border-umkm-success-line bg-umkm-success-soft text-umkm-success" },
  info: { Icon: Info, className: "border-umkm-brand-line bg-umkm-brand-soft text-umkm-brand-deep" },
  attention: { Icon: TriangleAlert, className: "border-[#f5c453] bg-umkm-warning-soft text-umkm-warning-strong" },
  error: { Icon: AlertCircle, className: "border-umkm-danger-line bg-umkm-danger-soft text-umkm-danger-strong" },
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
