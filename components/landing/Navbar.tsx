"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "#fitur", label: "Produk" },
  { href: "#cara-kerja", label: "Cara Kerja" },
  { href: "#institusi", label: "Untuk Institusi" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className={`landing-nav ${scrolled || open ? "is-solid" : ""}`}>
      <div className="landing-nav-shell landing-container flex h-[72px] items-center justify-between gap-6">
        <Link href="/" aria-label="Berkembang.id, halaman utama" className="focus-ring shrink-0 rounded-lg">
          <Image
            src="/logo/logo berkembang.webp"
            alt="Berkembang.id"
            width={164}
            height={42}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav aria-label="Navigasi utama" className="desktop-nav-pill hidden items-center lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className={`nav-link focus-ring ${link.href === "#fitur" ? "is-active" : ""}`}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/auth/login" className="button-ghost focus-ring">
            Masuk
          </Link>
          <Link href="/umkm" className="button-primary focus-ring">
            Mulai gratis
          </Link>
        </div>

        <button
          type="button"
          className="focus-ring inline-flex size-11 items-center justify-center rounded-full border border-[#dfe3ed] text-[#141a34] lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Tutup navigasi" : "Buka navigasi"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" size={21} /> : <Menu aria-hidden="true" size={21} />}
        </button>
      </div>

      <div id="mobile-navigation" className={`mobile-nav-panel lg:hidden ${open ? "is-open" : ""}`}>
        <nav aria-label="Navigasi seluler" className="landing-container flex flex-col gap-1 py-4">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="mobile-nav-link focus-ring">
              {link.label}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
            <Link href="/auth/login" className="button-secondary focus-ring text-center" onClick={() => setOpen(false)}>
              Masuk
            </Link>
            <Link href="/umkm" className="button-primary focus-ring text-center" onClick={() => setOpen(false)}>
              Mulai gratis
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
