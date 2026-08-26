const SUFFIX_MULTIPLIER = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
} as const;

function parseBaseNumber(rawValue: string, hasSuffix: boolean) {
  if (/^\d{1,3}(?:\.\d{3})+$/.test(rawValue) && !hasSuffix) {
    return Number(rawValue.replaceAll(".", ""));
  }

  if (/^\d{1,3}(?:,\d{3})+$/.test(rawValue) && !hasSuffix) {
    return Number(rawValue.replaceAll(",", ""));
  }

  const decimalValue = hasSuffix
    ? rawValue.replace(",", ".")
    : rawValue;
  return Number(decimalValue);
}

export function parseIndonesianNominal(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^rp\.?\s*/, "")
    .replace(/\s+/g, " ");
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?$/);
  if (!match) return null;

  const suffix = match[2] as keyof typeof SUFFIX_MULTIPLIER | undefined;
  const base = parseBaseNumber(match[1], Boolean(suffix));
  const amount = base * (suffix ? SUFFIX_MULTIPLIER[suffix] : 1);

  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount);
  return Number.isSafeInteger(rounded) ? rounded : null;
}
