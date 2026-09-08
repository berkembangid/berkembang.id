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

/**
 * Kerangka kolom rupiah: bingkai, awalan "Rp", dan kolom angkanya.
 *
 * Ada dua varian di berkas ini, dan sebelumnya keduanya menyalin markup yang
 * sama dengan jarak yang berbeda. Akibatnya kolom rupiah tampil berbeda
 * tergantung di layar mana ia muncul, dan memperbaiki satu tidak memperbaiki
 * yang lain.
 *
 * Tiga hal yang diperbaiki di sini:
 *
 *   1. Awalannya `shrink-0`. Sebagai item flex tanpa itu, ia bisa diperas oleh
 *      kolom angka yang meminta lebar penuh, lalu terpotong `overflow-hidden`.
 *   2. Awalannya berlatar dan berbatas, bukan sekadar teks yang menempel pada
 *      angka. Tanpa pemisah, "Rp" dan angkanya terbaca sebagai satu gumpalan,
 *      dan karet teks di posisi awal duduk tepat di sebelah hurufnya.
 *   3. Kolom angkanya `min-w-0`. Di baris yang sempit, yang mengalah adalah
 *      angkanya -- yang tetap bisa digulir -- bukan awalan yang hilang.
 */
function MoneyField({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-stretch overflow-hidden rounded-xl border border-[#d5dfe9] bg-white transition-colors focus-within:border-[#0b5f86]">
      <span
        aria-hidden
        className="flex shrink-0 items-center border-r border-[#e3e9f0] bg-[#f5f7fb] px-3 text-sm font-bold text-[#6e859e]"
      >
        Rp
      </span>
      {children}
    </div>
  );
}

const fieldClass =
  "min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-medium tabular-nums text-[#1b2a3a] outline-none";

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
      <div className="mt-1.5">
        <MoneyField>
          <input
            id={id}
            inputMode="numeric"
            autoFocus={autoFocus}
            value={formatMoneyInput(value)}
            onChange={(event) => onChange(parseMoneyInput(event.target.value))}
            placeholder={placeholder}
            aria-describedby={helper ? `${id}-helper` : undefined}
            className={fieldClass}
          />
        </MoneyField>
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
    <MoneyField>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={formatMoneyInput(value)}
        onChange={(event) => onChange(parseMoneyInput(event.target.value))}
        placeholder={placeholder}
        className={fieldClass}
      />
    </MoneyField>
  );
}
