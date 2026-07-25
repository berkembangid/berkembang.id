import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Mic, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-showcase" aria-label="Tentang Berkembang.id">
        <Link href="/" className="auth-logo focus-ring" aria-label="Kembali ke halaman utama Berkembang.id">
          <Image
            src="/logo/logo berkembang.webp"
            alt="Berkembang.id"
            width={164}
            height={42}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <div className="auth-showcase-copy">
          <div className="auth-eyebrow"><Sparkles size={14} /> Pendamping usaha berbasis AI</div>
          <h2>Usaha lebih tertata, mulai dari satu percakapan.</h2>
          <p>Catat transaksi dengan bahasa sehari-hari, lalu pantau kondisi dan kesiapan usaha dari satu tempat.</p>

          <div className="auth-voice-preview" aria-hidden="true">
            <div className="auth-voice-input">
              <span><Mic size={17} /></span>
              <div><small>UCAPKAN TRANSAKSI</small><strong>“Hari ini ada penjualan tunai.”</strong></div>
            </div>
            <div className="auth-voice-result">
              <span><Check size={14} strokeWidth={3} /></span>
              <div><strong>Catatan siap diperiksa</strong><small>Detail transaksi sudah dirapikan</small></div>
            </div>
          </div>

          <div className="auth-proof-row">
            <span><Check size={14} /> Tidak perlu paham akuntansi</span>
            <span><Check size={14} /> Data tetap dalam kendali Anda</span>
          </div>
        </div>
      </section>

      <section className="auth-form-panel">
        <Link href="/" className="auth-back-link focus-ring">
          <ArrowLeft size={16} /> Kembali ke beranda
        </Link>
        <div className="auth-form-card">{children}</div>
        <p className="auth-form-footnote">Berkembang.id · Pendamping usaha untuk UMKM Indonesia</p>
      </section>
    </main>
  );
}
