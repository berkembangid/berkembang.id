import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { IconBadge } from "../atoms/IconBadge";

export function EmptyState({ icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-umkm-line-strong bg-white px-6 py-10 text-center">
      <IconBadge icon={icon} />
      <h2 className="mt-3 text-sm font-bold text-umkm-ink">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-umkm-subtle">{description}</p>
      {action && <Link href={action.href} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white">{action.label}</Link>}
    </div>
  );
}
