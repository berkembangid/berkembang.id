"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !bg-white !text-slate-900 !border-slate-200 !shadow-xl !p-4 !rounded-2xl",
          title: "!text-slate-900 !font-bold !text-sm",
          description: "!text-slate-600 !font-normal !text-xs !mt-1 !leading-relaxed",
          actionButton: "!bg-[#001b85] !text-white !font-semibold !text-xs !rounded-lg",
          cancelButton: "!bg-slate-100 !text-slate-600 !font-semibold !text-xs !rounded-lg",
          closeButton: "!bg-white !text-slate-500 hover:!text-slate-900 !border-slate-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
