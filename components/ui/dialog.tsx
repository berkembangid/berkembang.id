"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { useConfirm } from "@/components/ui/confirm"
import { cn } from "@/lib/utils"

/**
 * Satu dialog formulir untuk seluruh Ruang Usaha.
 *
 * Sebelumnya setiap layar merakit `<div role="dialog">` sendiri: tanpa
 * perangkap fokus (Tab berjalan ke halaman di belakangnya), tanpa Esc, tanpa
 * judul yang terhubung, dan tombol tutupnya ikon 18px tanpa nama. Empat
 * dialog, empat versi kekurangan yang sama.
 *
 * Di ponsel ia lembar bawah, di layar lebar kotak di tengah -- bentuk yang
 * sudah dipakai dialog lama, jadi tampilannya tidak berubah.
 *
 * Mengetuk latar TIDAK menutupnya. Dialog ini berisi isian; satu ketukan
 * meleset di luar kotak tidak boleh membuang angka yang sudah diketik. Juga
 * karena `confirm()` bisa terbuka di atasnya, dan ketukan di dalam kotak
 * konfirmasi terhitung "di luar" dialog ini.
 */
export function FormDialog({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  /** Label kecil di atas judul, misalnya « Tutup kas ». */
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  // `confirm()` terbuka di lapisan tersendiri di atas dialog ini. Selama itu
  // perangkap fokus di sini dilepas, supaya fokus bisa pindah ke tombol
  // konfirmasi; Esc juga tidak ikut menutup dialog di bawahnya.
  const { isOpen: confirming } = useConfirm()
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => { if (!next && !confirming) onClose() }}
      modal={!confirming}
      disablePointerDismissal
    >
      <DialogPrimitive.Portal>
        {/* Satu lapis di bawah `--z-dialog`: kotak konfirmasi yang terbuka di
            atasnya harus menggelapkan lembar ini juga, bukan menyelip di
            belakangnya. Masih di atas menu dan popover (110). */}
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-[calc(var(--z-dialog)-2)] bg-umkm-scrim duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-[calc(var(--z-dialog)-1)] max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] outline-none",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[88vh] md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:p-6",
            "duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wide text-umkm-brand">{eyebrow}</p>}
              <DialogPrimitive.Title className="mt-1 text-lg font-bold text-umkm-ink">{title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Tutup"
              className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-lg text-umkm-subtle hover:bg-umkm-surface-muted hover:text-umkm-ink"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="mt-2 text-xs leading-relaxed text-umkm-subtle">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
