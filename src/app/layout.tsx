import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WebM → MP4 Dönüştürücü',
  description: 'WebM videolarını tarayıcınızda güvenli biçimde MP4 formatına dönüştürün.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f7f9' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
