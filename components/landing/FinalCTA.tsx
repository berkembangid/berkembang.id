import { Sparkles } from "lucide-react";
import { CTAButtonGroup } from "./molecules/CTAButtonGroup";

export function FinalCTA() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="landing-container">
        <div className="final-cta">
          <div className="cta-orb" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-3xl text-center"> 
            <h2 className="mt-6 text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Mulai dari satu catatan hari ini.</h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/65 sm:text-base">Ucapkan transaksi pertama Anda dan lihat usaha tumbuh menjadi data yang lebih bermakna.</p>
            <div className="flex justify-center"><CTAButtonGroup primaryHref="/umkm" primaryLabel="Mulai catat gratis" secondaryHref="/auth/login" secondaryLabel="Masuk ke akun" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
