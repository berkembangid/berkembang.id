import type { LucideIcon } from "lucide-react";
import { IconBadge } from "../atoms/IconBadge";

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconBadge icon={icon} className="mt-0.5" />}
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.025em] text-[#1b2a3a] md:text-2xl">{title}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#6e859e] md:text-sm">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
