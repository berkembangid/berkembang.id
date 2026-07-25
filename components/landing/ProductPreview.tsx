import {
  Bell,
  Bot,
  ChartNoAxesColumnIncreasing,
  Check,
  FileText,
  Home,
  Mic,
  Target,
  UserRound,
} from "lucide-react";

const profitBars = [28, 43, 37, 61, 49, 72, 66];

export function ProductPreview() {
  return (
    <div
      className="product-stage mobile-product-stage"
      role="img"
      aria-label="Pratinjau aplikasi mobile Berkembang.id untuk mencatat transaksi lewat suara dan memantau kondisi usaha"
    >
      <div className="product-halo" aria-hidden="true" />

      <div className="voice-prompt" aria-hidden="true">
        <span className="voice-prompt-kicker">
          <span className="record-dot" /> Sedang mendengarkan
        </span>
        <p>“Hari ini ada penjualan nasi kotak, pembayarannya tunai.”</p>
        <div className="voice-prompt-result">
          <span><Check size={13} strokeWidth={3} /></span>
          <div>
            <strong>Transaksi tercatat</strong>
            <small>Penjualan berhasil disimpan</small>
          </div>
        </div>
      </div>

      <div className="umkm-phone" aria-hidden="true">
        <div className="phone-speaker" />
        <div className="phone-screen">
          <div className="phone-status">
            <span>Berkembang.id</span>
            <span className="phone-status-bars">● ● ▰</span>
          </div>

          <header className="phone-header">
            <div>
              <span>Selamat pagi,</span>
              <strong>Halo, Ibu Sari!</strong>
            </div>
            <span className="phone-notification"><Bell size={15} /></span>
          </header>

          <main className="phone-content">
            <section className="phone-profit-card">
              <div className="phone-card-heading">
                <div>
                  <span>Ringkasan usaha hari ini</span>
                  <strong>Data usahamu</strong>
                </div>
                <span className="phone-profit-badge">Terbaru</span>
              </div>
              <div className="phone-chart">
                {profitBars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="phone-chart-meta"><span>Sen</span><span>Hari ini</span></div>
            </section>

            <div className="phone-section-title">
              <div>
                <span>Rangkuman bisnis</span>
                <strong>Terpantau secara langsung</strong>
              </div>
              <span className="live-label"><i /> Live</span>
            </div>

            <div className="phone-metrics">
              <article>
                <span className="phone-metric-icon"><FileText size={13} /></span>
                <small>Catatan</small>
                <strong>Tercatat</strong>
              </article>
              <article>
                <span className="phone-metric-icon is-green"><ChartNoAxesColumnIncreasing size={13} /></span>
                <small>Arus kas</small>
                <strong>Positif</strong>
              </article>
              <article>
                <span className="phone-metric-icon is-teal"><Target size={13} /></span>
                <small>Readiness</small>
                <strong>Lihat skor</strong>
              </article>
            </div>

            <section className="phone-coach-card">
              <span className="coach-avatar"><Bot size={17} /></span>
              <div>
                <span>AI Coach</span>
                <strong>Insight dari catatan usahamu</strong>
                <p>Semakin rutin mencatat, semakin jelas arah usahamu.</p>
              </div>
            </section>
          </main>

          <nav className="phone-bottom-nav">
            <span className="is-current"><Home size={15} /><small>Beranda</small></span>
            <span><FileText size={15} /><small>Laporan</small></span>
            <span className="phone-record-button"><Mic size={22} /></span>
            <span><Target size={15} /><small>Kesiapan</small></span>
            <span><UserRound size={15} /><small>Profil</small></span>
          </nav>
        </div>
      </div>

      <div className="record-callout" aria-hidden="true">
        <span><Mic size={15} /></span>
        <p><strong>Tekan, lalu bicara.</strong><small>Catatan langsung masuk ke laporan.</small></p>
      </div>
    </div>
  );
}
