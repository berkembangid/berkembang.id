import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/ui/confirm";

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
  // `data-scroll-behavior` diminta Next 16 karena `html { scroll-behavior:
  // smooth }` ada di globals.css. Tanpa penanda ini, perpindahan rute ikut
  // dianimasikan dan halaman baru terlihat menggulir dari posisi halaman lama.
  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-[#fbf8ff] text-[#141a34] antialiased" suppressHydrationWarning>
        {/*
          Dua hal yang dipasang sekali di akar, dan alasannya sama: keduanya
          harus tersedia di setiap layar tanpa layar itu perlu menyiapkan
          apa pun. Toast dipasang di sini supaya satu antrean berlaku untuk
          seluruh aplikasi -- dua Toaster berarti dua tumpukan yang saling
          menutupi. `ConfirmProvider` dipasang di sini supaya `useConfirm()`
          bisa dipanggil dari mana saja; `children` tetap dirender di server,
          karena ia diteruskan sebagai prop, bukan diimpor komponen klien.
        */}
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster
          position="top-center"
          closeButton
          visibleToasts={3}
          /* Bilah menu bawah menempati tepi bawah layar ponsel, jadi toast
             tidak boleh muncul di sana. Jarak atasnya melewati header. */
          offset={{ top: 84 }}
          mobileOffset={{ top: 82, left: 12, right: 12 }}
        />
      </body>
    </html>
  );
}
