import { Check, Mic, Target } from "lucide-react";
import { Badge } from "./atoms/Badge";
import { Container } from "./atoms/Container";
import { CTAButtonGroup } from "./molecules/CTAButtonGroup";
import { ProductPreview } from "./ProductPreview";

export function Hero() {
  return (
    <section className="hero-section light-hero relative overflow-hidden pt-28 sm:pt-32">
      <div className="hero-light-pattern" aria-hidden="true" />

      <Container className="relative z-10 grid items-center gap-14 pb-16 lg:min-h-[790px] lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pb-16">
        <div className="hero-copy max-w-[660px] pt-8 lg:pt-0">
          <div className="hero-badge-row">
            <Badge icon={<Mic size={14} />}>Catat lewat suara</Badge>
            <Badge icon={<Target size={14} />}>Pantau kesiapan</Badge>
          </div>
          <h1 className="hero-title mt-7">
            Bicara sebentar.
            <span>Usaha lebih tertata.</span>
          </h1>
          <p className="hero-description mt-7 max-w-[590px] text-base leading-7 sm:text-lg sm:leading-8">
            Tekan tombol rekam, ceritakan transaksi, lalu pantau untung dan kesiapan usaha dari satu layar—tanpa perlu memahami istilah akuntansi.
          </p>
          <CTAButtonGroup primaryHref="/umkm" primaryLabel="Mulai catat gratis" secondaryHref="#cara-kerja" secondaryLabel="Lihat cara kerjanya" secondaryIcon="play" />
          <div className="hero-assurances mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <span className="inline-flex items-center gap-2"><Check aria-hidden="true" size={15} />Tidak perlu paham akuntansi</span>
            <span className="inline-flex items-center gap-2"><Check aria-hidden="true" size={15} />Mulai tanpa biaya</span>
          </div>
        </div>

        <ProductPreview />
      </Container>
    </section>
  );
}
