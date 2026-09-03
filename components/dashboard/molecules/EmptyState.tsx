import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { IconBadge } from "../atoms/IconBadge";

export function EmptyState({ icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#c8d3de] bg-white px-6 py-10 text-center">
      <IconBadge icon={icon} />
      <h2 className="mt-3 text-sm font-bold text-[#1b2a3a]">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#6e859e]">{description}</p>
      {action && <Link href={action.href} className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white">{action.label}</Link>}
    </div>
  );
}
