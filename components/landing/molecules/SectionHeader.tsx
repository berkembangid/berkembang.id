type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  theme?: "light" | "dark";
  className?: string;
};

export function SectionHeader({ eyebrow, title, description, align = "left", theme = "light", className = "" }: SectionHeaderProps) {
  const centered = align === "center";
  return (
    <header className={`${centered ? "mx-auto max-w-3xl text-center" : ""} ${className}`}>
      <p className={`eyebrow ${theme === "dark" ? "is-light" : ""}`}>{eyebrow}</p>
      <h2 className={`section-title mt-4 text-balance ${theme === "dark" ? "text-white" : ""} ${centered ? "mx-auto" : ""}`}>{title}</h2>
      {description ? <p className={`${theme === "dark" ? "text-white/60" : "section-copy"} mt-5 text-pretty ${centered ? "mx-auto max-w-2xl" : ""}`}>{description}</p> : null}
    </header>
  );
}
