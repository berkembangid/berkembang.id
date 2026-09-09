"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Konfirmasi sebagai janji, bukan sebagai keadaan yang harus diurus tiap layar.
 *
 * KENAPA MENGGANTI `window.confirm`.
 *
 * Tiga tempat di aplikasi ini memanggil `window.confirm` dan satu memanggil
 * `window.prompt`. Keduanya membawa tiga masalah sekaligus:
 *
 *   - Kotaknya milik peramban, jadi ia tidak bisa menjelaskan AKIBAT. « Cabut
 *     akses ini sekarang? » tidak menyebut siapa yang kehilangan akses ke apa,
 *     padahal justru itu yang perlu dibaca sebelum menekan Ya.
 *   - `window.prompt` mengembalikan teks tanpa aturan. Alasan pembatalan
 *     transaksi wajib minimal tiga huruf, dan satu-satunya tempat aturan itu
 *     ditegakkan sekarang adalah setelah permintaan dikirim dan ditolak.
 *   - Keduanya memblokir utas utama dan tidak bisa disentuh gaya apa pun; di
 *     ponsel ia muncul sebagai kotak sistem yang terlihat seperti peringatan
 *     peramban, bukan bagian dari aplikasi.
 *
 * Bentuknya sengaja tetap seperti `window.confirm` -- satu pemanggilan yang
 * ditunggu, bukan sepasang state dan callback -- supaya tempat pemanggilnya
 * tetap terbaca sebagai satu alur:
 *
 *     if (!(await confirm({ ... }))) return;
 *     await hapus();
 */

export type ConfirmTone = "default" | "danger"

export type ConfirmOptions = {
  title: string
  /** Akibatnya, bukan mekanismenya. Inilah kalimat yang benar-benar dibaca. */
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

export type ConfirmWithReasonOptions = ConfirmOptions & {
  reasonLabel: string
  reasonPlaceholder?: string
  /** Riwayat yang menyimpan alasan « a » sama saja dengan tidak menyimpan apa pun. */
  minReasonLength?: number
}

type Pending =
  | { kind: "plain"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "reason"; options: ConfirmWithReasonOptions; resolve: (value: string | null) => void }

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  confirmWithReason: (options: ConfirmWithReasonOptions) => Promise<string | null>
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null)

export function useConfirm(): ConfirmContextValue {
  const value = React.useContext(ConfirmContext)
  if (!value) throw new Error("useConfirm dipakai di luar ConfirmProvider")
  return value
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [reason, setReason] = React.useState("")
  const [touched, setTouched] = React.useState(false)

  const value = React.useMemo<ConfirmContextValue>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setReason("")
          setTouched(false)
          setPending({ kind: "plain", options, resolve })
        }),
      confirmWithReason: (options) =>
        new Promise<string | null>((resolve) => {
          setReason("")
          setTouched(false)
          setPending({ kind: "reason", options, resolve })
        }),
    }),
    []
  )

  // Menutup lewat Esc atau tombol Batal harus menghasilkan jawaban yang sama
  // dengan menolak: janji yang tidak pernah selesai akan menggantung pemanggil
  // selamanya, dan tombolnya tinggal berputar tanpa pernah berhenti.
  const settle = (answer: boolean) => {
    if (!pending) return
    if (pending.kind === "plain") pending.resolve(answer)
    else pending.resolve(answer ? reason.trim() : null)
    setPending(null)
  }

  const minimum = pending?.kind === "reason" ? (pending.options.minReasonLength ?? 3) : 0
  const reasonTooShort = pending?.kind === "reason" && reason.trim().length < minimum
  const tone = pending?.options.tone ?? "default"

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        {pending && (
          <AlertDialogContent>
            <AlertDialogTitle>{pending.options.title}</AlertDialogTitle>
            {pending.options.description && (
              <AlertDialogDescription render={<div />}>
                {pending.options.description}
              </AlertDialogDescription>
            )}

            {pending.kind === "reason" && (
              <div className="mt-4">
                <label className="block text-xs font-bold text-foreground" htmlFor="confirm-reason">
                  {pending.options.reasonLabel}
                </label>
                <textarea
                  id="confirm-reason"
                  autoFocus
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={pending.options.reasonPlaceholder}
                  className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                />
                {touched && reasonTooShort && (
                  <p role="alert" className="mt-1.5 text-xs font-semibold text-[var(--tone-warning)]">
                    Tuliskan alasannya minimal {minimum} huruf supaya riwayatnya berguna nanti.
                  </p>
                )}
              </div>
            )}

            <AlertDialogFooter>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-xl text-sm font-bold sm:flex-none sm:px-5"
                onClick={() => settle(false)}
              >
                {pending.options.cancelLabel ?? "Batal"}
              </Button>
              <Button
                variant={tone === "danger" ? "default" : "default"}
                disabled={reasonTooShort}
                className={cn(
                  "min-h-11 flex-1 rounded-xl text-sm font-bold sm:flex-none sm:px-5 transition-all duration-150 cursor-pointer",
                  tone === "danger" &&
                    "!bg-red-600 !text-white hover:!bg-red-700 active:!bg-red-800 active:scale-[0.98] focus-visible:ring-red-400 shadow-sm shadow-red-200"
                )}
                onClick={() => {
                  setTouched(true)
                  if (!reasonTooShort) settle(true)
                }}
              >
                {pending.options.confirmLabel ?? "Lanjutkan"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
