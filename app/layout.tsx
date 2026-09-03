import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BERKEMBANG.ID — Catat Lewat Suara, Tumbuh dengan Data",
  description:
    "Platform pendamping UMKM berbasis AI. Catat transaksi dengan suara, pahami kondisi usaha, dan bangun kesiapan untuk tumbuh.",
  manifest: "/manifest.json",
  applicationName: "BERKEMBANG.ID",
  keywords: ["UMKM", "catat keuangan", "naik kelas", "pembiayaan", "AI"],
  authors: [{ name: "BERKEMBANG.ID" }],
  icons: {
    icon: "/logo/favicon.png",
    shortcut: "/logo/favicon.png",
    apple: "/logo/favicon.png",
  },
  openGraph: {
    title: "BERKEMBANG.ID",
    description: "Platform AI pendamping usaha untuk UMKM Indonesia.",
    type: "website",
    locale: "id_ID",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f73a3",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-[#fbf8ff] text-[#141a34] antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
