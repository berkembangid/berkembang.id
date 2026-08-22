import Image from "next/image";
import Link from "next/link";

const columns = [
  {
    title: "Produk",
    links: [
      ["Fitur", "#fitur"],
      ["Cara kerja", "#cara-kerja"],
      ["Untuk institusi", "#institusi"],
    ],
  },
  {
    title: "Akses",
    links: [
      ["Mulai sebagai UMKM", "/umkm"],
      ["Portal institusi", "/institusi"],
      ["Masuk", "/auth/login"],
    ],
  },
  {
    title: "Bantuan & Legal",
    links: [
      ["FAQ", "#faq"],
      ["Syarat & Ketentuan", "/terms"],
      ["Hubungi kami", "mailto:halo@berkembang.id"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#e3e6ef] bg-[#fbf8ff]">
      <div className="landing-container grid gap-10 py-12 sm:grid-cols-[1.2fr_1.8fr] sm:py-16 lg:gap-20">
        <div className="max-w-sm">
          <Link
            href="/"
            className="focus-ring inline-block rounded-lg"
            aria-label="Berkembang.id, halaman utama"
          >
            <Image
              src="/logo/logo berkembang.webp"
              alt="Berkembang.id"
              width={164}
              height={42}
              className="h-8 w-auto"
            />
          </Link>
          <p className="mt-5 text-sm leading-6 text-[#687086]">
            Pendamping usaha berbasis AI untuk membantu UMKM mencatat, memahami, dan menyiapkan langkah pertumbuhan.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#141a34]">
                {column.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {column.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="focus-ring rounded text-sm text-[#687086] transition-colors hover:text-[#001b85]"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="landing-container flex flex-col gap-3 border-t border-[#e3e6ef] py-6 text-xs text-[#848b9d] sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Berkembang.id. Semua hak dilindungi.</p>
        <div className="flex items-center gap-4">
          <Link
            href="/terms"
            className="hover:text-[#001b85] hover:underline transition-colors"
          >
            Syarat &amp; Ketentuan
          </Link>
          <span aria-hidden="true">•</span>
          <p>Teknologi yang tumbuh bersama usaha Indonesia.</p>
        </div>
      </div>
    </footer>
  );
}
