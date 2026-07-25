import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { InstitutionSection } from "@/components/landing/InstitutionSection";
import { Navbar } from "@/components/landing/Navbar";
import { ProductSections } from "@/components/landing/ProductSections";
import { TrustSection } from "@/components/landing/TrustSection";
import { FAQ } from "@/components/landing/FAQ";

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen overflow-x-clip bg-[#fbf8ff] text-[#141a34]">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <TrustSection />
        <ProductSections />
        <InstitutionSection />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
