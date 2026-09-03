import { cn } from "@/lib/utils";

export type ComparisonDatum = { label: string; primary: number; secondary?: number };

export function ComparisonBarChart({
  data,
  primaryLabel,
  secondaryLabel,
  formatValue = (value) => value.toLocaleString("id-ID"),
  className,
}: {
  data: ComparisonDatum[];
  primaryLabel: string;
  secondaryLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const maximum = Math.max(...data.flatMap((item) => [item.primary, item.secondary ?? 0]), 1);
  return (
    <figure className={cn("w-full", className)}>
      <div className="mb-5 flex flex-wrap gap-4 text-[10px] font-medium text-[#6e859e]">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[#1590c7]" />{primaryLabel}</span>
        {secondaryLabel && <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[#c8d3de]" />{secondaryLabel}</span>}
      </div>
      <div className="flex h-48 items-end gap-2 border-b border-[#e3e9f0] px-1" role="img" aria-label={`Grafik perbandingan ${primaryLabel}${secondaryLabel ? ` dan ${secondaryLabel}` : ""}`}>
        {data.map((item) => (
          <div key={item.label} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${item.label}: ${primaryLabel} ${formatValue(item.primary)}${secondaryLabel ? `, ${secondaryLabel} ${formatValue(item.secondary ?? 0)}` : ""}`}>
            <span className="w-full max-w-5 rounded-t bg-[#1590c7] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(item.primary ? 6 : 1, item.primary / maximum * 100)}%` }} />
            {secondaryLabel && <span className="w-full max-w-5 rounded-t bg-[#c8d3de] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(item.secondary ? 6 : 1, (item.secondary ?? 0) / maximum * 100)}%` }} />}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 grid text-center text-[9px] text-[#9fb0c2]" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((item) => <span key={item.label} className="truncate">{item.label}</span>)}</figcaption>
      <ul className="sr-only">{data.map((item) => <li key={item.label}>{item.label}: {primaryLabel} {formatValue(item.primary)}{secondaryLabel ? `, ${secondaryLabel} ${formatValue(item.secondary ?? 0)}` : ""}</li>)}</ul>
    </figure>
  );
}
