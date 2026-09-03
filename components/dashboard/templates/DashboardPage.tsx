import { cn } from "@/lib/utils";

export function DashboardPage({ children, width = "wide", className }: { children: React.ReactNode; width?: "compact" | "wide"; className?: string }) {
  return <main className={cn("mx-auto w-full space-y-6 px-4 py-5 pb-28 md:px-7 md:py-7 md:pb-10", width === "compact" ? "max-w-4xl" : "max-w-[1440px]", className)}>{children}</main>;
}

export function DashboardPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-[#e3e9f0] bg-white shadow-[0_8px_30px_rgba(27,42,58,.04)]", className)}>{children}</section>;
}

export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#eef2f6] px-4 py-4 md:px-5"><div><h2 className="text-sm font-bold text-[#1b2a3a]">{title}</h2>{description && <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">{description}</p>}</div>{action}</div>;
}
