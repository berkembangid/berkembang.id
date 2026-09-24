"use client";

import { useEffect, useId, useState } from "react";
import { getContactDirectoryClient } from "@/modules/ledger/ledger-client";
import type { ContactDirectory } from "@/modules/ledger/contact-balances";

/**
 * Kolom nama pelanggan atau pemasok yang menyarankan nama yang sudah ada.
 *
 * Utang piutang dihitung per nama. « Bu Sari » hari ini dan « Sari » minggu
 * depan terhitung dua orang, jadi cara termurah menjaga saldonya tepat adalah
 * menyarankan ejaan yang sudah dipakai SEBELUM ejaan kedua lahir. Nama yang
 * sudah digabung (0113) tidak disarankan lagi -- yang muncul nama tujuannya.
 *
 * Daftarnya dimuat sekali per halaman dan dipakai bersama semua kolom.
 */
let directoryRequest: Promise<ContactDirectory> | null = null;

export function loadContactDirectory(refresh = false): Promise<ContactDirectory> {
  if (!directoryRequest || refresh) {
    directoryRequest = getContactDirectoryClient().catch(() => {
      directoryRequest = null;
      return { names: [], aliases: [] };
    });
  }
  return directoryRequest;
}

export function ContactNameInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [directory, setDirectory] = useState<ContactDirectory>({ names: [], aliases: [] });

  useEffect(() => {
    let cancelled = false;
    void loadContactDirectory().then((result) => {
      if (!cancelled) setDirectory(result);
    });
    return () => { cancelled = true; };
  }, []);

  // Nama yang diketik ternyata sudah digabung ke nama lain: beri tahu, dan
  // tawarkan ejaan tujuannya dengan satu ketukan.
  const typedKey = value.trim().toLowerCase();
  const mergedInto = typedKey ? directory.aliases.find((alias) => alias.name === typedKey)?.into : undefined;

  return (
    <>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {directory.names.map((name) => <option key={name} value={name} />)}
      </datalist>
      {mergedInto && (
        <button
          type="button"
          onClick={() => onChange(mergedInto)}
          className="mt-1 inline-flex min-h-11 items-center text-left text-xs font-semibold text-umkm-brand underline"
        >
          « {value.trim()} » sudah digabung ke « {mergedInto} ». Pakai nama itu?
        </button>
      )}
    </>
  );
}
