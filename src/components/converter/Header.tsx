import { ShieldCheck } from 'lucide-react';

export function Header() {
  return (
    <header className="hero">
      <div className="hero-badge"><ShieldCheck size={18} /> Tamamen tarayıcınızda</div>
      <h1>WebM Dosyanızı MP4&apos;e Dönüştürün</h1>
      <p>Videonuzu yükleyin, H.264/AAC MP4 formatına dönüştürün ve hemen indirin.</p>
      <div className="privacy-strip"><ShieldCheck size={20} /> Dosyanız cihazınızdan ayrılmaz • Sunucuya yüklenmez</div>
    </header>
  );
}
