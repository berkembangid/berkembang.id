"use client";

/**
 * Input rupiah.
 *
 * Kolom angka polos membuat "78" bisa berarti 78 rupiah, 78 ribu, atau 78
 * butir. Kolom ini menghilangkan tebakan itu: awalan "Rp" selalu terlihat,
 * pemisah ribuan muncul saat mengetik, dan nilainya boleh diucapkan singkat
 * ("78rb", "1,2jt") seperti kebiasaan bicara sehari-hari.
 *
 * Nilai keluar selalu berupa bilangan bulat rupiah.
 */

import { useId } from "react";
import { parseIndonesianNominal } from "@/modules/ledger/indonesian-money";

export type MoneyInputProps = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  helper?: string;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
};

/**
 * Menerima angka polos maupun ucapan singkat. "78" tetap 78 supaya pengguna
 * yang mengetik nominal penuh tidak dikoreksi diam-diam; "78rb" menjadi 78.000.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (/^[\d.\s]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    return digits === "" ? null : Number(digits);
  }
  const spoken = parseIndonesianNominal(text);
  return spoken === null || spoken === undefined ? null : spoken;
}

export function formatMoneyInput(value: number | null): string {
  return value === null ? "" : value.toLocaleString("id-ID");
}

export function MoneyInput({
  label,
  value,
  onChange,
  helper,
  placeholder = "0",
  autoFocus,
  compact,
}: MoneyInputProps) {
  const id = useId();
  return (
    <div className={compact ? "" : "block"}>
      <label htmlFor={id} className="block text-xs font-bold text-[#1b2a3a]">
        {label}
      </label>
      <div className="mt-1.5 flex min-h-11 items-center overflow-hidden rounded-xl border border-[#d5dfe9] bg-white focus-within:border-[#0b5f86]">
        <span aria-hidden className="px-3 text-sm font-bold text-[#6e859e]">
          Rp
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoFocus={autoFocus}
          value={formatMoneyInput(value)}
          onChange={(event) => onChange(parseMoneyInput(event.target.value))}
          placeholder={placeholder}
          aria-describedby={helper ? `${id}-helper` : undefined}
          className="min-h-11 w-full border-0 bg-transparent pr-3 text-sm font-medium tabular-nums text-[#1b2a3a] outline-none"
        />
      </div>
      {helper && (
        <p id={`${id}-helper`} className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
          {helper}
        </p>
      )}
    </div>
  );
}

/** Versi tanpa label untuk dipakai di dalam baris daftar. */
export function InlineMoneyInput({
  value,
  onChange,
  placeholder = "0",
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex min-h-11 items-center overflow-hidden rounded-xl border border-[#d5dfe9] bg-white focus-within:border-[#0b5f86]">
      <span aria-hidden className="pl-3 text-sm font-bold text-[#6e859e]">
        Rp
      </span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={formatMoneyInput(value)}
        onChange={(event) => onChange(parseMoneyInput(event.target.value))}
        placeholder={placeholder}
        className="min-h-11 w-full border-0 bg-transparent px-2 text-sm font-medium tabular-nums text-[#1b2a3a] outline-none"
      />
    </div>
  );
}
