import { cn } from "@/lib/utils";

export function DashboardPage({ children, width = "wide", className }: { children: React.ReactNode; width?: "compact" | "wide"; className?: string }) {
  return <main className={cn("mx-auto w-full space-y-6 px-4 py-5 pb-[132px] md:px-7 md:py-7 md:pb-10", width === "compact" ? "max-w-4xl" : "max-w-[1440px]", className)}>{children}</main>;
}

export function DashboardPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-umkm-line bg-white shadow-[0_8px_30px_rgba(27,42,58,.04)]", className)}>{children}</section>;
}

export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-umkm-line-soft px-4 py-4 md:px-5"><div><h2 className="text-sm font-bold text-umkm-ink">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">{description}</p>}</div>{action}</div>;
}
