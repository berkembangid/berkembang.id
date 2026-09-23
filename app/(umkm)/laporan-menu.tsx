"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { LAPORAN_SECTIONS, type LaporanSection } from "./umkm-navigation";

/**
 * Menu « Laporan » sebagai pilihan bergambar, bukan tautan langsung.
 *
 * Dipakai di menu samping (desktop) dan bilah bawah (ponsel). Tombol
 * pemicunya dirender oleh pemanggil lewat `children` supaya bentuknya tetap
 * sama dengan tujuan menu lain di tempat itu.
 *
 * Nama kelas warna ditulis utuh di tabel ini: Tailwind hanya melihat kelas
 * yang tertulis lengkap di sumber, bukan yang dirangkai dari potongan.
 */
const TONE: Record<LaporanSection["tone"], { tile: string; icon: string }> = {
  brand: { tile: "border-umkm-brand-line bg-umkm-brand-soft hover:bg-umkm-brand-tint", icon: "text-umkm-brand" },
  success: { tile: "border-umkm-success-line bg-umkm-success-soft hover:brightness-[0.97]", icon: "text-umkm-success" },
  warning: { tile: "border-umkm-warning-line bg-umkm-warning-soft hover:brightness-[0.97]", icon: "text-umkm-warning" },
  neutral: { tile: "border-umkm-line bg-umkm-surface hover:bg-umkm-surface-muted", icon: "text-umkm-ink-soft" },
};

type LaporanMenuProps = {
  children: React.ReactNode;
  triggerClassName: string;
  /** Menu samping membuka ke kanan; bilah bawah membuka ke atas. */
  side: "right" | "top";
  active: boolean;
};

export function LaporanMenu({ children, triggerClassName, side, active }: LaporanMenuProps) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-current={active ? "page" : undefined} className={triggerClassName}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} align={side === "right" ? "start" : "center"} sideOffset={10} collisionPadding={12} className="z-[110]">
          <Popover.Popup
            style={{ width: "min(94vw, 460px)" }}
            className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_18px_48px_rgba(27,42,58,.18)] outline-none duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <Popover.Title className="text-base font-bold text-umkm-ink">Laporan</Popover.Title>
            <Popover.Description className="mt-0.5 text-xs text-umkm-subtle">Pilih yang ingin Anda lihat.</Popover.Description>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {LAPORAN_SECTIONS.map((section) => {
                const tone = TONE[section.tone];
                return (
                  <Popover.Close
                    key={section.href}
                    nativeButton={false}
                    render={<Link href={section.href} />}
                    title={section.description}
                    className={`flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition ${tone.tile}`}
                  >
                    <section.Icon size={30} strokeWidth={1.6} aria-hidden className={tone.icon} />
                    <span className="text-xs font-bold leading-tight text-umkm-ink">{section.label}</span>
                  </Popover.Close>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
