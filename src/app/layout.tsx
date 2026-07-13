import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WebM → MP4 Dönüştürücü',
  description: 'WebM videolarını cihazınızda H.264 MP4 formatına dönüştürün.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
