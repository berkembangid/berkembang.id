import Link from "next/link";
import type { ReactNode } from "react";

type ActionLinkProps = {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary";
};

export function ActionLink({ children, href, variant = "primary" }: ActionLinkProps) {
  return (
    <Link href={href} className={`${variant === "primary" ? "button-hero-primary" : "button-hero-secondary"} focus-ring`}>
      {children}
    </Link>
  );
}
