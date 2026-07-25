import type { ReactNode } from "react";

export function Badge({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="hero-badge">
      {icon ? <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#141a34]/10 text-[#141a34]" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
