import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BERKEMBANG.ID — Catat Untungmu, Naik Kelas",
  description:
    "Platform pendamping UMKM berbasis AI. Catat transaksi dengan suara, pantau untung harian, dan siapkan diri untuk naik kelas pembiayaan.",
  manifest: "/manifest.json",
  applicationName: "BERKEMBANG.ID",
  keywords: ["UMKM", "catat keuangan", "naik kelas", "pembiayaan", "AI"],
  authors: [{ name: "Tim P0160 — BERKEMBANG.ID" }],
  icons: {
    icon: "/logo/favicon.png",
    shortcut: "/logo/favicon.png",
    apple: "/logo/favicon.png",
  },
  openGraph: {
    title: "BERKEMBANG.ID",
    description: "Platform Generatif AI Pendamping Journey UMKM Mikro Naik Kelas",
    type: "website",
    locale: "id_ID",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#001b85",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#fbf8ff] text-[#141a34] antialiased">
        {children}
      </body>
    </html>
  );
}
